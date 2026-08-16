import { exportFilename, INCOME_TYPE_LABEL, NATURE_LABEL } from "@app/lib/export/shared";
import { toMajorString } from "@app/lib/money";

import type { AccountRow, CategoryRow, TransactionRow } from "./db";
import { NONE } from "./schema";

/**
 * Getting your data off the device.
 *
 * The point of a local-first app is that the data is yours, and that is only
 * true if you can take it somewhere else. This is the escape hatch: no account
 * to close, no export request to file, no server to ask.
 *
 * Two formats, for two different jobs. CSV opens in Excel, Numbers and Sheets
 * and is what people mean by "send it to my laptop". JSON is the complete
 * record — every column, nothing flattened — and is what you would restore
 * from if a phone went in a river.
 *
 * The filename convention is the shipped app's `exportFilename`, so a file
 * exported from the phone sorts alongside one exported from the web version
 * rather than following its own scheme.
 */

export type ExportScope = { from: string; to: string; label: string };

/** RFC 4180: quote when the value could otherwise break the row. */
function cell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const CSV_COLUMNS = [
  "Date",
  "Direction",
  "Type",
  "Category",
  "Account",
  "Merchant",
  "Note",
  "Amount",
  "CPF",
  "Status",
] as const;

export type ExportInput = {
  transactions: readonly TransactionRow[];
  categories: readonly CategoryRow[];
  accounts: readonly AccountRow[];
  scope: ExportScope;
};

function inScope(row: TransactionRow, scope: ExportScope): boolean {
  const on = String(row.occurredOn);
  return on >= scope.from && on <= scope.to;
}

/**
 * A spreadsheet's worth of rows.
 *
 * Amounts are written unformatted — `1234.50`, never `$1,234.50` — because a
 * currency symbol and a thousands separator turn a number into text the moment
 * Excel opens it, and a column you cannot sum is not much of an export. The
 * currency is named once in the filename and the header comment instead.
 */
export function toCsv({ transactions, categories, accounts, scope }: ExportInput): string {
  const categoryName = new Map(categories.map((c) => [String(c.id), String(c.name)]));
  const accountName = new Map(accounts.map((a) => [String(a.id), String(a.name)]));
  const blank = (value: string) => (value === NONE ? "" : value);

  const rows = transactions
    .filter((row) => inScope(row, scope))
    .slice()
    .sort((a, b) => String(a.occurredOn).localeCompare(String(b.occurredOn)));

  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) {
    const direction = String(row.direction);
    const nature = String(row.expenseNature);
    const incomeType = String(row.incomeType);
    const type =
      direction === "expense"
        ? (NATURE_LABEL[nature as keyof typeof NATURE_LABEL] ?? blank(nature))
        : (INCOME_TYPE_LABEL[incomeType as keyof typeof INCOME_TYPE_LABEL] ?? blank(incomeType));

    lines.push(
      [
        String(row.occurredOn),
        direction,
        type,
        categoryName.get(String(row.categoryId)) ?? "",
        accountName.get(String(row.accountId)) ?? "",
        blank(String(row.merchant)),
        blank(String(row.note)),
        toMajorString(Number(row.amountMinor)),
        Number(row.cpfMinor) > 0 ? toMajorString(Number(row.cpfMinor)) : "",
        String(row.status),
      ]
        .map((value) => cell(value))
        .join(","),
    );
  }
  return lines.join("\r\n");
}

/**
 * Everything, in full fidelity.
 *
 * Amounts stay in minor units here, unlike the CSV. This file is for a machine
 * to read back, and the whole reason the app never holds a float is that
 * converting money to a decimal and back is where money goes missing.
 */
export function toJson(input: ExportInput & { currency: string }): string {
  const { transactions, categories, accounts, scope, currency } = input;
  return JSON.stringify(
    {
      format: "smart-planner-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      currency,
      amounts: "integer minor units",
      scope: { from: scope.from, to: scope.to },
      categories: categories.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        kind: String(row.kind),
        incomeType: String(row.incomeType),
        isArchived: Number(row.isArchived) === 1,
      })),
      accounts: accounts.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        type: String(row.type),
        openingBalanceMinor: Number(row.openingBalanceMinor),
      })),
      transactions: transactions.filter((row) => inScope(row, scope)).map((row) => ({
        id: String(row.id),
        occurredOn: String(row.occurredOn),
        amountMinor: Number(row.amountMinor),
        direction: String(row.direction),
        incomeType: String(row.incomeType),
        expenseNature: String(row.expenseNature),
        status: String(row.status),
        categoryId: String(row.categoryId),
        accountId: String(row.accountId),
        merchant: String(row.merchant),
        note: String(row.note),
        cpfMinor: Number(row.cpfMinor),
      })),
    },
    null,
    2,
  );
}

export function filenameFor(scope: ExportScope, extension: string): string {
  return exportFilename(scope.from, scope.to, extension);
}

export type DeliveryResult = "shared" | "downloaded" | "failed";

/**
 * Handing the file over.
 *
 * A phone and a laptop want different things. On a phone the useful action is
 * the share sheet — mail it, put it in Drive, send it to the laptop — and a
 * download goes to a folder most people cannot find. On a desktop a download is
 * exactly right and there is usually no share sheet at all.
 *
 * `canShare` is checked with the actual file rather than for the API's
 * existence, because a browser can have `navigator.share` and still refuse
 * files. Getting that wrong throws after the user has already tapped.
 */
export async function deliver(
  filename: string,
  mime: string,
  contents: string,
): Promise<DeliveryResult> {
  const blob = new Blob([contents], { type: mime });

  try {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    }
  } catch (cause) {
    // A cancelled share sheet is not a failure, and must not fall through to a
    // download the user did not ask for.
    if (cause instanceof DOMException && cause.name === "AbortError") return "failed";
  }

  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Revoked on the next tick: doing it synchronously can cancel the download
    // in some browsers before it has started reading the blob.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "downloaded";
  } catch {
    return "failed";
  }
}
