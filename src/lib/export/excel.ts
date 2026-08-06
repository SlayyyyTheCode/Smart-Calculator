import "server-only";

import ExcelJS from "exceljs";

import type { ExportPayload } from "@/lib/data/export";
import { formatDateLabel, formatMonthLabel } from "@/lib/date";
import { describeBudget } from "@/lib/domain/budget";
import { fireCoverage, savingsRate } from "@/lib/domain/metrics";
import { toMajorNumber, type Minor } from "@/lib/money";
import {
  aggregateCategories,
  computeMonth,
  currencyNumberFormat,
  sheetNameForMonth,
  transactionTypeLabel,
} from "@/lib/export/shared";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F5F9" },
};

const PERCENT_FORMAT = "0.0%";

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = HEADER_FILL;
  row.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
}

/**
 * Builds the workbook.
 *
 * One worksheet per month, as asked for, plus a Summary sheet that carries the
 * whole range and a Categories sheet for the totals across it.
 *
 * Amounts are written as numbers with a currency *format*, never as
 * pre-formatted strings — so every column stays summable, sortable and
 * chartable once the file is open. That is the entire point of exporting to a
 * spreadsheet rather than a PDF.
 */
export async function buildWorkbook(payload: ExportPayload): Promise<Buffer> {
  const { currency, locale } = payload;
  const money = currencyNumberFormat(currency, locale);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Smart Planner";
  workbook.created = new Date(payload.generatedAt);

  buildSummarySheet(workbook, payload, money);
  for (const month of payload.months) {
    buildMonthSheet(workbook, payload, month, money);
  }
  buildCategoriesSheet(workbook, payload, money);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function buildSummarySheet(
  workbook: ExcelJS.Workbook,
  payload: ExportPayload,
  money: string,
): void {
  const sheet = workbook.addWorksheet("Summary", {
    views: [{ state: "frozen", ySplit: 6 }],
  });

  sheet.addRow(["Smart Planner"]).font = { bold: true, size: 16 };
  sheet.addRow([
    `${formatMonthLabel(payload.from, payload.locale)} to ${formatMonthLabel(payload.to, payload.locale)}`,
  ]);
  if (payload.displayName) sheet.addRow([payload.displayName]);
  sheet.addRow([`Generated ${new Date(payload.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC`]);
  sheet.addRow([
    "Totals count confirmed entries only. Drafts forecast from recurring rules are listed on each month sheet but excluded from totals.",
  ]).font = { italic: true, size: 9 };
  sheet.addRow([]);

  const header = sheet.addRow([
    "Month",
    "Active income",
    "Passive income",
    "Total income",
    "Daily",
    "Fixed",
    "Recurring",
    "Total expenses",
    "Net",
    "Savings rate",
    "FIRE coverage",
  ]);
  styleHeaderRow(header);

  const firstDataRow = sheet.rowCount + 1;

  // Running totals for the cached results on the SUM formulas below. Kept in
  // minor units and converted once at the end: adding the major-unit figures
  // would be floating point arithmetic on money, which this codebase does not
  // do anywhere.
  const columnTotals: Minor[] = [0, 0, 0, 0, 0, 0, 0, 0];

  for (const month of payload.months) {
    const computed = computeMonth(month);

    // Nature splits come from the month's own rows, so they always reconcile
    // with the sheet that follows.
    const byNature = { daily: 0, fixed: 0, recurring: 0 };
    for (const transaction of month.transactions) {
      if (transaction.status !== "confirmed" || transaction.direction !== "expense") continue;
      if (transaction.expenseNature) byNature[transaction.expenseNature] += transaction.amount;
    }

    const rate = savingsRate(computed.confirmedIncome, computed.confirmedExpense);
    const coverage = fireCoverage(month.totals.incomePassive, computed.confirmedExpense);

    const minorFigures: Minor[] = [
      month.totals.incomeActive,
      month.totals.incomePassive,
      computed.confirmedIncome,
      byNature.daily,
      byNature.fixed,
      byNature.recurring,
      computed.confirmedExpense,
      computed.net,
    ];
    minorFigures.forEach((figure, index) => {
      columnTotals[index] += figure;
    });

    sheet.addRow([
      formatMonthLabel(month.periodMonth, payload.locale),
      ...minorFigures.map(toMajorNumber),
      rate ?? "",
      coverage ?? "",
    ]);
  }

  const lastDataRow = sheet.rowCount;

  // A real SUM formula, not a precomputed constant, so the file behaves the way
  // a spreadsheet is expected to when a row is edited — but carrying a cached
  // result too. Excel and Sheets evaluate on open and would not need it;
  // anything that reads the file without an evaluator (a script, a phone's
  // preview pane) shows an empty totals row without it.
  const totalRow = sheet.addRow([
    "Total",
    ...["B", "C", "D", "E", "F", "G", "H", "I"].map((column, index) => ({
      formula: `SUM(${column}${firstDataRow}:${column}${lastDataRow})`,
      result: toMajorNumber(columnTotals[index]),
    })),
    "",
    "",
  ]);
  totalRow.font = { bold: true };
  totalRow.border = { top: { style: "thin", color: { argb: "FFCBD5E1" } } };

  sheet.getColumn(1).width = 20;
  for (let column = 2; column <= 9; column += 1) {
    sheet.getColumn(column).width = 16;
    sheet.getColumn(column).numFmt = money;
  }
  for (const column of [10, 11]) {
    sheet.getColumn(column).width = 14;
    sheet.getColumn(column).numFmt = PERCENT_FORMAT;
  }
}

function buildMonthSheet(
  workbook: ExcelJS.Workbook,
  payload: ExportPayload,
  month: ExportPayload["months"][number],
  money: string,
): void {
  const sheet = workbook.addWorksheet(sheetNameForMonth(month.periodMonth), {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  sheet.addRow([formatMonthLabel(month.periodMonth, payload.locale)]).font = {
    bold: true,
    size: 14,
  };
  sheet.addRow([]);

  const header = sheet.addRow([
    "Date",
    "Direction",
    "Type",
    "Category",
    "Account",
    "Merchant",
    "Amount",
    "Status",
    "Tags",
    "Note",
  ]);
  styleHeaderRow(header);

  const firstDataRow = sheet.rowCount + 1;

  for (const transaction of month.transactions) {
    const row = sheet.addRow([
      formatDateLabel(transaction.occurredOn, payload.locale),
      transaction.direction === "income" ? "Income" : "Expense",
      transactionTypeLabel(transaction),
      transaction.categoryName ?? "Uncategorised",
      transaction.accountName ?? "",
      transaction.merchant ?? "",
      toMajorNumber(transaction.amount),
      transaction.status === "draft" ? "Draft (not counted)" : "Confirmed",
      transaction.tags.join(", "),
      transaction.note ?? "",
    ]);

    if (transaction.status === "draft") {
      row.font = { italic: true, color: { argb: "FF92400E" } };
    }
  }

  const lastDataRow = sheet.rowCount;
  const computed = computeMonth(month);

  sheet.addRow([]);
  const totals = sheet.addRow([
    "Totals (confirmed only)",
    "",
    "",
    "",
    "",
    "Income",
    toMajorNumber(computed.confirmedIncome),
  ]);
  totals.font = { bold: true };
  sheet.addRow(["", "", "", "", "", "Expenses", toMajorNumber(computed.confirmedExpense)]);
  sheet.addRow(["", "", "", "", "", "Net", toMajorNumber(computed.net)]).font = { bold: true };

  if (computed.draftCount > 0) {
    sheet.addRow([
      `${computed.draftCount} draft ${computed.draftCount === 1 ? "entry" : "entries"} totalling`,
      "",
      "",
      "",
      "",
      "",
      toMajorNumber(computed.draftTotal),
      "excluded from the totals above",
    ]).font = { italic: true, color: { argb: "FF92400E" } };
  }

  if (month.budgets.length > 0) {
    sheet.addRow([]);
    sheet.addRow(["Budget against actual"]).font = { bold: true, size: 12 };

    const budgetHeader = sheet.addRow([
      "Category",
      "Budget",
      "Spent",
      "Remaining",
      "Used",
      "Status",
    ]);
    styleHeaderRow(budgetHeader);

    for (const budget of month.budgets) {
      const { evaluation } = budget;
      const row = sheet.addRow([
        budget.categoryName,
        toMajorNumber(evaluation.limit),
        toMajorNumber(evaluation.spent),
        toMajorNumber(evaluation.remaining),
        evaluation.pctUsed / 100,
        describeBudget(evaluation),
      ]);

      row.getCell(2).numFmt = money;
      row.getCell(3).numFmt = money;
      row.getCell(4).numFmt = money;
      row.getCell(5).numFmt = PERCENT_FORMAT;

      // The same green / amber / red the app shows, so the file carries the
      // warning rather than just the raw numbers.
      const colour =
        evaluation.level === "exceeded"
          ? "FFB91C1C"
          : evaluation.level === "warning"
            ? "FFB45309"
            : "FF15803D";
      row.getCell(6).font = { bold: true, color: { argb: colour } };
    }
  }

  sheet.getColumn(1).width = 18;
  sheet.getColumn(2).width = 11;
  sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 20;
  sheet.getColumn(5).width = 16;
  sheet.getColumn(6).width = 20;
  sheet.getColumn(7).width = 14;
  sheet.getColumn(8).width = 20;
  sheet.getColumn(9).width = 20;
  sheet.getColumn(10).width = 32;

  // Only the transaction amounts get the currency format here; the budget
  // block sets its own, because the two tables share columns.
  for (let rowNumber = firstDataRow; rowNumber <= lastDataRow; rowNumber += 1) {
    sheet.getRow(rowNumber).getCell(7).numFmt = money;
  }
  for (const rowNumber of [lastDataRow + 2, lastDataRow + 3, lastDataRow + 4, lastDataRow + 5]) {
    sheet.getRow(rowNumber).getCell(7).numFmt = money;
  }

  if (lastDataRow >= firstDataRow) {
    sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: lastDataRow, column: 10 } };
  }
}

function buildCategoriesSheet(
  workbook: ExcelJS.Workbook,
  payload: ExportPayload,
  money: string,
): void {
  const sheet = workbook.addWorksheet("Categories");
  const categories = aggregateCategories(payload.months);
  const total = categories.reduce((sum, category) => sum + category.amount, 0);

  sheet.addRow(["Spending by category"]).font = { bold: true, size: 14 };
  sheet.addRow([
    `${formatMonthLabel(payload.from, payload.locale)} to ${formatMonthLabel(payload.to, payload.locale)}`,
  ]);
  sheet.addRow([]);

  const header = sheet.addRow(["Category", "Total", "Share", "Months active"]);
  styleHeaderRow(header);

  for (const category of categories) {
    sheet.addRow([
      category.name,
      toMajorNumber(category.amount),
      total > 0 ? category.amount / total : 0,
      category.count,
    ]);
  }

  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(2).numFmt = money;
  sheet.getColumn(3).width = 10;
  sheet.getColumn(3).numFmt = PERCENT_FORMAT;
  sheet.getColumn(4).width = 14;
}
