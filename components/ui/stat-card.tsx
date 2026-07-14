type StatCardProps = {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
};

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-subtle)]">
      <span className="absolute inset-x-0 top-0 h-1 bg-[var(--accent-warm)]" />
      <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-4 font-mono text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
        {value}
      </p>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{detail}</p>
    </article>
  );
}
