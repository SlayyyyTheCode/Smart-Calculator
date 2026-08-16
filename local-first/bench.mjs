// How the app behaves with a few years of real use in it.
//
// Everything so far has been tested against a dozen rows, where anything is
// fast. A person recording three expenses a day for three years has a few
// thousand, and that is the load the phone actually has to hold. The numbers
// below are wall-clock from the browser, not estimates.
//
// The data goes in through the import screen rather than a back door, so the
// import path is measured too — it is the slowest thing a user can ask for.
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const APP = process.env.BENCH_APP ?? "http://localhost:5174";
const OUT = process.env.SHOT_DIR ?? ".";
const ROWS = Number(process.env.BENCH_ROWS ?? 2000);
const TODAY = "2026-08-16";

const MERCHANTS = [
  "COFFEE HOUSE", "SUPERMARKET", "MRT TOP UP", "BOOKSHOP", "PHARMACY",
  "HAWKER CENTRE", "PETROL", "CINEMA", "GYM", "BAKERY",
];

// Three years ending today, roughly two a day.
const lines = ["Date,Description,Amount"];
const start = new Date(Date.UTC(2023, 7, 16));
for (let i = 0; i < ROWS; i += 1) {
  const day = new Date(start.getTime() + Math.floor(i / 2) * 86400000);
  const date = day.toISOString().slice(0, 10);
  const merchant = MERCHANTS[i % MERCHANTS.length];
  const amount = (((i * 37) % 9000) / 100 + 1.5).toFixed(2);
  lines.push(`${date},${merchant} ${i},-${amount}`);
}
const csvPath = `${OUT}/bench-${ROWS}.csv`;
writeFileSync(csvPath, lines.join("\n"), "utf8");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const instance = `bench${Date.now()}`;
const url = `${APP}/?instance=${instance}&today=${TODAY}`;

const timed = async (label, fn) => {
  const t0 = Date.now();
  await fn();
  const ms = Date.now() - t0;
  console.log(`${label.padEnd(42)} ${String(ms).padStart(7)} ms`);
  return ms;
};

/**
 * Wait until the screen has actually painted the thing being measured, rather
 * than until the click returns. A fixed sleep would measure the sleep.
 */
const settle = async (selector) => {
  await page.waitForSelector(selector, { state: "visible", timeout: 120000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};

console.log(`\n=== ${ROWS} transactions ===\n`);

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="seed"]', { timeout: 30000 });
await page.click('[data-testid="seed"]');
await page.waitForTimeout(1500);

// ---- import throughput ---------------------------------------------------
await page.click('[data-testid="tab-more"]');
await page.waitForTimeout(300);
await page.click('[data-testid="more-import"]');
await page.waitForTimeout(700);

const parseMs = await timed("parse + preview a CSV", async () => {
  await page.locator('[data-testid="csv-file"]').setInputFiles(csvPath);
  await settle('[data-testid="import-summary"]');
});

const commitMs = await timed("commit the import", async () => {
  await page.click('[data-testid="commit-import"]');
  await settle('[data-testid="import-done"]');
});
console.log(`${"".padEnd(42)} ${String(Math.round((ROWS / commitMs) * 1000)).padStart(7)} rows/sec\n`);

// ---- render latency, warm ------------------------------------------------
const go = async (id, kind, ready) =>
  timed(`open ${id}`, async () => {
    if (kind === "tab") await page.click(`[data-testid="tab-${id}"]`);
    else {
      await page.click('[data-testid="tab-more"]');
      await page.waitForSelector(`[data-testid="more-${id}"]`, { state: "visible" });
      await page.click(`[data-testid="more-${id}"]`);
    }
    await settle(ready);
  });

const dashMs = await go("dashboard", "tab", "main");
await go("budgets", "tab", "main");
const txMs = await go("transactions", "more", '[data-testid="transaction-list"]');
await go("net-worth", "more", "main");

// ---- the thing done most often -------------------------------------------
await page.click('[data-testid="tab-add"]');
await settle("#amount");
const addMs = await timed("record one expense", async () => {
  await page.fill("#amount", "12.34");
  await page.click('[data-testid="record"]');
  await settle("main");
});

// ---- cold start with the data already there ------------------------------
const coldMs = await timed("cold start, data already stored", async () => {
  await page.goto(url, { waitUntil: "networkidle" });
  await settle("main");
  await page.waitForFunction(
    () => !/Nothing here yet/.test(document.querySelector("main")?.textContent ?? ""),
    { timeout: 120000 },
  );
});

await page.screenshot({ path: `${OUT}/bench-dashboard.png`, fullPage: true });

console.log("");
if (errors.length) console.log("PAGE ERRORS:", errors.slice(0, 3).join(" | "));

console.log(JSON.stringify({
  rows: ROWS,
  parseMs, commitMs, rowsPerSec: Math.round((ROWS / commitMs) * 1000),
  dashMs, txMs, addMs, coldMs,
}));

await browser.close();
