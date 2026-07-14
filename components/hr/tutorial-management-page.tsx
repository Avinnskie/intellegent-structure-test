import { AppShell } from "@/components/ui/app-shell";
import { PrototypeBadge } from "@/components/ui/prototype-badge";
import { tutorialVersionRows } from "@/lib/ist-data";

type TutorialManagementPageProps = {
  readonly eyebrow: string;
};

export function TutorialManagementPage({ eyebrow }: TutorialManagementPageProps) {
  return (
    <AppShell
      eyebrow={eyebrow}
      title="Pengelolaan tutorial subtes"
      description="Kelola versi tutorial teks dan video untuk setiap subtes. Perubahan hanya berlaku pada sesi baru sehingga sesi yang sedang berjalan tetap konsisten."
    >
      <section className="overflow-x-auto rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
              Versi tutorial aktif
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Buat versi draft, periksa pratinjau, lalu publikasikan untuk sesi berikutnya.
            </p>
          </div>
          <PrototypeBadge>Mock data</PrototypeBadge>
        </div>
        <table className="mt-6 min-w-full text-left">
          <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <tr>
              <th className="pb-3">Subtes</th>
              <th className="pb-3">Judul</th>
              <th className="pb-3">Versi</th>
              <th className="pb-3">Konten</th>
              <th className="pb-3">Status</th>
              <th className="pb-3">Efektif</th>
            </tr>
          </thead>
          <tbody className="text-sm text-[var(--text-primary)]">
            {tutorialVersionRows.map((row) => (
              <tr key={row.code} className="border-t border-[var(--border-subtle)]">
                <td className="py-4 font-semibold">{row.code}</td>
                <td className="py-4">{row.title}</td>
                <td className="py-4 font-mono">{row.version}</td>
                <td className="py-4">{row.contentType}</td>
                <td className="py-4">
                  <PrototypeBadge tone="success">{row.status}</PrototypeBadge>
                </td>
                <td className="py-4">{row.effectiveDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
