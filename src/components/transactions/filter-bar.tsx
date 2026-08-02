import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import type { AccountOption } from "@/lib/data/accounts";
import type { CategoryOption } from "@/lib/data/categories";
import { hasActiveFilters, type TransactionFilters } from "@/lib/data/transaction-filters";
import { addMonths, formatMonthLabel, startOfMonth } from "@/lib/date";

type FilterBarProps = {
  filters: TransactionFilters;
  categories: CategoryOption[];
  accounts: AccountOption[];
  today: string;
  locale: string;
};

/**
 * Plain GET form: the filters end up in the URL, so a filtered view can be
 * bookmarked or opened on another device, and it works with JavaScript off.
 * `page` is deliberately not carried over — changing a filter starts at page 1.
 */
export function FilterBar({ filters, categories, accounts, today, locale }: FilterBarProps) {
  const currentMonth = startOfMonth(today);
  const months = Array.from({ length: 15 }, (_, index) => addMonths(currentMonth, 2 - index));
  if (filters.month && !months.includes(filters.month)) months.unshift(filters.month);

  return (
    <form
      method="get"
      className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <label className="space-y-1.5">
        <span className="block text-xs font-medium text-muted-foreground">Month</span>
        <Select name="month" defaultValue={filters.month ?? "all"}>
          <option value="all">All time</option>
          {months.map((month) => (
            <option key={month} value={month}>
              {formatMonthLabel(month, locale)}
            </option>
          ))}
        </Select>
      </label>

      <label className="space-y-1.5">
        <span className="block text-xs font-medium text-muted-foreground">Direction</span>
        <Select name="direction" defaultValue={filters.direction}>
          <option value="all">Income and expenses</option>
          <option value="expense">Expenses only</option>
          <option value="income">Income only</option>
        </Select>
      </label>

      <label className="space-y-1.5">
        <span className="block text-xs font-medium text-muted-foreground">Expense type</span>
        <Select name="nature" defaultValue={filters.nature}>
          <option value="all">Any type</option>
          <option value="daily">Daily</option>
          <option value="fixed">Fixed monthly</option>
          <option value="recurring">Recurring monthly</option>
        </Select>
      </label>

      <label className="space-y-1.5">
        <span className="block text-xs font-medium text-muted-foreground">Income type</span>
        <Select name="incomeType" defaultValue={filters.incomeType}>
          <option value="all">Any source</option>
          <option value="active">Active</option>
          <option value="passive">Passive</option>
        </Select>
      </label>

      <label className="space-y-1.5">
        <span className="block text-xs font-medium text-muted-foreground">Category</span>
        <Select name="category" defaultValue={filters.categoryId ?? ""}>
          <option value="">Any category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </label>

      <label className="space-y-1.5">
        <span className="block text-xs font-medium text-muted-foreground">Account</span>
        <Select name="account" defaultValue={filters.accountId ?? ""}>
          <option value="">Any account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
      </label>

      <label className="space-y-1.5">
        <span className="block text-xs font-medium text-muted-foreground">Status</span>
        <Select name="status" defaultValue={filters.status}>
          <option value="confirmed">Confirmed</option>
          <option value="draft">Drafts awaiting confirmation</option>
          <option value="all">Both</option>
        </Select>
      </label>

      <label className="space-y-1.5">
        <span className="block text-xs font-medium text-muted-foreground">Search</span>
        <Input name="q" defaultValue={filters.search ?? ""} placeholder="Merchant or note" />
      </label>

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit" size="sm">
          Apply
        </Button>
        {hasActiveFilters(filters) ? (
          <Link
            href="/transactions"
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </Link>
        ) : null}
      </div>
    </form>
  );
}
