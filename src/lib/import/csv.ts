/**
 * Turning a bank or broker CSV into transactions.
 *
 * Bank exports agree on almost nothing: the date might be 04/03/2026 or
 * 2026-03-04, the amount might be -12.34 or (12.34) or "12.34 DR", and expenses
 * might live in the same column as income or in a separate one. Rather than
 * guess at import time, the shape is described once as a mapping and the rules
 * below apply it — so a file that imported correctly last month imports
 * correctly this month.
 *
 * Everything here is pure: rows in, transactions and errors out.
 */

import { daysInMonth, toIsoDate, type IsoDate } from "@/lib/date";
import { parseAmount, type Minor } from "@/lib/money";
import type { ExpenseNature, IncomeType } from "@/types/database";

export type CsvRow = Record<string, string>;

export type DateFormat = "auto" | "iso" | "dmy" | "mdy";

/**
 * How the file expresses money going out.
 *
 * `negative-expense` is the common case: one amount column where a minus sign
 * means you spent it. `separate-columns` covers exports with debit and credit
 * side by side.
 */
export type SignConvention = "negative-expense" | "positive-expense" | "separate-columns";

export type ColumnMapping = {
  date: string;
  amount?: string;
  debit?: string;
  credit?: string;
  description?: string;
  merchant?: string;
};

export type ImportOptions = {
  dateFormat: DateFormat;
  signConvention: SignConvention;
  /** Applied to every imported expense; income rows use incomeType instead. */
  expenseNature: ExpenseNature;
  incomeType: IncomeType;
  categoryId?: string | null;
  accountId?: string | null;
};

export type ImportedTransaction = {
  occurredOn: IsoDate;
  amount: Minor;
  direction: "expense" | "income";
  expenseNature: ExpenseNature | null;
  incomeType: IncomeType | null;
  merchant: string | null;
  note: string | null;
  categoryId: string | null;
  accountId: string | null;
};

export type RowError = {
  /** 1-based, counting the header as row 1, so it matches what a spreadsheet shows. */
  row: number;
  message: string;
};

export type ImportPlan = {
  transactions: ImportedTransaction[];
  errors: RowError[];
  /** Rows with no amount at all — usually a trailing total or a blank line. */
  skipped: number;
};

// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------

const CANDIDATES: Record<keyof ColumnMapping, string[]> = {
  date: ["date", "transaction date", "posting date", "value date", "booking date", "when"],
  amount: ["amount", "value", "transaction amount", "sum"],
  debit: ["debit", "withdrawal", "money out", "paid out", "outflow", "spent"],
  credit: ["credit", "deposit", "money in", "paid in", "inflow", "received"],
  description: ["description", "details", "narrative", "reference", "memo", "particulars"],
  merchant: ["merchant", "payee", "counterparty", "name", "to/from"],
};

