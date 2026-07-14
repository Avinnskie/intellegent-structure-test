import { AppShell } from "@/components/ui/app-shell";
import { PrototypeBadge } from "@/components/ui/prototype-badge";
import { auditRows } from "@/lib/ist-data";

export default function AdminAuditPage() {
  return (
    <AppShell
      eyebrow="Admin"
      title="Audit log"
      description="Setiap tindakan lihat, ubah, nilai, finalisasi, unduh, dan re-score tercatat. Audit trail tidak dapat dihapus oleh HR Admin."
    >
      <section className="overflow-x-auto rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
            Aktivitas terbaru
          </h2>
          <PrototypeBadge>Mock data</PrototypeBadge>
        </div>
        <table className="mt-6 min-w-full text-left">
          <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <tr>
              <th className="pb-3">Waktu</th>
              <th className="pb-3">Actor</th>
              <th className="pb-3">Action</th>
              <th className="pb-3">Object</th>
              <th className="pb-3">Detail</th>
            </tr>
          </thead>
          <tbody className="text-sm text-[var(--text-primary)]">
            {auditRows.map((row) => (
              <tr
                key={`${row.time}-${row.action}`}
                className="border-t border-[var(--border-subtle)]"
              >
                <td className="py-4 whitespace-nowrap text-[var(--text-secondary)]">{row.time}</td>
                <td className="py-4">{row.actor}</td>
                <td className="py-4 font-mono text-xs">{row.action}</td>
                <td className="py-4 font-mono text-xs">{row.object}</td>
                <td className="py-4 text-[var(--text-secondary)]">{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
