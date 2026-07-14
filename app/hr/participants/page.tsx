import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { PrototypeBadge } from "@/components/ui/prototype-badge";
import { participantRows } from "@/lib/ist-data";
import { calculateExactAge } from "@/lib/ist-logic";

const referenceDate = "2026-07-13";

export default function HrParticipantsPage() {
  return (
    <AppShell
      eyebrow="Participant Registry"
      title="Daftar peserta"
      description="Data peserta fiktif untuk memvalidasi struktur registry, usia saat tes, dan keterkaitan peserta dengan sesi assessment."
      actions={
        <Link
          href="/hr/participants/new"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-[var(--accent-hover)]"
        >
          Tambah peserta
        </Link>
      }
    >
      <section className="overflow-x-auto rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
            Peserta terdaftar
          </h2>
          <PrototypeBadge>Mock data</PrototypeBadge>
        </div>
        <table className="mt-6 min-w-full text-left">
          <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <tr>
              <th className="pb-3">ID</th>
              <th className="pb-3">Nama</th>
              <th className="pb-3">Tanggal lahir</th>
              <th className="pb-3">Usia saat tes</th>
              <th className="pb-3">Tujuan</th>
              <th className="pb-3">Status sesi</th>
            </tr>
          </thead>
          <tbody className="text-sm text-[var(--text-primary)]">
            {participantRows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--border-subtle)]">
                <td className="py-4 font-mono">{row.id}</td>
                <td className="py-4 font-semibold">{row.name}</td>
                <td className="py-4">{row.birthDate}</td>
                <td className="py-4">{calculateExactAge(row.birthDate, referenceDate)} tahun</td>
                <td className="py-4">{row.purpose}</td>
                <td className="py-4">{row.sessionStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
