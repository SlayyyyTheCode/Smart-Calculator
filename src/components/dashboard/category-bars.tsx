import type { CategoryTotal } from "@/lib/domain/metrics";
import { formatMoney, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";

type CategoryBarsProps = {
  /**
   * Ranked biggest first. The order is what decides which bar carries the
   * accent, so an unsorted list emphasises the wrong category.
   */
  categories: CategoryTotal[];
  currency: string;
  locale: string;
  /** Categories past this fold into a single "Other" row. */
  limit?: number;
};

/**
 * Where the money went, ranked.
 *
 * Emphasis rather than eight hues: the question is "which one is biggest", so
 * the top category carries the accent and the rest are context. Colouring each
 * bar differently would spend the only free channel restating the length.
 *
 * Every value is directly labelled, so nothing is gated behind a tooltip and
 * this can stay a server component with no client JavaScript at all.
 */
export function CategoryBars({ categories, currency, locale, limit = 8 }: CategoryBarsProps) {
  const total = categories.reduce((sum, category) => sum + category.amount, 0);
  if (total <= 0) return null;

  const head = categories.slice(0, limit);
  const tail = categories.slice(limit);
  const rows =
    tail.length > 0
      ? [
          ...head,
          {
            categoryId: "other",
            categoryName: `Other (${tail.length})`,
            amount: tail.reduce((sum, category) => sum + category.amount, 0),
          },
        ]
      : head;

  // Taken across every row rather than from the first. With a ranked list the
  // two are the same number; with an unranked one, reading the first row as the
  // maximum makes a later, larger row compute a width above 100% and blow the
  // bar out past the edge of the page. A wrong emphasis is a cosmetic mistake,
  // a nine-hundred-pixel div inside a phone is a broken layout.
  const max = Math.max(...rows.map((row) => row.amount), 1);

  return (
    <div>
      <ul className="space-y-2.5">
        {rows.map((row, index) => (
          <li key={row.categoryId ?? row.categoryName}>
            <div className="flex items-baseline justify-between gap-3 pb-1">
              <span className="truncate text-sm">{row.categoryName}</span>
              <span className="tabular shrink-0 text-sm">
                <span className="font-medium">{formatMoney(row.amount, currency, locale)}</span>
                <span className="pl-1.5 text-xs text-muted-foreground">
                  {formatPercent(row.amount / total, locale)}
                </span>
              </span>
            </div>
            <div className="h-2.5 w-full">
              <div
                className={cn(
                  "h-full rounded-r-[4px]",
                  index === 0 ? "bg-chart-emphasis" : "bg-chart-context",
                )}
                style={{ width: `${Math.max((row.amount / max) * 100, 1.5)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <details className="pt-4">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          View as a table
        </summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1.5 font-medium">
                Category
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Spent
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.categoryId ?? category.categoryName} className="border-b border-border">
                <td className="py-1.5">{category.categoryName}</td>
                <td className="tabular py-1.5 text-right">
                  {formatMoney(category.amount, currency, locale)}
                </td>
                <td className="tabular py-1.5 text-right text-muted-foreground">
                  {formatPercent(category.amount / total, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