function normalise(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/**
 * A first guess at the mapping from the header row. The user confirms it, so
 * this only has to be right often enough to save typing.
 */
export function detectColumns(headers: string[]): Partial<ColumnMapping> {
  const detected: Partial<ColumnMapping> = {};
  const seen = new Set<string>();

  for (const [field, candidates] of Object.entries(CANDIDATES) as [
    keyof ColumnMapping,
    string[],
  ][]) {
    let best: { header: string; score: number } | null = null;

    for (const header of headers) {
      if (seen.has(header)) continue;
      const name = normalise(header);

      // Candidates are listed most-preferred first, and an exact match always
      // beats a partial one. Ranking this way rather than taking the first hit
      // in file order is what makes "Date" win over "Value Date" — both are
      // exact matches, but "date" is the earlier candidate.
      const exact = candidates.indexOf(name);
      const partial = candidates.findIndex((candidate) => name.includes(candidate));

      const score = exact >= 0 ? exact : partial >= 0 ? 100 + partial : -1;
      if (score < 0) continue;
      if (!best || score < best.score) best = { header, score };
    }

    if (best) {
      detected[field] = best.header;
      seen.add(best.header);
    }
  }

  return detected;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function validDate(year: number, month: number, day: number): IsoDate | null {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (year < 1900 || year > 2200) return null;
  return toIsoDate({ year, month, day });
}

/**
 * Parses a date cell.
 *
 * `auto` reads an unambiguous value — an ISO date, or one where a part above 12
 * can only be the day. It refuses to guess between 04/03 and 03/04, because
 * being wrong there silently shifts a transaction by months and nobody would
 * notice. Say which format the file uses and it is applied exactly.
 */
export function parseImportDate(value: string, format: DateFormat = "auto"): IsoDate | null {
  const raw = value.trim();
  if (raw === "") return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // "4 Mar 2026" / "Mar 4, 2026"
  const named = /^(\d{1,2})[\s-]+([a-zA-Z]{3,})[\s-]+(\d{4})$/.exec(raw);
  if (named) {
    const month = MONTH_NAMES.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    return month > 0 ? validDate(Number(named[3]), month, Number(named[1])) : null;
  }
  const namedFirst = /^([a-zA-Z]{3,})[\s-]+(\d{1,2}),?[\s-]+(\d{4})$/.exec(raw);
  if (namedFirst) {
    const month = MONTH_NAMES.indexOf(namedFirst[1].slice(0, 3).toLowerCase()) + 1;
    return month > 0 ? validDate(Number(namedFirst[3]), month, Number(namedFirst[2])) : null;
  }

  const numeric = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(raw);
  if (!numeric) return null;

  const [, first, second, third] = numeric.map(Number) as unknown as [
    string,
    number,
    number,
    number,
  ];

  // A four-digit leading part can only be a year.
  if (String(numeric[1]).length === 4) return validDate(first, second, third);

  const year = third < 100 ? 2000 + third : third;

  if (format === "dmy") return validDate(year, second, first);
  if (format === "mdy") return validDate(year, first, second);
  if (format === "iso") return null;

  // auto: only decide when one ordering is impossible.
  const asDmy = validDate(year, second, first);
  const asMdy = validDate(year, first, second);
  if (asDmy && !asMdy) return asDmy;
  if (asMdy && !asDmy) return asMdy;
  return null;
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

export type SignedAmount = { amount: Minor; negative: boolean };

/**
 * Parses an amount cell, keeping the sign separate from the magnitude.
 *
 * Handles the conventions bank exports actually use: a leading minus,
 * accounting parentheses, a trailing DR/CR marker, thousands separators and a
 * currency symbol.
 */
export function parseImportAmount(value: string): SignedAmount | null {
  let raw = value.trim();
  if (raw === "") return null;

  let negative = false;

  if (/^\(.*\)$/.test(raw)) {
    negative = true;
    raw = raw.slice(1, -1);
  }

  const marker = /\b(dr|cr)\b\.?$/i.exec(raw);
  if (marker) {
    // DR is money leaving the account; CR is money arriving.
    if (marker[1].toLowerCase() === "dr") negative = true;
    raw = raw.slice(0, marker.index);
  }

  // Strip currency symbols and codes, keeping digits, separators and the sign.
  raw = raw.replace(/[^\d.,\-+]/g, "").trim();

  if (raw.startsWith("-")) {
    negative = true;
    raw = raw.slice(1);
  } else if (raw.startsWith("+")) {
    raw = raw.slice(1);
  }

  // A comma as the decimal mark: "1.234,56" or "12,34".
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(raw) || /^\d+,\d{1,2}$/.test(raw)) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  }

  const minor = parseAmount(raw);
  if (minor === null) return null;
  if (minor === 0) return null;

  return { amount: Math.abs(minor), negative: negative || minor < 0 };
}

// ---------------------------------------------------------------------------
// Building the plan
// ---------------------------------------------------------------------------

function firstNonEmpty(...values: (string | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** Applies a mapping to parsed CSV rows, collecting errors rather than throwing. */
export function buildImportPlan(
  rows: CsvRow[],
  mapping: ColumnMapping,
  options: ImportOptions,
): ImportPlan {
  const transactions: ImportedTransaction[] = [];
  const errors: RowError[] = [];
  let skipped = 0;

  rows.forEach((row, index) => {
    // +2: the header is row 1 and spreadsheets count from 1.
    const rowNumber = index + 2;

    const dateCell = row[mapping.date] ?? "";
    const occurredOn = parseImportDate(dateCell, options.dateFormat);

    let signed: SignedAmount | null = null;
    let direction: "expense" | "income" | null = null;

    if (options.signConvention === "separate-columns") {
      const debit = mapping.debit ? parseImportAmount(row[mapping.debit] ?? "") : null;
      const credit = mapping.credit ? parseImportAmount(row[mapping.credit] ?? "") : null;

      if (debit && credit) {
        errors.push({
          row: rowNumber,
          message: "Both the debit and credit columns have a value.",
        });
        return;
      }
      if (debit) {
        signed = debit;
        direction = "expense";
      } else if (credit) {
        signed = credit;
        direction = "income";
      }
    } else if (mapping.amount) {
      signed = parseImportAmount(row[mapping.amount] ?? "");
      if (signed) {
        const negativeMeansExpense = options.signConvention === "negative-expense";
        const isExpense = signed.negative === negativeMeansExpense;
        direction = isExpense ? "expense" : "income";
      }
    }

    // A row with no amount is a blank line or a running total, not an error.
    if (!signed || !direction) {
      skipped += 1;
      return;
    }

    if (!occurredOn) {
      errors.push({
        row: rowNumber,
        message: dateCell.trim()
          ? `Could not read "${dateCell.trim()}" as a date. Choose the date format explicitly.`
          : "No date.",
      });
      return;
    }

    const merchant = firstNonEmpty(
      mapping.merchant ? row[mapping.merchant] : undefined,
      mapping.description ? row[mapping.description] : undefined,
    );
    const note = mapping.description ? firstNonEmpty(row[mapping.description]) : null;

    transactions.push({
      occurredOn,
      amount: signed.amount,
      direction,
      expenseNature: direction === "expense" ? options.expenseNature : null,
      incomeType: direction === "income" ? options.incomeType : null,
      merchant: merchant ? merchant.slice(0, 120) : null,
      // Only keep the note when it says something the merchant does not.
      note: note && note !== merchant ? note.slice(0, 500) : null,
      categoryId: options.categoryId ?? null,
      accountId: options.accountId ?? null,
    });
  });

  return { transactions, errors, skipped };
}

/** Headline figures for the preview screen. */
export function summarisePlan(plan: ImportPlan) {
  let expense = 0;
  let income = 0;
  let earliest: IsoDate | null = null;
  let latest: IsoDate | null = null;

  for (const transaction of plan.transactions) {
    if (transaction.direction === "expense") expense += transaction.amount;
    else income += transaction.amount;

    if (!earliest || transaction.occurredOn < earliest) earliest = transaction.occurredOn;
    if (!latest || transaction.occurredOn > latest) latest = transaction.occurredOn;
  }

  return {
    count: plan.transactions.length,
    expense,
    income,
    earliest,
    latest,
    errorCount: plan.errors.length,
    skipped: plan.skipped,
  };
}
