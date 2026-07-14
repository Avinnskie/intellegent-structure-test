import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { PrototypeBadge } from "@/components/ui/prototype-badge";
import { sessionRows } from "@/lib/ist-data";

export default function HrSessionsPage() {
  return (
    <AppShell
      eyebrow="Session Registry"
      title="Pembuatan sesi dan kode akses demo"
      description="Simulasi generate code, copy, revoke, dan regenerate tersedia di halaman ini untuk menguji alur operasional HR."
    >
      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--accent-soft)] p-6">
          <PrototypeBadge tone="info">Generate code simulation</PrototypeBadge>
          <h2 className="mt-5 text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
            Buat sesi baru
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            Pilih peserta, tetapkan tanggal dan tujuan tes, lalu generate kode akses unik.
            Regenerate menonaktifkan kode lama; revoke mencabut kode aktif tanpa membuat sesi baru.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/hr/sessions/new"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-[var(--accent-hover)]"
            >
              Buat sesi & generate kode
            </Link>
            <Link
              href="/hr/participants/new"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
            >
              Tambah peserta dulu
            </Link>
          </div>
        </article>

        <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
              Daftar sesi
            </h2>
            <PrototypeBadge>3 demo rows</PrototypeBadge>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
                <tr>
                  <th className="pb-3">ID</th>
                  <th className="pb-3">Peserta</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Kode</th>
                  <th className="pb-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {sessionRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-[var(--border-subtle)] text-[var(--text-primary)]"
                  >
                    <td className="py-4 font-mono">{row.id}</td>
                    <td className="py-4">{row.candidate}</td>
                    <td className="py-4">{row.status}</td>
                    <td className="py-4 font-mono">{row.access}</td>
                    <td className="py-4">
                      <Link
                        href={`/hr/sessions/${row.id}`}
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
        </article>
      </section>
    </AppShell>
  );
}
