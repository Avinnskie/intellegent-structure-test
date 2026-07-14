import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { PrototypeBadge } from "@/components/ui/prototype-badge";
import { demoParticipant, resultRows } from "@/lib/ist-data";
import { calculateExactAge } from "@/lib/ist-logic";

const chartOrder = ["SE", "WA", "AN", "GE", "ME", "RA", "ZR", "FA", "WU"] as const;

export default async function HrResultPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const ageAtTest = calculateExactAge(demoParticipant.birthDate, demoParticipant.testDate);
  const orderedRows = chartOrder
    .map((code) => resultRows.find((row) => row.code === code))
    .filter((row) => row !== undefined);

  return (
    <AppShell
      eyebrow="Screen H4"
      title={`Hasil demo sesi ${sessionId}`}
      description="Tabel RW/SW, IQ, kategori, dominance, dan grafik sembilan subtes ditampilkan dari data backend demo, bukan dihitung di client."
      actions={
        <>
          <Link
            href={`/hr/reports/${sessionId}`}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent-primary)] px-5 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-[var(--accent-hover)]"
          >
            Preview laporan
          </Link>
          <button
            type="button"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
          >
            Finalisasi hasil
          </button>
        </>
      }
    >
      <section className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]">
            <div className="flex flex-wrap gap-3">
              <PrototypeBadge tone="success">Calculated</PrototypeBadge>
              <PrototypeBadge>Norm band 24-29</PrototypeBadge>
            </div>
            <div className="mt-6 grid gap-4 text-sm text-[var(--text-secondary)]">
              <p>
                <strong className="text-[var(--text-primary)]">Peserta:</strong>{" "}
                {demoParticipant.name}
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Usia saat tes:</strong> {ageAtTest}{" "}
                tahun
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">IQ demo:</strong> 108 · High average
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Dominance:</strong> Verbal-analytical
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Versioning:</strong> FORM-2026.07 /
                NORM-2026.02 / ENG-0.1
              </p>
            </div>
          </article>

          <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--accent-warm-soft)] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Grafik sembilan subtes
            </p>
            <div className="mt-6 grid h-[320px] grid-cols-9 items-end gap-3">
              {orderedRows.map((row) => (
                <div key={row.code} className="flex h-full flex-col justify-end gap-3">
                  <div className="text-center text-xs font-semibold text-[var(--text-secondary)]">
                    {row.sw}
                  </div>
                  <div
                    className="rounded-t-[18px] bg-[linear-gradient(180deg,var(--accent-primary),color-mix(in_srgb,var(--accent-primary)_55%,white))]"
                    style={{ height: `${Math.max(row.sw - 70, 18) * 3}px` }}
                  />
                  <div className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {row.code}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-subtle)]">
          <table className="min-w-full text-left">
            <thead className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <tr>
                <th className="pb-3">Subtes</th>
                <th className="pb-3">RW</th>
                <th className="pb-3">SW/WS</th>
                <th className="pb-3">Kategori</th>
              </tr>
            </thead>
            <tbody className="text-sm text-[var(--text-primary)]">
              {resultRows.map((row) => (
                <tr key={row.code} className="border-t border-[var(--border-subtle)]">
                  <td className="py-4 font-semibold">{row.code}</td>
                  <td className="py-4">{row.rw}</td>
                  <td className="py-4">{row.sw}</td>
                  <td className="py-4">{row.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
