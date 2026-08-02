import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";

import { buildWorkbook } from "@/lib/export/excel";
import { EXPORT_FIXTURE } from "@/test/export-fixture";

/**
 * Builds a real workbook and reads it back with exceljs, so these assertions
 * are about the file a user actually downloads rather than the code that
 * intended to produce it.
 */
describe("buildWorkbook", () => {
  let workbook: ExcelJS.Workbook;

  beforeAll(async () => {
    const buffer = await buildWorkbook(EXPORT_FIXTURE);
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  });

  it("has a summary, one sheet per month, and a categories sheet", () => {
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Summary",
      "2026-01",
      "2026-02",
      "Categories",
    ]);
  });

  it("writes amounts as numbers so they can be summed in Excel", () => {
    const sheet = workbook.getWorksheet("2026-01")!;
    // Row 3 is the header; row 4 is the first transaction.
    const amount = sheet.getRow(4).getCell(7);
    expect(typeof amount.value).toBe("number");
    expect(amount.numFmt).toContain("#,##0.00");
  });

  it("uses the profile's currency symbol in the number format", () => {
    const sheet = workbook.getWorksheet("Categories")!;
    expect(sheet.getColumn(2).numFmt).toBe('"$"#,##0.00');
  });

  it("totals the summary with a real formula rather than a constant", () => {
    const sheet = workbook.getWorksheet("Summary")!;
    let found: string | undefined;

    sheet.eachRow((row) => {
      if (row.getCell(1).value === "Total") {
        const cell = row.getCell(4).value as { formula?: string } | null;
        found = cell?.formula;
      }
    });

    expect(found).toMatch(/^SUM\(D\d+:D\d+\)$/);
  });

  it("keeps drafts out of the month total but still lists them", () => {
    const sheet = workbook.getWorksheet("2026-01")!;
    const values = sheet.getColumn(8).values.map(String);

    expect(values.some((value) => value.includes("Draft"))).toBe(true);

    // January: 4,250 + 8,900 + 250,000 + 78,350 confirmed expense = 341,500.
    // The 12,000 draft must not be in it.
    let expenseTotal: number | undefined;
    sheet.eachRow((row) => {
      if (row.getCell(6).value === "Expenses") expenseTotal = row.getCell(7).value as number;
    });

    expect(expenseTotal).toBeCloseTo(3415.0, 2);
  });

  it("carries the budget warning as a word, not only a colour", () => {
    const sheet = workbook.getWorksheet("2026-01")!;
    const statuses: string[] = [];
    sheet.eachRow((row) => {
      const value = row.getCell(6).value;
      if (typeof value === "string") statuses.push(value);
    });

    expect(statuses).toContain("Exceeded");
    expect(statuses).toContain("Close to limit");
    expect(statuses).toContain("On track");
  });

  it("produces a month sheet even when the month is empty", () => {
    const sheet = workbook.getWorksheet("2026-02")!;
    expect(sheet).toBeDefined();
    expect(sheet.rowCount).toBeGreaterThan(0);
  });

  it("ranks the categories sheet by total", () => {
    const sheet = workbook.getWorksheet("Categories")!;
    expect(sheet.getRow(5).getCell(1).value).toBe("Housing");
    expect(sheet.getRow(5).getCell(2).value).toBe(2500);
  });
});
