import type { SubtestCode } from "@/lib/ist-subtests";

export type ItemStatusValue = "unanswered" | "answered" | "skipped" | "changed" | "locked";

export type SidebarItem = {
  readonly localNumber: number;
  readonly status: ItemStatusValue;
};

type SessionSidebarState = {
  readonly code: SubtestCode;
  readonly minutes: string;
  readonly seconds: string;
  readonly currentItem: number;
  readonly items: readonly SidebarItem[];
  readonly unansweredCount: number;
};

type TestSessionSidebarProps = {
  readonly state: SessionSidebarState;
  readonly onJump: (localNumber: number) => void;
  readonly onComplete: () => void;
};

export function isAnsweredStatus(status: ItemStatusValue): boolean {
  return status === "answered" || status === "changed";
}

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
    <div className={`rounded-xl border border-border bg-accent px-5 py-4 text-center ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Sisa waktu
      </p>
      <p
        aria-live="off"
        className="mt-2 font-mono text-3xl font-semibold tracking-[-0.04em] text-foreground"
      >
        {minutes}:{seconds}
      </p>
    </div>
  );
}

export function TestSessionSidebar({ state, onJump, onComplete }: TestSessionSidebarProps) {
  return (
    <aside className="space-y-6 mb-20">
      <article className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Navigasi soal
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {state.unansweredCount} soal belum dijawab.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {state.items.map((item) => {
            const answered = isAnsweredStatus(item.status);
            const skipped = item.status === "skipped";
            const isCurrent = item.localNumber === state.currentItem;
            const stateClass = answered
              ? "border-primary bg-accent text-primary"
              : skipped
                ? "border-[var(--color-amber-500, #f59e0b)] text-[var(--color-amber-500, #f59e0b)]"
                : "border-border text-foreground";

            return (
              <button
                key={item.localNumber}
                type="button"
                onClick={() => onJump(item.localNumber)}
                aria-current={isCurrent ? "true" : undefined}
                aria-label={`Butir ${item.localNumber}${answered ? ", sudah terjawab" : skipped ? ", dilewati" : ", belum dijawab"}`}
                className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-semibold ${stateClass} ${
                  isCurrent
                    ? "ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--card)]"
                    : "hover:bg-muted"
                }`}
              >
                {item.localNumber}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onComplete}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted"
        >
          Selesaikan subtes {state.code}
        </button>
      </article>
    </aside>
  );
}
