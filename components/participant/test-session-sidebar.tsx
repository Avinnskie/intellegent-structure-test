import type { SubtestCode } from "@/lib/ist-subtests";

type SessionSidebarState = {
  readonly code: SubtestCode;
  readonly minutes: string;
  readonly seconds: string;
  readonly currentItem: number;
  readonly allItems: readonly number[];
  readonly unansweredCount: number;
  readonly responses: Readonly<Record<number, string>>;
  readonly skippedItems: readonly number[];
};

type TestSessionSidebarProps = {
  readonly state: SessionSidebarState;
  readonly onJump: (itemNumber: number) => void;
  readonly onComplete: () => void;
};

export function SessionTimer({
  minutes,
  seconds,
  className = "",
}: {
  readonly minutes: string;
  readonly seconds: string;
  readonly className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--border-default)] bg-[var(--accent-warm-soft)] px-5 py-4 text-center ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        Sisa waktu
      </p>
      <p className="mt-2 font-mono text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
        {minutes}:{seconds}
      </p>
    </div>
  );
}

export function TestSessionSidebar({ state, onJump, onComplete }: TestSessionSidebarProps) {
  return (
    <aside className="space-y-6">
      <SessionTimer minutes={state.minutes} seconds={state.seconds} className="hidden xl:block" />
      <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-subtle)]">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Navigasi butir
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          {state.unansweredCount} butir belum dijawab. Semua butir dapat dibuka ulang selama timer
          masih berjalan.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {state.allItems.map((itemNumber) => {
            const answered = Boolean(state.responses[itemNumber]);
            const skipped = state.skippedItems.includes(itemNumber);
            const isCurrent = itemNumber === state.currentItem;
            const stateClass = answered
              ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
              : skipped
                ? "border-[var(--status-warning)] text-[var(--status-warning)]"
                : "border-[var(--border-default)] text-[var(--text-primary)]";

            return (
              <button
                key={itemNumber}
                type="button"
                onClick={() => onJump(itemNumber)}
                aria-current={isCurrent ? "true" : undefined}
                aria-label={`Butir ${itemNumber}${answered ? ", sudah terjawab" : skipped ? ", dilewati" : ", belum dijawab"}`}
                className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-semibold ${stateClass} ${
                  isCurrent
                    ? "ring-2 ring-[var(--accent-primary)] ring-offset-2 ring-offset-[var(--surface-panel)]"
                    : "hover:bg-[var(--surface-subtle)]"
                }`}
              >
                {itemNumber}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">
          Hijau: terjawab (bisa diubah) · Amber: dilewati · Abu: belum dijawab
        </p>
        <button
          type="button"
          onClick={onComplete}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--border-default)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
        >
          Selesaikan subtes {state.code}
        </button>
      </article>
    </aside>
  );
}
