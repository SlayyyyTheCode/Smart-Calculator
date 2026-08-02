import { cn } from "@/lib/utils";

type ProgressBarProps = {
  /** Percentage filled. Values above 100 render as a full bar. */
  value: number;
  /** Tailwind background class for the fill, usually from BUDGET_LEVEL_STYLES. */
  barClassName?: string;
  className?: string;
  label?: string;
};

export function ProgressBar({ value, barClassName, className, label }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-muted", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", barClassName ?? "bg-accent")}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
