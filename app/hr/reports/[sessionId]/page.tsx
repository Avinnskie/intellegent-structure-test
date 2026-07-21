import Link from "next/link";
import { notFound } from "next/navigation";
import { GenerateReportButton } from "@/components/hr/report-actions";
import { ResultChart } from "@/components/hr/result-chart";
import { sessionStatusLabel } from "@/components/hr/session-status-label";
import { AppShell } from "@/components/ui/app-shell";
import { ApiError } from "@/lib/api/errors.ts";
import { getDb } from "@/lib/db/client.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { getResult, type ResultDto } from "@/lib/server/calculate.ts";
import { getSessionDetail } from "@/lib/server/hr.ts";
import { listReports } from "@/lib/server/reports.ts";

export default async function HrReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
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
  try {
    result = await getResult(db, ctx, sessionId);
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 403)) {
      throw error;
    }
    if (error.status === 403) {
      return (
        <AppShell title={`Laporan — ${detail.candidate.fullName}`}>
          <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-8">
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
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
          <article className="rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--surface-panel)] p-8">
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              Laporan PDF hanya dapat dibuat dari hasil yang sudah <strong>final</strong> (spec:
              hasil belum dapat diekspor sebelum final). Status saat ini:{" "}
              <strong className="text-[var(--text-primary)]">
                {result ? result.status : sessionStatusLabel(detail.status)}
              </strong>
              .{" "}
              <Link
                href={`/hr/results/${sessionId}`}
                className="font-semibold text-[var(--accent-primary)]"
              >
                Buka halaman hasil
              </Link>{" "}
              untuk menghitung, me-review, dan memfinalisasi.
            </p>
          </article>
        ) : result ? (
          <>
            <GenerateReportButton resultId={result.resultId} />

            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Pratinjau isi laporan
                </p>
                <div className="mt-5 grid gap-3 text-sm text-[var(--text-secondary)]">
                  <p>
                    <strong className="text-[var(--text-primary)]">Nama:</strong>{" "}
                    {result.candidate.fullName}
                  </p>
                  <p>
                    <strong className="text-[var(--text-primary)]">Tanggal tes:</strong>{" "}
                    {result.testDate} · usia {result.ageAtTest} tahun · band{" "}
                    {result.normBandLabel ?? "—"}
                  </p>
                  <p>
                    <strong className="text-[var(--text-primary)]">IQ:</strong>{" "}
                    {result.iq.score ?? "—"} · {result.iq.category ?? "—"} · dominansi{" "}
                    {result.dominance.dominance ?? "—"}
                  </p>
                  <p>
                    <strong className="text-[var(--text-primary)]">Total:</strong> RW{" "}
                    {result.totals.rawScore} · SW {result.totals.standardScore}
                  </p>
                </div>
                <p className="mt-5 rounded-xl border border-dashed border-[var(--status-warning)] bg-[color-mix(in_srgb,var(--status-warning)_8%,white)] p-4 text-xs leading-5 text-[var(--text-secondary)]">
                  Footer laporan: &ldquo;Laporan ini tidak memuat keputusan otomatis
                  diterima/ditolak.&rdquo;
                </p>
              </article>

              <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--accent-warm-soft)] p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Grafik yang tercetak di laporan
                </p>
                <ResultChart subtests={result.subtests} />
              </article>
            </div>

            <article className="overflow-x-auto rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
              <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">
                Riwayat laporan
              </h2>
              {history.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
                  Belum ada PDF yang dibuat untuk hasil ini.
                </p>
              ) : (
                <table className="mt-4 min-w-full text-left">
                  <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    <tr>
                      <th className="pb-3">Versi</th>
                      <th className="pb-3">SHA-256</th>
                      <th className="pb-3">Dibuat</th>
                      <th className="pb-3">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm text-[var(--text-primary)]">
                    {history.map((row) => (
                      <tr key={row.reportId} className="border-t border-[var(--border-subtle)]">
                        <td className="py-4 font-semibold">v{row.reportVersion}</td>
                        <td className="py-4 font-mono text-xs">{row.fileHash.slice(0, 16)}…</td>
                        <td className="py-4">
                          {new Date(row.generatedAt).toLocaleString("id-ID")}
                        </td>
                        <td className="py-4">
                          <a
                            href={`/api/hr/results/${row.reportId}/report`}
                            className="font-semibold text-[var(--accent-primary)] hover:underline"
                          >
                            Unduh
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>
          </>
        ) : null}
      </section>
    </AppShell>
  );
}
