import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors.ts";
import { getServerConfig } from "../config.ts";
import type { DbLike } from "../db/client.ts";
import { assessmentResults, assessmentSessions, reports } from "../db/schema.ts";
import type { StorageProvider } from "../providers/storage.ts";
import type { AuthContext } from "./authz.ts";
import { writeAudit } from "./audit.ts";
import { requirePermission } from "./authz.ts";
import { getResult } from "./calculate.ts";
import { getPapiResult, getPapiStage } from "./papi-result-read.ts";
import { renderReportPdf } from "./report-pdf.ts";

const NOT_FOUND_MESSAGE = "Data tidak ditemukan.";
const NOT_FINAL_MESSAGE = "Laporan hanya dapat dibuat dari hasil yang sudah final.";
const SIGNED_URL_TTL_SECONDS = 120;

function notFound(): ApiError {
  return new ApiError("NOT_FOUND", NOT_FOUND_MESSAGE, 404);
}

export type ReportDto = {
  reportId: string;
  resultId: string;
  sessionId: string;
  reportVersion: number;
  fileHash: string;
  generatedAt: string;
};

type ResultRow = { id: string; sessionId: string; status: string };

async function loadResult(db: DbLike, ctx: AuthContext, resultId: string): Promise<ResultRow> {
  if (!z.uuid().safeParse(resultId).success) {
    throw notFound();
  }
  const [row] = await db
    .select({
      id: assessmentResults.id,
      sessionId: assessmentResults.sessionId,
      status: assessmentResults.status,
    })
    .from(assessmentResults)
    .innerJoin(assessmentSessions, eq(assessmentResults.sessionId, assessmentSessions.id))
    .where(
      and(
        eq(assessmentResults.id, resultId),
        eq(assessmentSessions.organizationId, ctx.organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    throw notFound();
  }
  return row;
}

export async function generateReport(
  db: DbLike,
  storage: StorageProvider,
  ctx: AuthContext,
  resultId: string,
): Promise<ReportDto> {
  requirePermission(ctx, "view_results");
  const result = await loadResult(db, ctx, resultId);
  if (result.status !== "final") {
    throw new ApiError("RESULT_NOT_FINAL", NOT_FINAL_MESSAGE, 409);
  }

  const dto = await getResult(db, ctx, result.sessionId);

  // Lampiran PAPI di-load bersamaan agar satu PDF memuat kedua instrumen.
  const papiStage = await getPapiStage(db, ctx, result.sessionId);
  const papiAttachment = papiStage.includesPapi
    ? { stage: papiStage, result: await getPapiResult(db, ctx, result.sessionId) }
    : null;

  const pdf = await renderReportPdf(dto, papiAttachment);
  const fileHash = createHash("sha256").update(pdf).digest("hex");

  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ reportVersion: reports.reportVersion })
      .from(reports)
      .where(eq(reports.resultId, result.id))
      .orderBy(desc(reports.reportVersion))
      .limit(1);
    const reportVersion = (latest?.reportVersion ?? 0) + 1;

    const [row] = await tx
      .insert(reports)
      .values({
        resultId: result.id,
        reportVersion,
        storageReference: "pending",
        fileHash,
        generatedBy: ctx.userId,
      })
      .returning({ id: reports.id, generatedAt: reports.generatedAt });
    if (!row) {
      throw new Error("Baris laporan gagal dibuat.");
    }

    const storageReference = `reports/${result.sessionId}/${row.id}.pdf`;
    await storage.upload(
      getServerConfig().SUPABASE_REPORT_BUCKET,
      storageReference,
      new Uint8Array(pdf),
      "application/pdf",
    );
    await tx.update(reports).set({ storageReference }).where(eq(reports.id, row.id));

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "report.generated",
      objectType: "report",
      objectId: row.id,
      metadata: {
        sessionId: result.sessionId,
        resultId: result.id,
        reportVersion,
        fileHash,
      },
    });

    return {
      reportId: row.id,
      resultId: result.id,
      sessionId: result.sessionId,
      reportVersion,
      fileHash,
      generatedAt: row.generatedAt.toISOString(),
    };
  });
}

export async function getReportDownload(
  db: DbLike,
  storage: StorageProvider,
  ctx: AuthContext,
  reportId: string,
): Promise<{ url: string; fileHash: string }> {
  requirePermission(ctx, "view_results");
  if (!z.uuid().safeParse(reportId).success) {
    throw notFound();
  }

  const [row] = await db
    .select({
      id: reports.id,
      storageReference: reports.storageReference,
      fileHash: reports.fileHash,
      sessionId: assessmentResults.sessionId,
    })
    .from(reports)
    .innerJoin(assessmentResults, eq(reports.resultId, assessmentResults.id))
    .innerJoin(assessmentSessions, eq(assessmentResults.sessionId, assessmentSessions.id))
    .where(and(eq(reports.id, reportId), eq(assessmentSessions.organizationId, ctx.organizationId)))
    .limit(1);
  if (!row || row.storageReference === "pending") {
    throw notFound();
  }

  const url = await storage.createSignedUrl(
    getServerConfig().SUPABASE_REPORT_BUCKET,
    row.storageReference,
    SIGNED_URL_TTL_SECONDS,
  );

  await writeAudit(db, {
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.userId,
    action: "report.downloaded",
    objectType: "report",
    objectId: row.id,
    metadata: { sessionId: row.sessionId, reportId: row.id },
  });

  return { url, fileHash: row.fileHash };
}

export type ReportHistoryRow = {
  reportId: string;
  reportVersion: number;
  fileHash: string;
  generatedBy: string;
  generatedAt: string;
};

export async function listReports(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<ReportHistoryRow[]> {
  if (!z.uuid().safeParse(sessionId).success) {
    return [];
  }
  const rows = await db
    .select({
      reportId: reports.id,
      reportVersion: reports.reportVersion,
      fileHash: reports.fileHash,
      generatedBy: reports.generatedBy,
      generatedAt: reports.generatedAt,
    })
    .from(reports)
    .innerJoin(assessmentResults, eq(reports.resultId, assessmentResults.id))
    .innerJoin(assessmentSessions, eq(assessmentResults.sessionId, assessmentSessions.id))
    .where(
      and(
        eq(assessmentResults.sessionId, sessionId),
        eq(assessmentSessions.organizationId, ctx.organizationId),
      ),
    )
    .orderBy(desc(reports.generatedAt));

  return rows.map((row) => ({
    reportId: row.reportId,
    reportVersion: row.reportVersion,
    fileHash: row.fileHash,
    generatedBy: row.generatedBy,
    generatedAt: row.generatedAt.toISOString(),
  }));
}
