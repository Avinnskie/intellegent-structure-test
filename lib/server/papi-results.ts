import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors.ts";
import type { DbLike } from "../db/client.ts";
import { renderToBuffer } from "@react-pdf/renderer";
import { assessmentSessions, candidates, papiResults } from "../db/schema.ts";
import { assertSessionTransition } from "../domain/session-state.ts";
import type { AuthContext } from "./authz.ts";
import { writeAudit } from "./audit.ts";
import { requirePermission } from "./authz.ts";
import { getPapiResult } from "./papi-result-read.ts";
import { buildPapiOnlyDocument } from "./report-pdf-papi.ts";

/**
 * Finalisasi hasil untuk sesi PAPI-saja.
 *
 * Terpisah dari `finalizeResult` di `results.ts` karena keduanya mengunci baris
 * yang berbeda: yang itu `assessment_results` (hasil IST), yang ini
 * `papi_results`. Sesi PAPI-saja tidak punya baris IST sama sekali, sehingga
 * jalur lama tidak punya apa pun untuk difinalisasi.
 *
 * Digabung jadi satu fungsi pun tidak membantu — pemeriksaan status, tabel yang
 * dikunci, dan jejak auditnya berbeda seluruhnya. Yang perlu sama hanyalah
 * akibatnya pada sesi: statusnya menjadi `final` dan tidak dapat diubah lagi.
 */

const NOT_FOUND_MESSAGE = "Data tidak ditemukan.";
const LOCKED_MESSAGE = "Hasil PAPI ini sudah final dan terkunci.";
const NOT_PAPI_ONLY_MESSAGE =
  "Sesi ini memuat IST. Gunakan finalisasi hasil biasa, bukan finalisasi PAPI.";
const NO_RESULT_MESSAGE = "Belum ada hasil PAPI untuk sesi ini.";

export type FinalizePapiDto = {
  papiResultId: string;
  sessionId: string;
  status: "final";
};

export async function finalizePapiOnlyResult(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<FinalizePapiDto> {
  requirePermission(ctx, "view_results");
  if (!z.uuid().safeParse(sessionId).success) {
    throw new ApiError("NOT_FOUND", NOT_FOUND_MESSAGE, 404);
  }

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        id: assessmentSessions.id,
        status: assessmentSessions.status,
        includesIst: assessmentSessions.includesIst,
      })
      .from(assessmentSessions)
      .where(
        and(
          eq(assessmentSessions.id, sessionId),
          eq(assessmentSessions.organizationId, ctx.organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!session) {
      throw new ApiError("NOT_FOUND", NOT_FOUND_MESSAGE, 404);
    }

    /**
     * Sesi baterai sengaja ditolak di sini.
     *
     * Pada sesi yang memuat IST, hasil PAPI hanyalah lampiran di belakang hasil
     * utama. Memfinalisasi PAPI-nya sendiri akan mengunci sesi sementara skor
     * IST belum ditinjau siapa pun — dan laporan yang keluar kemudian tidak
     * lengkap tanpa ada yang menyadarinya.
     */
    if (session.includesIst === 1) {
      throw new ApiError("NOT_PAPI_ONLY", NOT_PAPI_ONLY_MESSAGE, 409);
    }

    const [result] = await tx
      .select({ id: papiResults.id, status: papiResults.status })
      .from(papiResults)
      .where(and(eq(papiResults.sessionId, session.id), isNull(papiResults.supersededById)))
      .for("update")
      .limit(1);
    if (!result) {
      throw new ApiError("NO_PAPI_RESULT", NO_RESULT_MESSAGE, 409);
    }
    if (result.status === "final") {
      throw new ApiError("RESULT_LOCKED", LOCKED_MESSAGE, 409);
    }

    assertSessionTransition(session.status, "final");

    const now = new Date();
    await tx
      .update(papiResults)
      .set({ status: "final", finalizedBy: ctx.userId, finalizedAt: now })
      .where(eq(papiResults.id, result.id));
    await tx
      .update(assessmentSessions)
      .set({ status: "final" })
      .where(eq(assessmentSessions.id, session.id));

    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.userId,
      action: "papi_result.finalized",
      objectType: "papi_result",
      objectId: result.id,
      metadata: { sessionId: session.id, papiResultId: result.id },
    });

    return { papiResultId: result.id, sessionId: session.id, status: "final" as const };
  });
}

/**
 * Merender laporan PAPI-saja sebagai PDF, tanpa mengarsipkannya.
 *
 * Laporan IST disimpan berversi di tabel `reports`, yang barisnya menunjuk ke
 * `assessment_results` — baris yang tidak pernah ada pada sesi PAPI-saja.
 * Mengarsipkan di sini menuntut perubahan skema, dan itu belum tentu sepadan:
 * PDF ini dapat dibuat ulang kapan saja dari hasil yang sudah tersimpan, dan
 * isinya tidak berubah setelah difinalisasi.
 *
 * Konsekuensinya jujur disebut: tidak ada riwayat siapa mengunduh apa dan
 * kapan, tidak seperti laporan IST. Kalau jejak itu dibutuhkan, `reports` perlu
 * kolom `papi_result_id` dan `result_id` yang boleh kosong.
 */
export async function renderPapiOnlyReport(
  db: DbLike,
  ctx: AuthContext,
  sessionId: string,
): Promise<{ pdf: Buffer; fileName: string }> {
  requirePermission(ctx, "view_results");

  const [session] = await db
    .select({
      id: assessmentSessions.id,
      includesIst: assessmentSessions.includesIst,
      candidateName: candidates.fullName,
      testPurpose: candidates.testPurpose,
    })
    .from(assessmentSessions)
    .innerJoin(candidates, eq(assessmentSessions.candidateId, candidates.id))
    .where(
      and(
        eq(assessmentSessions.id, sessionId),
        eq(assessmentSessions.organizationId, ctx.organizationId),
      ),
    )
    .limit(1);
  if (!session) {
    throw new ApiError("NOT_FOUND", NOT_FOUND_MESSAGE, 404);
  }
  if (session.includesIst === 1) {
    throw new ApiError("NOT_PAPI_ONLY", NOT_PAPI_ONLY_MESSAGE, 409);
  }

  const papi = await getPapiResult(db, ctx, sessionId);
  if (!papi) {
    throw new ApiError("NO_PAPI_RESULT", NO_RESULT_MESSAGE, 409);
  }

  const pdf = await renderToBuffer(
    buildPapiOnlyDocument(papi, {
      name: session.candidateName,
      testPurpose: session.testPurpose,
    }),
  );

  const namaBerkas = session.candidateName.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  return { pdf, fileName: `papi-${namaBerkas || "peserta"}.pdf` };
}
