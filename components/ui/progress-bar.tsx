import { Progress } from "@/components/ui/progress";

type ProgressBarProps = {
  readonly label: string;
  readonly value: number;
  readonly total: number;
};

/** Pembungkus shadcn Progress dengan label dan hitungan di atasnya. */
export function ProgressBar({ label, value, total }: ProgressBarProps) {
  const percent = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value} / {total}
        </span>
      </div>
      <Progress value={percent} aria-label={label} />
    </div>
  );
}
