// Importing the same bank export twice.
//
// Recurring rules got an idempotency test because double-posting rent is
// double-counting money. Importing is the same money and the same mistake, and
// it is easier to make: statements overlap, downloads get repeated, and a file
// picker gives no hint you have seen this file before.
//
// On the server a re-import produced duplicates too — client_uuid is generated
// per row, so a second pass simply makes new ones — and the only protection was
// being able to undo a batch afterwards. Here there is no batch to undo.
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const APP = "http://localhost:5174";
const OUT = process.env.SHOT_DIR ?? ".";

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

// Deliberately contains a genuine same-day repeat: two identical coffees. A
// naive "collapse anything that looks alike" would eat one of them and quietly
// understate the month, which is the same class of error in the other direction.
const csv = [
  "Date,Description,Amount",
  "2026-08-02,COFFEE HOUSE,-4.80",
  "2026-08-02,COFFEE HOUSE,-4.80",
  "2026-08-04,SUPERMARKET,-100.00",
].join("\n");
const csvPath = `${OUT}/twice-fixture.csv`;
writeFileSync(csvPath, csv, "utf8");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(`${APP}/?instance=twice${Date.now()}&today=2026-08-09`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="seed"]', { timeout: 30000 });
await page.click('[data-testid="seed"]');
await page.waitForTimeout(1200);

const goTo = async (id) => {
  await page.click('[data-testid="tab-more"]');
  await page.waitForTimeout(300);
  await page.click(`[data-testid="more-${id}"]`);
  await page.waitForTimeout(700);
};

const spent = async () => {
  await page.click('[data-testid="tab-dashboard"]');
  await page.waitForTimeout(900);
  const text = await page.locator("main").innerText();
  return (text.match(/\$[\d,]+\.\d{2}/) ?? ["?"])[0];
};

const importFile = async () => {
  await goTo("import");
  await page.locator('[data-testid="csv-file"]').setInputFiles(csvPath);
  await page.waitForTimeout(1500);
};

// ---- first pass ---------------------------------------------------------
await importFile();
await page.click('[data-testid="commit-import"]');
await page.waitForTimeout(1800);
const afterFirst = await spent();
check("the first import counts every row, repeats included", /109\.60/.test(afterFirst), afterFirst);

// ---- second pass, same file --------------------------------------------
await importFile();
await page.screenshot({ path: `${OUT}/import-twice-preview.png`, fullPage: true });

const summary = await page.locator('[data-testid="import-summary"]').innerText().catch(() => "");
check(
  "a re-import says how much of it is already here",
  /already/i.test(summary),
  summary.replace(/\s+/g, " ").slice(0, 120),
);

// With every row already here there is nothing to import, and the button says
// so rather than sitting there inviting a click that would double the month.
const label = await page.locator('[data-testid="commit-import"]').innerText();
const disabled = await page.locator('[data-testid="commit-import"]').isDisabled();
check("a wholly-duplicate file offers nothing to import", disabled && /Nothing new/i.test(label), `"${label.trim()}" disabled=${disabled}`);

const afterSecond = await spent();
await page.screenshot({ path: `${OUT}/import-twice-after.png`, fullPage: true });
check(
  "importing the same file twice does not double the month",
  /109\.60/.test(afterSecond),
  `${afterFirst} then ${afterSecond}`,
);

// ---- the other direction -----------------------------------------------
// Skipping must not swallow a real repeat. Both coffees were in the first
// import and both must still be there.
await goTo("transactions");
const list = await page.locator('[data-testid="transaction-list"]').innerText();
const coffees = (list.match(/COFFEE HOUSE/g) ?? []).length;
check("a genuine same-day repeat is kept, not collapsed", coffees === 2, `${coffees} coffees`);

// ---- and the choice is the user's --------------------------------------
// Someone who really did spend it twice must be able to say so.
await importFile();
await page.locator('[data-testid="skip-duplicates"]').uncheck();
await page.waitForTimeout(400);
await page.click('[data-testid="commit-import"]');
await page.waitForTimeout(1800);
const afterForced = await spent();
check(
  "and importing anyway is still possible when it was not a mistake",
  /219\.20/.test(afterForced),
  afterForced,
);

const real = errors.filter((e) => !/favicon|React DevTools|Failed to load resource/i.test(e));
check("no page errors", real.length === 0, real.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
