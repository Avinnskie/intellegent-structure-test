import type { ResultDto } from "@/lib/server/calculate.ts";

export function ResultChart({ subtests }: { subtests: ResultDto["subtests"] }) {
  const max = Math.max(...subtests.map((subtest) => subtest.standardScore), 1);

  return (
    <div className="mt-6 grid h-[320px] grid-cols-9 items-end gap-3" role="img" aria-label="Grafik skor standar sembilan subtes">
      {subtests.map((subtest) => (
        <div key={subtest.code} className="flex h-full flex-col justify-end gap-3">
          <div className="text-center text-xs font-semibold text-[var(--text-secondary)]">
            {subtest.standardScore}
          </div>
          <div
            className="rounded-t-[18px] bg-[linear-gradient(180deg,var(--accent-primary),color-mix(in_srgb,var(--accent-primary)_55%,white))]"
            style={{ height: `${Math.max(Math.round((subtest.standardScore / max) * 260), 18)}px` }}
          />
          <div className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {subtest.code}
          </div>
        </div>
      ))}
    </div>
  );
}
