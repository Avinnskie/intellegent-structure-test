type AppShellProps = {
  readonly title?: string;
  readonly actions?: React.ReactNode;
  readonly children: React.ReactNode;
};

export function AppShell({ title, actions, children }: AppShellProps) {
  return (
    <main id="main-content" className="flex w-full flex-1 flex-col gap-6 p-4 md:p-6">
      <header className="flex w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="min-w-0 max-w-3xl text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          {title}
        </h1>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className="min-w-0">{children}</div>
    </main>
  );
}
