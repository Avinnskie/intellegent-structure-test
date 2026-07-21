type AppShellProps = {
  readonly title?: string;
  readonly actions?: React.ReactNode;
  readonly children: React.ReactNode;
};

export function AppShell({ title, actions, children }: AppShellProps) {
  return (
    <main id="main-content" className="w-full px-4 pt-5 min-h-dvh flex flex-col items-center">
      <div className="min-w-0 w-full">
        <header className="flex w-full flex-col gap-4 sm:flex-row sm:justify-between">
          <div className="min-w-0 max-w-3xl">
            <h1 className="text-start text-[clamp(1.9rem,3vw,2.8rem)] font-bold leading-[1.08] tracking-[-0.04em] text-(--text-primary)">
              {title}
            </h1>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : <div></div>}
        </header>
        <div className="pt-7">{children}</div>
      </div>
    </main>
  );
}
