import Link from "next/link";
import { notFound } from "next/navigation";
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

const RESULT_STATUS_LABELS: Record<string, string> = {
  waiting_ge: "Menunggu GE",
  draft: "Draft",
  reviewed: "Reviewed",
  final: "Final",
  superseded: "Superseded",
};

/**
 * The result page: identity, versions, the §16 table + chart from
 * ONE server DTO, and the lifecycle actions. `view_results` is enforced by `getResult` itself; a
 * session that has no result yet still renders with its next operational step.
 */
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
      // The account is HR but lacks `view_results` (spec §4.3) — say so instead of erroring.
      isForbidden = true;
    } else if (!(error instanceof ApiError) || error.status !== 404) {
      throw error;
    }
  }

  if (isForbidden) {
    return (
      <AppShell title={`Hasil — ${detail.candidate.fullName}`}>
        <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-8">
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
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
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
          >
            Laporan PDF
          </Link>
        ) : undefined
      }
    >
      <section className="space-y-6 pb-5">
        <ResultActions
          sessionId={detail.sessionId}
          resultId={result?.resultId ?? null}
          resultStatus={result?.status ?? null}
          sessionStatus={detail.status}
        />

        {!result ? (
          <article className="rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--surface-panel)] p-8">
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              Belum ada hasil untuk sesi ini. Status sesi saat ini:{" "}
              <strong className="text-[var(--text-primary)]">
                {sessionStatusLabel(detail.status)}
              </strong>
              {automaticResult?.kind === "ge_key_required" ? (
                <>
                  {" "}
                  — lengkapi{" "}
                  <Link
                    href="/hr/question-bank"
                    className="font-semibold text-[var(--accent-primary)]"
                  >
                    kunci jawaban GE
                  </Link>{" "}
                  agar sistem dapat menghitung otomatis.
                </>
              ) : null}
            </p>
          </article>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
              <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
                <div className="flex flex-wrap gap-3">
                  <span className="inline-flex items-center rounded-full bg-[var(--accent-warm-soft)] px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-primary)]">
                    {RESULT_STATUS_LABELS[result.status] ?? result.status}
                  </span>
                  {result.normBandLabel ? (
                    <span className="inline-flex items-center rounded-full border border-[var(--border-default)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                      Norm band {result.normBandLabel}
                    </span>
                  ) : null}
                </div>
                <div className="mt-6 grid gap-3 text-sm text-[var(--text-secondary)]">
                  <p>
                    <strong className="text-[var(--text-primary)]">Peserta:</strong>{" "}
                    {result.candidate.fullName}
                  </p>
                  <p>
                    <strong className="text-[var(--text-primary)]">Usia saat tes:</strong>{" "}
                    {result.ageAtTest} tahun · tanggal tes {result.testDate}
                  </p>
                  <p>
                    <strong className="text-[var(--text-primary)]">IQ:</strong>{" "}
                    {result.iq.score ?? "—"} · {result.iq.category ?? "—"}
                  </p>
                  <p>
                    <strong className="text-[var(--text-primary)]">Dominansi:</strong>{" "}
                    {result.dominance.dominance ?? "—"}
                  </p>
                  <p>
                    <strong className="text-[var(--text-primary)]">Total:</strong> RW{" "}
                    {result.totals.rawScore} · SW {result.totals.standardScore}
                  </p>
                </div>
              </article>

              <article className="rounded-2xl border border-[var(--border-default)] p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Grafik sembilan subtes (SW)
                </p>
                <ResultChart subtests={result.subtests} />
              </article>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
              <table className="min-w-full text-left">
                <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  <tr>
                    <th className="pb-3">Subtes</th>
                    <th className="pb-3">RW</th>
                    <th className="pb-3">SW</th>
                    <th className="pb-3">Kategori</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-[var(--text-primary)]">
                  {result.subtests.map((subtest) => (
                    <tr key={subtest.code} className="border-t border-[var(--border-subtle)]">
                      <td className="py-4 font-semibold">
                        {subtest.code}
                        <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                          {subtest.title}
                        </span>
                      </td>
                      <td className="py-4">{subtest.rawScore}</td>
                      <td className="py-4">{subtest.standardScore}</td>
                      <td className="py-4">{subtest.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
