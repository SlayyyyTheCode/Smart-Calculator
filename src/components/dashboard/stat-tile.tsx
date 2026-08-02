import { cn } from "@/lib/utils";

type StatTileProps = {
  label: string;
  value: string;
  /** Signed change against a named period, e.g. "+12% vs last month". */
  delta?: { text: string; direction: "up" | "down" | "flat"; isGood: boolean } | null;
  hint?: string;
  /** Renders at hero size. Exactly one per view. */
  hero?: boolean;
};

/**
 * A number that is the chart. Values use the font's proportional figures —
 * tabular-nums makes a large standalone figure look loose, and there is no
 * column here to align to.
 */
export function StatTile({ label, value, delta, hint, hero = false }: StatTileProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "pt-1 font-semibold tracking-tight",
          hero ? "text-4xl sm:text-5xl" : "text-2xl",
        )}
      >
        {value}
      </p>
      {delta ? (
        <p
          className={cn(
            "pt-1 text-xs font-medium",
            delta.direction === "flat"
              ? "text-muted-foreground"
              : delta.isGood
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400",
          )}
        >
          {delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "→"} {delta.text}
        </p>
      ) : null}
      {hint ? <p className="pt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
