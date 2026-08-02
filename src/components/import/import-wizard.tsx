"use client";

import { useMemo, useState, useTransition } from "react";
import Papa from "papaparse";
import { AlertTriangle, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { commitImport } from "@/lib/actions/import";
import type { AccountOption } from "@/lib/data/accounts";
import type { CategoryOption } from "@/lib/data/categories";
import { formatDateLabel } from "@/lib/date";
import {
  buildImportPlan,
  detectColumns,
  summarisePlan,
  type ColumnMapping,
  type CsvRow,
  type DateFormat,
  type ImportOptions,
  type SignConvention,
} from "@/lib/import/csv";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ExpenseNature, IncomeType } from "@/types/database";

type ImportWizardProps = {
  categories: CategoryOption[];
  accounts: AccountOption[];
  currency: string;
  locale: string;
};

type Parsed = { filename: string; headers: string[]; rows: CsvRow[] };

const PREVIEW_ROWS = 8;

/**
 * Upload, map, preview, commit.
 *
 * Parsing and mapping happen in the browser so the preview is instant and no
 * file is uploaded until you have seen exactly what it will create. Nothing is
 * written until the last step, and what is written is validated again on the
 * server.
 */
export function ImportWizard({ categories, accounts, currency, locale }: ImportWizardProps) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({ date: "" });
  const [options, setOptions] = useState<ImportOptions>({
    dateFormat: "auto",
    signConvention: "negative-expense",
    expenseNature: "daily",
    incomeType: "active",
    categoryId: null,
    accountId: null,
  });
  const [result, setResult] = useState<{ status: "success" | "error"; message: string } | null>(
    null,
  );
  const [isCommitting, startCommit] = useTransition();

  const expenseCategories = categories.filter((category) => category.kind === "expense");

  function handleFile(file: File) {
    setParseError(null);
    setResult(null);

    Papa.parse<CsvRow>(file, {
      header: true,
      // Blank lines are kept deliberately. Dropping them here would shift every
      // subsequent row number, and the error list promises that "row 9" is the
      // ninth line of the file — which is the only thing that makes it useful.
      // A blank row has no amount, so it is skipped downstream anyway.
      skipEmptyLines: false,
      // Values are normalised by the import rules, not by Papa guessing types.
      dynamicTyping: false,
      complete(output) {
        const headers = (output.meta.fields ?? []).filter(Boolean);
        if (headers.length === 0) {
          setParseError("That file has no header row, so its columns cannot be mapped.");
          return;
        }

        const detected = detectColumns(headers);
        setParsed({ filename: file.name, headers, rows: output.data });
        setMapping({ date: detected.date ?? headers[0], ...detected });
        if (detected.debit || detected.credit) {
          setOptions((current) => ({ ...current, signConvention: "separate-columns" }));
        }
      },
      error(error) {
        setParseError(error.message);
      },
    });
  }

  const plan = useMemo(
    () => (parsed && mapping.date ? buildImportPlan(parsed.rows, mapping, options) : null),
    [parsed, mapping, options],
  );
  const summary = plan ? summarisePlan(plan) : null;

  function commit() {
    if (!parsed || !plan || plan.transactions.length === 0) return;

    startCommit(async () => {
      const state = await commitImport({
        filename: parsed.filename,
        source: null,
        transactions: plan.transactions,
      });
      setResult({
        status: state.status === "success" ? "success" : "error",
        message: state.message ?? "",
      });
      if (state.status === "success") setParsed(null);
    });
  }

  if (!parsed) {
    return (
      <div className="space-y-3">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center transition-colors hover:bg-surface-muted">
          <Upload className="size-5 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">Choose a CSV file</span>
          <span className="text-xs text-muted-foreground">
            Exported from your bank or broker. Nothing is uploaded until you confirm.
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
              event.target.value = "";
            }}
          />
        </label>

        {parseError ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">{parseError}</p>
        ) : null}
        {result ? (
          <p
            className={cn(
              "text-sm",
              result.status === "error"
                ? "text-rose-600 dark:text-rose-400"
                : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {result.message}
          </p>
        ) : null}
      </div>
    );
  }

  const columnOptions = (
    <>
      <option value="">Not mapped</option>
      {parsed.headers.map((header) => (
        <option key={header} value={header}>
          {header}
        </option>
      ))}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-medium">{parsed.filename}</span>{" "}
          <span className="text-muted-foreground">· {parsed.rows.length} rows</span>
        </p>
        <Button variant="ghost" size="sm" onClick={() => setParsed(null)}>
          Choose a different file
        </Button>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Map the columns</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Date" htmlFor="map-date">
            <Select
              id="map-date"
              value={mapping.date}
              onChange={(event) => setMapping({ ...mapping, date: event.target.value })}
            >
              {columnOptions}
            </Select>
          </Field>

          <Field label="Date format" htmlFor="date-format">
            <Select
              id="date-format"
              value={options.dateFormat}
              onChange={(event) =>
                setOptions({ ...options, dateFormat: event.target.value as DateFormat })
              }
            >
              <option value="auto">Detect automatically</option>
              <option value="dmy">Day first (31/12/2026)</option>
              <option value="mdy">Month first (12/31/2026)</option>
              <option value="iso">Year first (2026-12-31)</option>
            </Select>
          </Field>

          <Field label="How expenses are shown" htmlFor="sign">
            <Select
              id="sign"
              value={options.signConvention}
              onChange={(event) =>
                setOptions({
                  ...options,
                  signConvention: event.target.value as SignConvention,
                })
              }
            >
              <option value="negative-expense">One column, minus means spent</option>
              <option value="positive-expense">One column, plus means spent</option>
              <option value="separate-columns">Separate debit and credit columns</option>
            </Select>
          </Field>

          {options.signConvention === "separate-columns" ? (
            <>
              <Field label="Money out" htmlFor="map-debit">
                <Select
                  id="map-debit"
                  value={mapping.debit ?? ""}
                  onChange={(event) =>
                    setMapping({ ...mapping, debit: event.target.value || undefined })
                  }
                >
                  {columnOptions}
                </Select>
              </Field>
              <Field label="Money in" htmlFor="map-credit">
                <Select
                  id="map-credit"
                  value={mapping.credit ?? ""}
                  onChange={(event) =>
                    setMapping({ ...mapping, credit: event.target.value || undefined })
                  }
                >
                  {columnOptions}
                </Select>
              </Field>
            </>
          ) : (
            <Field label="Amount" htmlFor="map-amount">
              <Select
                id="map-amount"
                value={mapping.amount ?? ""}
                onChange={(event) =>
                  setMapping({ ...mapping, amount: event.target.value || undefined })
                }
              >
                {columnOptions}
              </Select>
            </Field>
          )}

          <Field label="Description" htmlFor="map-description">
            <Select
              id="map-description"
              value={mapping.description ?? ""}
              onChange={(event) =>
                setMapping({ ...mapping, description: event.target.value || undefined })
              }
            >
              {columnOptions}
            </Select>
          </Field>

          <Field label="Merchant" htmlFor="map-merchant" hint="Optional, if separate.">
            <Select
              id="map-merchant"
              value={mapping.merchant ?? ""}
              onChange={(event) =>
                setMapping({ ...mapping, merchant: event.target.value || undefined })
              }
            >
              {columnOptions}
            </Select>
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Apply to every imported row</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Account" htmlFor="opt-account">
            <Select
              id="opt-account"
              value={options.accountId ?? ""}
              onChange={(event) =>
                setOptions({ ...options, accountId: event.target.value || null })
              }
            >
              <option value="">Not specified</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Category"
            htmlFor="opt-category"
            hint="Recategorise afterwards from the transaction list."
          >
            <Select
              id="opt-category"
              value={options.categoryId ?? ""}
              onChange={(event) =>
                setOptions({ ...options, categoryId: event.target.value || null })
              }
            >
              <option value="">Uncategorised</option>
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Expense type" htmlFor="opt-nature">
            <Select
              id="opt-nature"
              value={options.expenseNature}
              onChange={(event) =>
                setOptions({ ...options, expenseNature: event.target.value as ExpenseNature })
              }
            >
              <option value="daily">Daily</option>
              <option value="fixed">Fixed monthly</option>
              <option value="recurring">Recurring monthly</option>
            </Select>
          </Field>

          <Field label="Income type" htmlFor="opt-income">
            <Select
              id="opt-income"
              value={options.incomeType}
              onChange={(event) =>
                setOptions({ ...options, incomeType: event.target.value as IncomeType })
              }
            >
              <option value="active">Active</option>
              <option value="passive">Passive</option>
            </Select>
          </Field>
        </div>
      </section>

      {summary ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Preview</h3>

          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
            <span>
              <span className="font-medium">{summary.count}</span>{" "}
              <span className="text-muted-foreground">to import</span>
            </span>
            <span>
              <span className="text-muted-foreground">Expenses </span>
              <span className="tabular font-medium">
                {formatMoney(summary.expense, currency, locale)}
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">Income </span>
              <span className="tabular font-medium">
                {formatMoney(summary.income, currency, locale)}
              </span>
            </span>
            {summary.earliest && summary.latest ? (
              <span className="text-muted-foreground">
                {formatDateLabel(summary.earliest, locale)} to{" "}
                {formatDateLabel(summary.latest, locale)}
              </span>
            ) : null}
            {summary.skipped > 0 ? (
              <span className="text-muted-foreground">
                {summary.skipped} {summary.skipped === 1 ? "row" : "rows"} with no amount
              </span>
            ) : null}
          </div>

          {plan && plan.errors.length > 0 ? (
            <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-4" aria-hidden />
                {plan.errors.length} {plan.errors.length === 1 ? "row" : "rows"} cannot be
                imported
              </p>
              <ul className="text-muted-foreground">
                {plan.errors.slice(0, 5).map((error) => (
                  <li key={error.row}>
                    Row {error.row}: {error.message}
                  </li>
                ))}
                {plan.errors.length > 5 ? <li>and {plan.errors.length - 5} more</li> : null}
              </ul>
              <p className="text-muted-foreground">
                The rest can still be imported; these are left out.
              </p>
            </div>
          ) : null}

          {plan && plan.transactions.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-3 py-2 font-medium">Date</th>
                    <th scope="col" className="px-3 py-2 font-medium">Merchant</th>
                    <th scope="col" className="px-3 py-2 font-medium">Type</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.transactions.slice(0, PREVIEW_ROWS).map((transaction, index) => (
                    <tr key={index} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        {formatDateLabel(transaction.occurredOn, locale)}
                      </td>
                      <td className="max-w-56 truncate px-3 py-2">
                        {transaction.merchant ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {transaction.direction === "income" ? "Income" : "Expense"}
                      </td>
                      <td
                        className={cn(
                          "tabular px-3 py-2 text-right",
                          transaction.direction === "income" &&
                            "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {transaction.direction === "income" ? "+" : "−"}
                        {formatMoney(transaction.amount, currency, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plan.transactions.length > PREVIEW_ROWS ? (
                <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                  and {plan.transactions.length - PREVIEW_ROWS} more
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing to import with the current mapping. Check the date and amount columns.
            </p>
          )}

          {result ? (
            <p
              className={cn(
                "text-sm",
                result.status === "error"
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {result.message}
            </p>
          ) : null}

          <Button
            onClick={commit}
            disabled={isCommitting || !plan || plan.transactions.length === 0}
          >
            {isCommitting
              ? "Importing…"
              : `Import ${summary.count} ${summary.count === 1 ? "entry" : "entries"}`}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
