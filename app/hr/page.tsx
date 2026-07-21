import Link from "next/link";
import { sessionStatusLabel } from "@/components/hr/session-status-label";
import { AppShell } from "@/components/ui/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import { getDb } from "@/lib/db/client.ts";
import type { SessionStatus } from "@/lib/domain/session-state.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { getDashboardMetrics } from "@/lib/server/metrics.ts";

/** The HR landing page, on real numbers. Org scoping happens inside the metrics service. */
export default async function HrDashboardPage() {
  const db = getDb();
  const ctx = await requireHrUser(db);
  const metrics = await getDashboardMetrics(db, ctx);

  const cards = [
    {
      label: "Sesi dibuat bulan ini",
      value: String(metrics.createdThisMonth),
      detail: "Sejak tanggal 1",
    },
    {
      label: "Sedang berlangsung",
      value: String(metrics.active),
      detail: "Tutorial s.d. subtes terakhir",
    },
    {
      label: "Menunggu kalkulasi",
      value: String(metrics.waitingGeScoring),
      detail: "Periksa kelengkapan kunci GE",
    },
    { label: "Hasil final", value: String(metrics.finalized), detail: "Siap diekspor" },
  ];

  return (
    <AppShell
      title="Selamat datang di Dashboard"
      actions={
        <Link
          href="/hr/sessions/new"
          className="inline-flex h-12 items-center justify-center rounded-lg bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
        >
          Buat sesi baru
        </Link>
      }
    >
      <section className="space-y-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((metric) => (
            <StatCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              detail={metric.detail}
            />
          ))}
        </div>

        <div>
          <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Sesi terbaru
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
                  Aktivitas assessment terbaru
                </h2>
              </div>
              <Link
                href="/hr/sessions"
                className="text-sm font-semibold text-[var(--accent-primary)] hover:underline"
              >
                Semua sesi
              </Link>
            </div>
            {metrics.recentSessions.length === 0 ? (
              <p className="mt-6 rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-base)] p-6 text-sm leading-6 text-[var(--text-secondary)]">
                Belum ada sesi. Mulai dengan menambahkan peserta lalu membuat sesi tes.
              </p>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    <tr>
                      <th className="pb-3">Peserta</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Subtes</th>
                      <th className="pb-3">Progres</th>
                      <th className="pb-3">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm text-[var(--text-primary)]">
                    {metrics.recentSessions.map((row) => (
                      <tr key={row.sessionId} className="border-t border-[var(--border-subtle)]">
                        <td className="py-4 font-semibold">{row.candidateName}</td>
                        <td className="py-4">{sessionStatusLabel(row.status as SessionStatus)}</td>
                        <td className="py-4">{row.currentSubtestCode ?? "—"}</td>
                        <td className="py-4">
                          {row.progress.subtestsCompleted}/9 · {row.progress.answered} jawaban
                        </td>
                        <td className="py-4">
                          <Link
                            href={`/hr/sessions/${row.sessionId}`}
                            className="font-semibold text-[var(--accent-primary)]"
                          >
                            Detail
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </div>
      </section>
    </AppShell>
  );
}
