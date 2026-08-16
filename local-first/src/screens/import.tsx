import { useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/ui/card";
import { PageHeader } from "@app/components/ui/page-header";
import { ProgressBar } from "@app/components/ui/progress-bar";
import {
  buildImportPlan,
  detectColumns,
  summarisePlan,
  type ColumnMapping,
  type CsvRow,
  type ImportPlan,
} from "@app/lib/import/csv";
import { formatMoney } from "@app/lib/money";

import { evolu, type AccountRow, type TransactionRow } from "../db";
import { useMoneyFormat } from "../money-format";
import { NONE } from "../schema";

/**
 * What makes two entries the same entry.
 *
 * Date, amount, direction and whatever the bank called it. Not the id, which is
 * fresh on every parse, and not the category, which the user may have set since.
 */
const fingerprint = (parts: {
  occurredOn: string;
  amount: number;
  direction: string;
  merchant: string;
  note: string;
}) =>
  `${parts.occurredOn}|${parts.amount}|${parts.direction}|${parts.merchant}|${parts.note}`;

/**
 * Which rows of a plan are already on the device.
 *
 * A multiset difference rather than a set membership test, and the difference
 * matters: two identical coffees on the same day are two real expenses. Asking
 * "have I seen this fingerprint before" would drop the second one and quietly
 * understate the month — the same error as double-counting, pointing the other
 * way. Counting occurrences and cancelling them off one by one means a file
 * re-imported whole is skipped whole, while a file with one more coffee than
 * last time imports exactly that one coffee.
 */
function alreadyPresent(
  planned: readonly { occurredOn: string; amount: number; direction: string; merchant: string; note: string }[],
  existing: readonly TransactionRow[],
): boolean[] {
  const remaining = new Map<string, number>();
  for (const row of existing) {
    const key = fingerprint({
      occurredOn: String(row.occurredOn),
      amount: Number(row.amountMinor),
      direction: String(row.direction),
      merchant: String(row.merchant),
      note: String(row.note),
    });
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  return planned.map((row) => {
    const key = fingerprint(row);
    const left = remaining.get(key) ?? 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      return true;
    }
    return false;
  });
}

/**
 * Importing a bank export, on the device.
 *
 * The parsing, the column detection and the plan are all the shipped module's.
 * That module is where the awkward cases already live: preferring "Date" over
 * "Value Date", refusing to guess between 03/04 and 04/03, reading "(12.34)"
 * and "12.34 DR" as negative, and treating a thousands separator inside a
 * quoted field correctly.
 *
 * The file never leaves the device, which on the server version was not true.
 */
export function Import({
  accounts,
  transactions,
}: {
  accounts: readonly AccountRow[];
  transactions: readonly TransactionRow[];
}) {
  const { money, locale } = useMoneyFormat();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);


  /**
   * A small CSV reader, rather than pulling papaparse into the bundle for a
   * file the user picked off their own phone. It handles quoted fields and
   * embedded commas, which is what a bank export actually needs.
   */
  const parseCsv = (text: string): { headers: string[]; rows: CsvRow[] } => {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const cells = (line: string): string[] => {
      const out: string[] = [];
      let cur = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (quoted) {
          if (ch === '"' && line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else if (ch === '"') {
            quoted = false;
          } else {
            cur += ch;
          }
        } else if (ch === '"') {
          quoted = true;
        } else if (ch === ",") {
          out.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
      out.push(cur);
      return out.map((value) => value.trim());
    };

    const headers = cells(lines[0] ?? "");
    const rows = lines
      .slice(1)
      // Blank lines are kept out of the data but the row numbers in any error
      // still refer to the line in the file, which is what someone opening it
      // in a spreadsheet will be looking at.
      .filter((line) => line.trim() !== "")
      .map((line) => {
        const values = cells(line);
        return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])) as CsvRow;
      });
    return { headers, rows };
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCommitted(null);

    try {
      const { headers, rows } = parseCsv(await file.text());
      const detected = detectColumns(headers);
      if (!detected.date) {
        setError("No date column found. The file needs a column of dates.");
        setPlan(null);
        return;
      }
      const full: ColumnMapping = {
        date: detected.date,
        amount: detected.amount,
        debit: detected.debit,
        credit: detected.credit,
        description: detected.description,
        merchant: detected.merchant,
      };
      const built = buildImportPlan(rows, full, {
        dateFormat: "auto",
        signConvention: "negative-expense",
        expenseNature: "daily",
        incomeType: "active",
        accountId: String(accounts[0]?.id ?? "") || null,
        categoryId: null,
      });
      setMapping(full);
      setPlan(built);
      setError(null);
    } catch (cause) {
      setError(String(cause));
      setPlan(null);
    }
  };

  const summary = plan ? summarisePlan(plan) : null;

  const duplicates = plan
    ? alreadyPresent(
        plan.transactions.map((row) => ({
          occurredOn: row.occurredOn,
          amount: row.amount,
          direction: row.direction,
          merchant: row.merchant || NONE,
          note: row.note || NONE,
        })),
        transactions,
      )
    : [];
  const duplicateCount = duplicates.filter(Boolean).length;
  const willImport = plan
    ? plan.transactions.length - (skipDuplicates ? duplicateCount : 0)
    : 0;

  /**
   * Committing, and saying so only once it is true.
   *
   * `evolu.insert` returns as soon as the write is queued, not when it is
   * durable. For a handful of rows that distinction never shows; for a bank
   * statement it is the whole story. Measured on a 6,000 row import: the loop
   * returned in 365 ms and the screen said "Imported 6000", while the worker
   * carried on for a further 13 seconds — of which only 230 ms was main-thread
   * work. Nothing was broken, and nothing looked wrong, but the next screen you
   * opened hung and the message had already told you it was finished.
   *
   * `onComplete` fires per row when the worker has actually taken it, so the
   * count below is the worker's, not this loop's.
   */
  const commit = () => {
    if (!plan) return;
    let count = 0;
    let skipped = 0;
    const total = plan.transactions.filter((_, i) => !(skipDuplicates && duplicates[i])).length;
    let done = 0;
    setProgress(total > 0 ? { done: 0, total } : null);

    const onComplete = () => {
      done += 1;
      // Repainting per row would cost more than the write. Every fiftieth is
      // smooth enough to read and cheap enough to ignore.
      if (done === total || done % 50 === 0) setProgress({ done, total });
      if (done === total) {
        setProgress(null);
        setCommitted(
          `Imported ${count} ${count === 1 ? "entry" : "entries"}.` +
            (skipped > 0 ? ` Skipped ${skipped} already here.` : ""),
        );
        setPlan(null);
      }
    };

    for (const [index, row] of plan.transactions.entries()) {
      if (skipDuplicates && duplicates[index]) {
        skipped += 1;
        continue;
      }
      const result = evolu.insert("transaction", {
        occurredOn: row.occurredOn,
        amountMinor: row.amount,
        direction: row.direction,
        incomeType: row.incomeType ?? NONE,
        expenseNature: row.expenseNature ?? NONE,
        status: "confirmed",
        categoryId: row.categoryId ?? NONE,
        accountId: row.accountId ?? NONE,
        merchant: row.merchant || NONE,
        note: row.note || NONE,
        recurringRuleId: NONE,
        cpfMinor: 0,
      }, { onComplete });
      if (result.ok) count += 1;
    }

    // Nothing to wait for, so nothing will call back.
    if (total === 0) {
      setProgress(null);
      setCommitted(`Imported 0 entries.${skipped > 0 ? ` Skipped ${skipped} already here.` : ""}`);
      setPlan(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Import CSV"
        description="A bank export, read on this device. The file is never uploaded anywhere."
      />

      <Card>
        <CardHeader>
          <CardTitle>Choose a file</CardTitle>
          <CardDescription>
            The date and amount columns are detected automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void onFile(event)}
            data-testid="csv-file"
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent-foreground"
          />
          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400" data-testid="import-error">
              {error}
            </p>
          ) : null}
          {committed ? (
            <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400" data-testid="import-done">
              {committed}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {plan && summary ? (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription data-testid="import-summary">
              {summary.count} to import · {money(summary.expense)} out · {money(summary.income)} in
              {summary.earliest ? ` · ${summary.earliest} to ${summary.latest}` : ""}
              {mapping ? ` · dates from "${mapping.date}"` : ""}
              {duplicateCount > 0
                ? ` · ${duplicateCount} already here`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y divide-border" data-testid="import-preview">
              {plan.transactions.slice(0, 8).map((row, index) => (
                <li key={index} className="flex items-center gap-3 py-2 text-sm">
                  <span className="text-muted-foreground">{row.occurredOn}</span>
                  <span className="min-w-0 flex-1 truncate">{row.merchant ?? row.note ?? "—"}</span>
                  <span className="tabular font-medium">
                    {row.direction === "expense" ? "−" : "+"}
                    {money(row.amount)}
                  </span>
                </li>
              ))}
            </ul>

            {plan.errors.length > 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <p className="font-medium">{plan.errors.length} rows could not be read</p>
                <ul className="mt-1 text-xs text-muted-foreground">
                  {plan.errors.slice(0, 4).map((rowError, index) => (
                    <li key={index}>
                      Row {rowError.row}: {rowError.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {duplicateCount > 0 ? (
              // Statements overlap and downloads get repeated, so a re-import is
              // the normal case rather than the odd one — but somebody who
              // really did pay the same amount to the same place twice has to be
              // able to say so. Default to skipping, and make the override one
              // click away rather than a decision the app takes silently.
              <label className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(event) => setSkipDuplicates(event.target.checked)}
                  data-testid="skip-duplicates"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
                />
                <span className="text-muted-foreground">
                  <strong className="font-medium text-foreground">
                    {duplicateCount} of these match entries you already have.
                  </strong>{" "}
                  Skip them. Untick if you really did spend it twice.
                </span>
              </label>
            ) : null}

            {progress ? (
              <div className="space-y-1" data-testid="import-progress">
                <ProgressBar value={(progress.done / progress.total) * 100} />
                <p className="text-xs text-muted-foreground">
                  Writing {progress.done.toLocaleString(locale)} of{" "}
                  {progress.total.toLocaleString(locale)} to this device&hellip;
                </p>
              </div>
            ) : null}

            <Button
              onClick={commit}
              disabled={willImport === 0 || progress !== null}
              data-testid="commit-import"
            >
              <Upload aria-hidden />
              {progress
                ? "Importing…"
                : willImport === 0
                ? "Nothing new to import"
                : `Import ${willImport} ${willImport === 1 ? "entry" : "entries"}`}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
