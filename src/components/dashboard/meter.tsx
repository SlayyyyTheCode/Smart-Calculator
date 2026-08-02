import { cn } from "@/lib/utils";

type MeterProps = {
  label: string;
  /** 0-1 or beyond. Values above 1 render full. */
  ratio: number | null;
  valueText: string;
  hint: string;
  /** Text shown in place of the meter when the ratio is undefined. */
  emptyText?: string;
};

/**
 * A single ratio against a limit. The unfilled track is a lighter step of the
 * fill's own ramp rather than a neutral gray, so the whole bar reads as one
 * scale instead of a fill sitting on unrelated background.
 */
export function Meter({ label, ratio, valueText, hint, emptyText }: MeterProps) {
  const pct = ratio === null ? 0 : Math.max(0, Math.min(1, ratio)) * 100;
  const complete = ratio !== null && ratio >= 1;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="pt-1 text-2xl font-semibold tracking-tight">
        {ratio === null ? (emptyText ?? "—") : valueText}
      </p>

      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-chart-context/40"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            complete ? "bg-emerald-500" : "bg-chart-emphasis",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="pt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
