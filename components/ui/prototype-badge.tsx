type PrototypeBadgeProps = {
  readonly tone?: "neutral" | "info" | "success" | "warning" | "danger";
  readonly children: React.ReactNode;
};

const toneMap = {
  neutral: "bg-[var(--surface-subtle)] text-[var(--text-secondary)] border-[var(--border-default)]",
  info: "bg-[var(--accent-soft)] text-[var(--accent-primary)] border-[var(--accent-primary)]/20",
  success:
    "bg-[color-mix(in_srgb,var(--status-success)_14%,white)] text-[var(--status-success)] border-[var(--status-success)]/20",
  warning:
    "bg-[color-mix(in_srgb,var(--status-warning)_14%,white)] text-[var(--status-warning)] border-[var(--status-warning)]/20",
  danger:
    "bg-[color-mix(in_srgb,var(--status-error)_14%,white)] text-[var(--status-error)] border-[var(--status-error)]/20",
} as const;

export function PrototypeBadge({ tone = "neutral", children }: PrototypeBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] ${toneMap[tone]}`}
    >
      {children}
    </span>
  );
}
