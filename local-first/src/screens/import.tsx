import { useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/ui/card";
import { PageHeader } from "@app/components/ui/page-header";
import {
  buildImportPlan,
  detectColumns,
  summarisePlan,
  type ColumnMapping,
  type CsvRow,
  type ImportPlan,
} from "@app/lib/import/csv";
import { formatMoney } from "@app/lib/money";

import { evolu } from "../db";
import { NONE, type AccountRow } from "../schema";

const CURRENCY = "SGD";
const LOCALE = "en-SG";

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
export function Import({ accounts }: { accounts: readonly AccountRow[] }) {
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);

  const money = (minor: number) => formatMoney(minor, CURRENCY, LOCALE);

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

  const commit = () => {
    if (!plan) return;
    let count = 0;
    for (const row of plan.transactions) {
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
      });
      if (result.ok) count += 1;
    }
    setCommitted(`Imported ${count} ${count === 1 ? "entry" : "entries"}.`);
    setPlan(null);
  };

  const summary = plan ? summarisePlan(plan) : null;

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

            <Button onClick={commit} data-testid="commit-import">
              <Upload aria-hidden />
              Import {summary.count} {summary.count === 1 ? "entry" : "entries"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
