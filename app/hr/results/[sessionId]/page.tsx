import Link from "next/link";
import { notFound } from "next/navigation";
import { PapiProfile, PapiStageNotice } from "@/components/hr/papi-profile";
import { PapiOnlyActions } from "@/components/hr/papi-only-actions";
import { ResultActions } from "@/components/hr/result-actions";
import { ResultChart } from "@/components/hr/result-chart";
import { sessionStatusLabel } from "@/components/hr/session-status-label";
import { AppShell } from "@/components/ui/app-shell";
import { ApiError } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import {
  ensureAutomaticResult,
  getResult,
  type EnsureAutomaticResultOutcome,
  type ResultDto,
} from "@/lib/server/calculate.ts";
import { getSessionDetail } from "@/lib/server/hr.ts";
import { logError } from "@/lib/server/logger.ts";
import {
  getPapiResult,
  getPapiStage,
  type PapiResultDto,
  type PapiStageDto,
} from "@/lib/server/papi-result-read.ts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const RESULT_STATUS_LABELS: Record<string, string> = {
  waiting_ge: "Menunggu GE",
  draft: "Draft",
  reviewed: "Reviewed",
  final: "Final",
  superseded: "Superseded",
};

export default async function HrResultPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const db = getDb();
  const ctx = await requireHrUser(db);

  let detail;
  try {
    detail = await getSessionDetail(db, ctx, sessionId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  let result: ResultDto | null = null;
  let automaticResult: EnsureAutomaticResultOutcome | null = null;
  let isForbidden = false;
  try {
    automaticResult = await ensureAutomaticResult(db, ctx, sessionId);
    if (automaticResult.kind === "calculated" || automaticResult.kind === "needs_review") {
      detail = await getSessionDetail(db, ctx, sessionId);
    }
    result = await getResult(db, ctx, sessionId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      isForbidden = true;
    } else if (!(error instanceof ApiError) || error.status !== 404) {
      throw error;
    }
  }

  let papiStage: PapiStageDto | null = null;
  let papiResult: PapiResultDto | null = null;
  // Kegagalan membaca modul PAPI tidak boleh mematikan seluruh halaman hasil IST.
  let papiUnavailable = false;
  if (!isForbidden) {
    try {
      papiStage = await getPapiStage(db, ctx, sessionId);
      if (papiStage.includesPapi) {
        papiResult = await getPapiResult(db, ctx, sessionId);
      }
    } catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        // Tidak berizin atau sesi tanpa data PAPI — bagian PAPI cukup disembunyikan.
      } else {
        // Umumnya skema PAPI belum termigrasi. Ditampilkan, bukan disembunyikan.
        papiUnavailable = true;
        logError("papi_section_unavailable", { sessionId }, error);
      }
    }
  }

  if (isForbidden) {
    return (
      <AppShell title={`Hasil — ${detail.candidate.fullName}`}>
        <article className="rounded-xl border border-border bg-card p-8">
          <p className="text-sm leading-6 text-muted-foreground">
            Akun Anda tidak memiliki izin <code>view_results</code> untuk melihat hasil tes. Hubungi
            Super Admin.
          </p>
        </article>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`Hasil — ${detail.candidate.fullName}`}
      actions={
        result?.status === "final" ? (
          <Link
            href={`/hr/reports/${sessionId}`}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Laporan PDF
          </Link>
        ) : undefined
      }
    >
      <section className="space-y-6 pb-5">
        {papiStage?.includesPapi && !papiStage.includesIst ? (
          <PapiOnlyActions sessionId={detail.sessionId} isFinal={papiResult?.status === "final"} />
        ) : (
          <ResultActions
            sessionId={detail.sessionId}
            resultId={result?.resultId ?? null}
            resultStatus={result?.status ?? null}
            sessionStatus={detail.status}
          />
        )}

        {!result ? (
          <article className="rounded-xl border border-dashed border-border bg-card p-8">
            peserta hanya menyelesaikan tes PAPI, sehingga tidak ada hasil IST yang dapat
            ditampilkan.
          </article>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
              <article className="rounded-xl border border-border bg-card p-6">
                <div className="flex flex-wrap gap-3">
                  <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-foreground">
                    {RESULT_STATUS_LABELS[result.status] ?? result.status}
                  </span>
                  {result.normBandLabel ? (
                    <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
                      Norm band {result.normBandLabel}
                    </span>
                  ) : null}
                </div>
                <div className="mt-6 grid gap-3 text-sm text-muted-foreground">
                  <p>
                    <strong className="text-foreground">Peserta:</strong>{" "}
                    {result.candidate.fullName}
                  </p>
                  <p>
                    <strong className="text-foreground">Usia saat tes:</strong> {result.ageAtTest}{" "}
                    tahun · tanggal tes {result.testDate}
                  </p>
                  <p>
                    <strong className="text-foreground">IQ:</strong> {result.iq.score ?? "—"} ·{" "}
                    {result.iq.category ?? "—"}
                  </p>
                  <p>
                    <strong className="text-foreground">Dominansi:</strong>{" "}
                    {result.dominance.dominance ?? "—"}
                  </p>
                  <p>
                    <strong className="text-foreground">Total:</strong> RW {result.totals.rawScore}{" "}
                    · SW {result.totals.standardScore}
                  </p>
                </div>
              </article>

              <article className="rounded-xl border border-border p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Grafik sembilan subtes (SW)
                </p>
                <ResultChart subtests={result.subtests} />
              </article>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border bg-card p-6">
              <Table className="min-w-full text-left">
                <TableHeader className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  <TableRow>
                    <TableHead className="pb-3">Subtes</TableHead>
                    <TableHead className="pb-3">RW</TableHead>
                    <TableHead className="pb-3">SW</TableHead>
                    <TableHead className="pb-3">Kategori</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-sm text-foreground">
                  {result.subtests.map((subtest) => (
                    <TableRow key={subtest.code} className="border-t border-border">
                      <TableCell className="py-4 font-semibold">
                        {subtest.code}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {subtest.title}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">{subtest.rawScore}</TableCell>
                      <TableCell className="py-4">{subtest.standardScore}</TableCell>
                      <TableCell className="py-4">{subtest.category}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {papiUnavailable ? (
          <article className="rounded-xl border border-dashed border-border bg-card p-6">
            <h2 className="text-sm font-bold text-foreground">PAPI Kostick</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Modul PAPI belum dapat dibaca dari database. Umumnya ini berarti migrasi skema terbaru
              belum dijalankan. Periksa dengan{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">npm run db:check-papi</code>,
              lalu jalankan{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">npm run db:migrate</code> dan{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">npm run db:seed</code>. Hasil
              IST di atas tidak terpengaruh.
            </p>
          </article>
        ) : papiStage?.includesPapi ? (
          papiResult ? (
            <PapiProfile result={papiResult} />
          ) : (
            <PapiStageNotice
              skipped={papiStage.skipped}
              skipReason={papiStage.skipReason}
              sessionStatusLabel={sessionStatusLabel(detail.status)}
            />
          )
        ) : null}
      </section>
    </AppShell>
  );
}
