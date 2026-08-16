import { useState } from "react";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";

import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/ui/card";
import { PageHeader } from "@app/components/ui/page-header";
import { formatMonthLabel } from "@app/lib/date";

import type { AccountRow, CategoryRow, TransactionRow } from "../db";
import { deliver, filenameFor, toCsv, toJson, type ExportScope } from "../export";
import { useMoneyFormat } from "../money-format";
import { TODAY } from "../today";

/**
 * Taking your data with you.
 *
 * The file is built on the device out of rows already in memory and handed
 * straight to the share sheet or a download. Nothing is uploaded to produce it,
 * which is the difference between exporting from this app and exporting from a
 * service: there is no server that could keep a copy of the file it made you.
 */
export function Export({
  transactions,
  categories,
  accounts,
}: {
  transactions: readonly TransactionRow[];
  categories: readonly CategoryRow[];
  accounts: readonly AccountRow[];
}) {
  const { currency, locale } = useMoneyFormat();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const dates = transactions.map((row) => String(row.occurredOn)).sort();
  const earliest = dates[0] ?? TODAY;
  // The real last date, not a sentinel: "Everything" once produced a file
  // called smart-planner-2025-06_to_9999-12.csv, which is not a filename
  // anybody wants to find on their laptop in a year.
  const latest = dates[dates.length - 1] ?? TODAY;
  const thisMonth = TODAY.slice(0, 7);

  const scopes: ExportScope[] = [
    { from: `${thisMonth}-01`, to: `${thisMonth}-31`, label: `${formatMonthLabel(`${thisMonth}-01`, locale)} only` },
    { from: `${TODAY.slice(0, 4)}-01-01`, to: `${TODAY.slice(0, 4)}-12-31`, label: `${TODAY.slice(0, 4)}` },
    { from: earliest, to: latest > TODAY ? latest : TODAY, label: "Everything" },
  ];
  const [scopeIndex, setScopeIndex] = useState(2);
  const scope = scopes[scopeIndex];

  const counted = transactions.filter((row) => {
    const on = String(row.occurredOn);
    return on >= scope.from && on <= scope.to;
  }).length;

  const run = async (kind: "csv" | "json") => {
    setBusy(true);
    setMessage(null);
    try {
      const input = { transactions, categories, accounts, scope };
      const contents = kind === "csv" ? toCsv(input) : toJson({ ...input, currency });
      const name = filenameFor(scope, kind);
      const result = await deliver(
        name,
        kind === "csv" ? "text/csv;charset=utf-8" : "application/json",
        contents,
      );
      setMessage(
        result === "shared"
          ? `Sent ${name}.`
          : result === "downloaded"
            ? `Saved ${name} to your downloads.`
            : "Nothing was sent. Try again, or use the other format.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Export"
        description="Take your records to a laptop, a spreadsheet, or a backup."
      />

      <Card>
        <CardHeader>
          <CardTitle>How much</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2" data-testid="scope-picker">
            {scopes.map((option, index) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setScopeIndex(index)}
                data-testid={`scope-${index}`}
                aria-pressed={index === scopeIndex}
                className={
                  index === scopeIndex
                    ? "rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent"
                    : "rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-muted"
                }
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground" data-testid="export-count">
            {counted.toLocaleString(locale)} {counted === 1 ? "entry" : "entries"} in this range.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Which format</CardTitle>
          <CardDescription>
            The file is built here on the device and handed straight to your share sheet or your
            downloads. Nothing is uploaded to produce it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void run("csv")} disabled={busy || counted === 0} data-testid="export-csv">
              <FileSpreadsheet aria-hidden />
              Spreadsheet (CSV)
            </Button>
            <Button
              variant="outline"
              onClick={() => void run("json")}
              disabled={busy || counted === 0}
              data-testid="export-json"
            >
              <FileJson aria-hidden />
              Full backup (JSON)
            </Button>
          </div>

          {message ? (
            <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400" data-testid="export-done">
              {message}
            </p>
          ) : null}

          <div className="space-y-2 pt-1 text-xs text-muted-foreground">
            <p>
              <strong className="font-medium text-foreground">CSV</strong> opens in Excel, Numbers
              and Google Sheets. Amounts are plain numbers so the columns stay summable — a currency
              symbol would turn them into text.
            </p>
            <p>
              <strong className="font-medium text-foreground">JSON</strong> is the complete record,
              amounts in cents, nothing rounded or flattened. This is the one to keep if you want to
              restore from it later.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Getting it to your laptop</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            On a phone this opens your share sheet, so you can mail it to yourself, drop it in
            Drive, or send it straight across. On a laptop it saves to your downloads.
          </p>
          <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
            <Download className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              To keep two devices in step continuously rather than a file at a time, use{" "}
              <strong className="font-medium text-foreground">Sync</strong> instead — it pairs them
              with a six-digit code.
            </span>
          </p>
        </CardContent>
      </Card>
    </>
  );
}
