import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Receipt } from "lucide-react";

import { FilterBar } from "@/components/transactions/filter-bar";
import { TransactionList } from "@/components/transactions/transaction-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listAccounts } from "@/lib/data/accounts";
import { listCategories } from "@/lib/data/categories";
import { getFormatting } from "@/lib/data/profile";
import {
  filtersToSearchParams,
  hasActiveFilters,
  parseTransactionFilters,
  type RawSearchParams,
} from "@/lib/data/transaction-filters";
import { listTransactions } from "@/lib/data/transactions";
import { todayIso } from "@/lib/date";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const formatting = await getFormatting();
  const today = todayIso(formatting.timezone);
  const filters = parseTransactionFilters(params, today);

  const [page, categories, accounts] = await Promise.all([
    listTransactions(filters),
    listCategories(),
    listAccounts(),
  ]);

  const totals = page.items.reduce(
    (acc, item) => {
      if (item.direction === "income") acc.income += item.amount;
      else acc.expense += item.amount;
      return acc;
    },
    { income: 0, expense: 0 },
  );

  function pageHref(nextPage: number) {
    const search = filtersToSearchParams({ ...filters, page: nextPage });
    return `/transactions?${search.toString()}`;
  }

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Everything you have recorded, filtered any way you like."
        actions={
          <Link href="/quick-add">
            <Button size="sm">
              <Plus aria-hidden />
              Add
            </Button>
          </Link>
        }
      />

      <FilterBar
        filters={filters}
        categories={categories}
        accounts={accounts}
        today={today}
        locale={formatting.locale}
      />

      {page.items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={hasActiveFilters(filters) ? "Nothing matches those filters" : "No transactions yet"}
          description={
            hasActiveFilters(filters)
              ? "Try widening the month or clearing a filter."
              : "Record your first expense and it will show up here."
          }
          action={
            <Link href="/quick-add">
              <Button size="sm">
                <Plus aria-hidden />
                Add your first entry
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">
              {page.total} {page.total === 1 ? "entry" : "entries"}
            </span>
            <span>
              <span className="text-muted-foreground">Expenses on this page </span>
              <span className="tabular font-medium">
                {formatMoney(totals.expense, formatting.currency, formatting.locale)}
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">Income on this page </span>
              <span className="tabular font-medium text-emerald-600 dark:text-emerald-400">
                {formatMoney(totals.income, formatting.currency, formatting.locale)}
              </span>
            </span>
          </div>

          <TransactionList
            items={page.items}
            currency={formatting.currency}
            locale={formatting.locale}
          />

          {page.pageCount > 1 ? (
            <nav className="flex items-center justify-between border-t border-border pt-4 text-sm">
              {page.page > 1 ? (
                <Link href={pageHref(page.page - 1)} className="text-accent hover:underline">
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground">
                Page {page.page} of {page.pageCount}
              </span>
              {page.page < page.pageCount ? (
                <Link href={pageHref(page.page + 1)} className="text-accent hover:underline">
                  Older →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
