import { ProgressBar } from "@/components/ui/progress-bar";
import { subtests, TOTAL_DURATION_MINUTES, type SubtestCode } from "@/lib/ist-subtests";

export function CourseRail({ currentCode }: { currentCode: SubtestCode }) {
  const currentIndex = subtests.findIndex((subtest) => subtest.code === currentCode);

  return (
    <aside className="hidden rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-subtle)] xl:sticky xl:top-24 xl:block xl:self-start">
      <h2 className="mt-2 text-lg font-bold tracking-[-0.03em] text-[var(--text-primary)]">
        IST Assessment
      </h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {subtests.length} modul • {TOTAL_DURATION_MINUTES} menit
      </p>
      <div className="mt-5">
        <ProgressBar label="Progres kelas" value={currentIndex} total={subtests.length} />
      </div>

      <ol
        className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-1"
        aria-label="Daftar subtes"
      >
        {subtests.map((subtest, index) => {
          const isCurrent = subtest.code === currentCode;
          const isComplete = index < currentIndex;
          return (
            <li
              key={subtest.code}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 ${isCurrent ? "bg-[var(--accent-warm-soft)]" : ""}`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${isComplete ? "bg-[var(--accent-primary)] text-white" : isCurrent ? "bg-[var(--accent-warm)] text-[var(--text-primary)]" : "bg-[var(--surface-subtle)] text-[var(--text-muted)]"}`}
              >
                {isComplete ? "✓" : index + 1}
              </span>
              <span className="hidden min-w-0 lg:block">
                <span className="block text-sm font-bold text-[var(--text-primary)]">
                  {subtest.code}
                </span>
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  {subtest.durationMinutes} menit
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
