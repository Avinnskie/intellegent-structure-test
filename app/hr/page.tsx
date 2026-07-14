import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { PrototypeBadge } from "@/components/ui/prototype-badge";
import { StatCard } from "@/components/ui/stat-card";
import { hrMetrics, sessionRows } from "@/lib/ist-data";

export default function HrDashboardPage() {
  return (
    <AppShell
      eyebrow="Learning operations"
      title="Selamat datang, Alya"
      description="Pantau kelas assessment, lanjutkan penilaian GE, dan selesaikan hasil yang menunggu tindakan hari ini."
      actions={
        <Link
          href="/hr/sessions/new"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-[var(--accent-hover)]"
        >
          Buat sesi demo
        </Link>
      }
    >
      <section className="space-y-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {hrMetrics.map((metric) => (
            <StatCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              detail={metric.detail}
            />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Sesi terbaru
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
                  Aktivitas assessment terbaru
                </h2>
              </div>
              <PrototypeBadge>Mock data</PrototypeBadge>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  <tr>
                    <th className="pb-3">Sesi</th>
                    <th className="pb-3">Peserta</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Subtes</th>
                    <th className="pb-3">Kosong</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-[var(--text-primary)]">
                  {sessionRows.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--border-subtle)]">
                      <td className="py-4 font-mono">{row.id}</td>
                      <td className="py-4">{row.candidate}</td>
                      <td className="py-4">{row.status}</td>
                      <td className="py-4">{row.subtest}</td>
                      <td className="py-4">{row.unanswered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--accent-soft)] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Tindakan cepat
            </p>
            <div className="mt-5 grid gap-3">
              {[
                ["Generate code demo baru", "/hr/sessions/new"],
                ["Tambah peserta demo", "/hr/participants/new"],
                ["Buka detail sesi SES-018", "/hr/sessions/SES-018"],
                ["Nilai GE untuk SES-018", "/hr/scoring/SES-018/ge"],
                ["Lihat hasil SES-018", "/hr/results/SES-018"],
                ["Kelola tutorial subtes", "/hr/tutorials"],
                ["Kelola bank soal", "/hr/question-bank"],
              ].map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] px-5 py-4 text-sm font-semibold text-[var(--text-primary)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-subtle)]"
                >
                  {label}
                </Link>
              ))}
            </div>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
