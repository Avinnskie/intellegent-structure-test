import Link from "next/link";
import { notFound } from "next/navigation";
import { GenerateReportButton } from "@/components/hr/report-actions";
import { ReportHistoryDataTable } from "@/components/hr/report-history-data-table";
import { ResultChart } from "@/components/hr/result-chart";
import { sessionStatusLabel } from "@/components/hr/session-status-label";
import { AppShell } from "@/components/ui/app-shell";
import { ApiError } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { getResult, type ResultDto } from "@/lib/server/calculate.ts";
import { getSessionDetail } from "@/lib/server/hr.ts";
import { requirePortalUser } from "@/lib/server/portal-guard.ts";
import { listReports } from "@/lib/server/reports.ts";

export default async function HrReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const db = getDb();
  const ctx = await requirePortalUser();

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
  try {
    result = await getResult(db, ctx, sessionId);
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 403)) {
      throw error;
    }
    if (error.status === 403) {
      return (
        <AppShell title={`Laporan — ${detail.candidate.fullName}`}>
          <article className="rounded-xl border border-border bg-card p-8">
            <p className="text-sm leading-6 text-muted-foreground">
              Akun Anda tidak memiliki izin <code>view_results</code>. Hubungi Super Admin.
            </p>
          </article>
        </AppShell>
      );
    }
  }

  const isFinal = result?.status === "final";
  const history = isFinal ? await listReports(db, ctx, sessionId) : [];

  return (
    <AppShell title={`Laporan — ${detail.candidate.fullName}`}>
      <section className="space-y-6 ">
        {!isFinal ? (
          <article className="rounded-xl border border-dashed border-border bg-card p-8">
            <p className="text-sm leading-6 text-muted-foreground">
              Laporan PDF hanya dapat dibuat dari hasil yang sudah <strong>final</strong> (spec:
              hasil belum dapat diekspor sebelum final). Status saat ini:{" "}
              <strong className="text-foreground">
                {result ? result.status : sessionStatusLabel(detail.status)}
              </strong>
              .{" "}
              <Link href={`/hr/results/${sessionId}`} className="font-semibold text-primary">
                Buka halaman hasil
              </Link>{" "}
              untuk menghitung, me-review, dan memfinalisasi.
            </p>
          </article>
        ) : result ? (
          <>
            <GenerateReportButton resultId={result.resultId} />

            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <article className="rounded-xl border border-border bg-card p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Pratinjau isi laporan
                </p>
                <div className="mt-5 grid gap-3 text-sm text-muted-foreground">
                  <p>
                    <strong className="text-foreground">Nama:</strong> {result.candidate.fullName}
                  </p>
                  <p>
                    <strong className="text-foreground">Tanggal tes:</strong> {result.testDate} ·
                    usia {result.ageAtTest} tahun · band {result.normBandLabel ?? "—"}
                  </p>
                  <p>
                    <strong className="text-foreground">IQ:</strong> {result.iq.score ?? "—"} ·{" "}
                    {result.iq.category ?? "—"} · dominansi {result.dominance.dominance ?? "—"}
                  </p>
                  <p>
                    <strong className="text-foreground">Total:</strong> RW {result.totals.rawScore}{" "}
                    · SW {result.totals.standardScore}
                  </p>
                </div>
                <p className="mt-5 rounded-xl border border-dashed border-[var(--color-amber-500, #f59e0b)] bg-[color-mix(in_srgb,var(--color-amber-500, #f59e0b)_8%,white)] p-4 text-xs leading-5 text-muted-foreground">
                  Footer laporan: &ldquo;Laporan ini tidak memuat keputusan otomatis
                  diterima/ditolak.&rdquo;
                </p>
              </article>

              <article className="rounded-xl border border-border bg-accent p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Grafik yang tercetak di laporan
                </p>
                <ResultChart subtests={result.subtests} />
              </article>
            </div>

            <article className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-bold tracking-[-0.02em] text-foreground">
                Riwayat laporan
              </h2>
              {history.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Belum ada PDF yang dibuat untuk hasil ini.
                </p>
              ) : (
                <ReportHistoryDataTable rows={history} />
              )}
            </article>
          </>
        ) : null}
      </section>
    </AppShell>
  );
}
