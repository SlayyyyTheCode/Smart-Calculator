// Getting the data off the device.
//
// The download itself is a browser action, so the test intercepts it and reads
// the bytes: what matters is not that a button was clickable but that the file
// contains the right rows in a shape a spreadsheet can actually use.
import { chromium } from "playwright-core";

const APP = process.env.BENCH_APP ?? "http://localhost:5174";
const OUT = process.env.SHOT_DIR ?? ".";

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(`${APP}/?instance=exp${Date.now()}&today=2026-08-16`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="seed"]', { timeout: 30000 });
await page.click('[data-testid="seed"]');
await page.waitForTimeout(1500);

const tab = async (id) => {
  await page.click(`[data-testid="tab-${id}"]`);
  await page.waitForTimeout(700);
};
const goTo = async (id) => {
  await page.click('[data-testid="tab-more"]');
  await page.waitForTimeout(300);
  await page.click(`[data-testid="more-${id}"]`);
  await page.waitForTimeout(800);
};

// A month with an expense, a salary with CPF, and a passive dividend, so the
// export has every shape of row in it.
await goTo("settings");
await page.selectOption('[data-testid="residency"]', "citizen_or_pr3");
await page.fill('[data-testid="birth-date"]', "1994-03-20");
await page.click('[data-testid="save-cpf"]');
await page.waitForTimeout(1400);

const add = async (amount, categoryLabel, direction, date) => {
  await tab("add");
  if (direction === "income") {
    await page.locator('label:has-text("Income")').first().click();
    await page.waitForTimeout(300);
  }
  await page.fill("#amount", amount);
  if (categoryLabel) await page.selectOption("#category", { label: categoryLabel });
  if (date) await page.fill("#occurred-on", date);
  await page.click('[data-testid="record"]');
  await page.waitForTimeout(1300);
};

await add("5000.00", "Gross Income", "income", "2026-08-01");
await add("800.00", "Dividend", "income", "2026-08-02");
await add("42.55", "Groceries", "expense", "2026-08-03");
// A row in a different year, to prove the range picker actually restricts.
await add("99.00", "Transport", "expense", "2025-06-10");

// ---- the screen ---------------------------------------------------------
await goTo("export");
await page.screenshot({ path: `${OUT}/export-1-screen.png`, fullPage: true });
const count = await page.locator('[data-testid="export-count"]').innerText();
check("it says how much is in range", /4 entries/.test(count), count);

// ---- CSV ----------------------------------------------------------------
const grab = async (testid) => {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.click(`[data-testid="${testid}"]`),
  ]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { name: download.suggestedFilename(), text: Buffer.concat(chunks).toString("utf8") };
};

const csv = await grab("export-csv");
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/export-2-done.png`, fullPage: true });

check("the file is named for the app and the range", /^smart-planner-.*\.csv$/.test(csv.name), csv.name);

const lines = csv.text.trim().split(/\r\n/);
check("it is CRLF, as a CSV should be", csv.text.includes("\r\n"), `${lines.length} lines`);
check("there is a header and a row per entry", lines.length === 5, `${lines.length} lines for 4 entries + header`);
check(
  "the header names the columns a spreadsheet needs",
  /^Date,Direction,Type,Category,Account,Merchant,Note,Amount,CPF,Status$/.test(lines[0]),
  lines[0],
);

// Amounts must be plain numbers. A currency symbol turns the column into text
// the moment Excel opens it, and a column you cannot sum is not an export.
const amounts = lines.slice(1).map((line) => line.split(",")[7]);
check("amounts are plain numbers, not formatted money", amounts.every((a) => /^\d+\.\d{2}$/.test(a)), amounts.join(" "));
check("the amounts are the ones recorded", amounts.sort().join(",") === "42.55,5000.00,800.00,99.00".split(",").sort().join(","), amounts.join(" "));

const salaryLine = lines.find((line) => line.includes("5000.00"));
check("the salary carries its CPF", /,1000\.00,/.test(salaryLine ?? ""), salaryLine ?? "");
check("and the dividend is labelled passive", /Passive/.test(lines.find((l) => l.includes("800.00")) ?? ""), lines.find((l) => l.includes("800.00")) ?? "");
check("rows are in date order", lines[1].startsWith("2025-06-10"), lines[1].slice(0, 30));

// ---- the range picker restricts -----------------------------------------
await page.click('[data-testid="scope-1"]'); // this year
await page.waitForTimeout(500);
const yearCount = await page.locator('[data-testid="export-count"]').innerText();
check("choosing this year drops the older row", /3 entries/.test(yearCount), yearCount);

const yearCsv = await grab("export-csv");
check("and the file matches what it promised", yearCsv.text.trim().split(/\r\n/).length === 4, `${yearCsv.text.trim().split(/\r\n/).length} lines`);
check("the older row is really gone", !yearCsv.text.includes("2025-06-10"), "");

// ---- JSON ---------------------------------------------------------------
await page.click('[data-testid="scope-2"]');
await page.waitForTimeout(400);
const json = await grab("export-json");
check("the backup is named .json", /\.json$/.test(json.name), json.name);

let parsed = null;
try {
  parsed = JSON.parse(json.text);
} catch (cause) {
  check("the backup is valid JSON", false, String(cause).slice(0, 60));
}
if (parsed) {
  check("the backup is valid JSON", true, `${json.text.length} bytes`);
  check("it carries every transaction", parsed.transactions.length === 4, `${parsed.transactions.length}`);
  check("it keeps amounts in cents, not decimals", parsed.transactions.every((t) => Number.isInteger(t.amountMinor)), "");
  check("a salary keeps its CPF in cents", parsed.transactions.some((t) => t.cpfMinor === 100000), "");
  check("it names the currency", parsed.currency === "SGD", String(parsed.currency));
  check("it includes the categories, so the ids mean something", parsed.categories.length >= 14, `${parsed.categories.length} categories`);
  check("and the accounts", parsed.accounts.length >= 1, `${parsed.accounts.length} accounts`);
}

const real = errors.filter((e) => !/favicon|React DevTools|Failed to load resource/i.test(e));
check("no page errors", real.length === 0, real.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
