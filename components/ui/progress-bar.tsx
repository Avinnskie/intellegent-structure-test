type ProgressBarProps = {
  readonly label: string;
  readonly value: number;
  readonly total: number;
};

export function ProgressBar({ label, value, total }: ProgressBarProps) {
  const percentage = total === 0 ? 0 : Math.round((value / total) * 100);

  return (
    <div className="space-y-2 pb-0">
      <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
        <span>{label}</span>
        <span>{percentage}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
        <div
          className="h-full origin-left rounded-full bg-[var(--accent-warm)] transition-transform duration-300 ease-out"
          style={{ transform: `scaleX(${percentage / 100})` }}
        />
      </div>
    </div>
  );
}
