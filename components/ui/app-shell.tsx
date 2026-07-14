import { demoParticipant, demoSession } from "@/lib/ist-data";

type AppShellProps = {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: string;
  readonly actions?: React.ReactNode;
  readonly children: React.ReactNode;
};

export function AppShell({ eyebrow, title, description, actions, children }: AppShellProps) {
  return (
    <main id="main-content" className="w-full px-4 pt-5 min-h-dvh flex flex-col justify-center">
      <div className="min-w-0 w-full">
        <header className="flex w-full flex-col gap-4 sm:flex-row sm:justify-between">
          <div className="min-w-0 max-w-3xl">
            {eyebrow ? (
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent-primary)]">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-start text-[clamp(1.9rem,3vw,2.8rem)] font-bold leading-[1.08] tracking-[-0.04em] text-(--text-primary)">
              {title}
            </h1>
            {description ? (
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="shrink-0">{actions}</div>
          ) : eyebrow ? null : (
            <div className="flex w-full flex-col items-start justify-between gap-2 sm:w-40 sm:items-end">
              <div>
                <h3 className="text-right text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
                  {demoParticipant.name}
                </h3>
              </div>
              <div className="font-mono text-right text-xs text-[var(--text-secondary)] sm:text-right">
                <p>{demoSession.id}</p>
                <p>{demoSession.accessCode}</p>
              </div>
            </div>
          )}
        </header>
        <div className="pt-7">{children}</div>
      </div>
    </main>
  );
}
