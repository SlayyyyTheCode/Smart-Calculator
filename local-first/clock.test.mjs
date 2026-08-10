// Whether the app knows what day it is.
//
// It did not. Four hardcoded constants - "2026-08-09" in three screens and
// "2026-08-01" in the shell - froze the whole thing in time. Installed on a
// phone it would have dated every entry 9 August 2026 for ever, shown August's
// dashboard in December, and counted a debt payoff from a date that never
// advanced. Nothing failed, because nothing had ever asked.
import { chromium } from "playwright-core";

const APP = "http://localhost:5174";
const OUT = process.env.SHOT_DIR ?? ".";

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

const instance = `clock${Date.now()}`;
const open = async (today) => {
  await page.goto(`${APP}/?instance=${instance}&today=${today}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
};

const record = async (amount) => {
  await page.click('[data-testid="tab-add"]');
  await page.waitForTimeout(500);
  await page.fill("#amount", amount);
  await page.click('[data-testid="record"]');
  await page.waitForTimeout(1200);
};

const dashboard = async () => {
  await page.click('[data-testid="tab-dashboard"]');
  await page.waitForTimeout(900);
  return page.locator("main").innerText();
};

// ---- August --------------------------------------------------------------
await open("2026-08-09");
await page.waitForSelector('[data-testid="seed"]', { timeout: 30000 });
await page.click('[data-testid="seed"]');
await page.waitForTimeout(1200);

const dateField = await page.evaluate(async () => {
  document.querySelector('[data-testid="tab-add"]').click();
  await new Promise((r) => setTimeout(r, 600));
  return document.querySelector("#occurred-on")?.value ?? "";
});
check("the entry form offers a date, defaulted to today", dateField === "2026-08-09", dateField || "no date field at all");

await record("40.00");
const august = await dashboard();
await page.screenshot({ path: `${OUT}/clock-1-august.png`, fullPage: true });
check("the dashboard names the month it is showing", /August 2026/.test(august), (august.match(/\w+ \d{4}/) ?? ["?"])[0]);
check("August's spending is August's", /\$40\.00/.test(august), (august.match(/\$[\d,]+\.\d{2}/) ?? ["?"])[0]);

// ---- September, same device, same data ----------------------------------
// The month turning over is the thing that never happened. Same database, one
// day later in calendar terms, and the dashboard has to move with it.
await open("2026-09-03");
const september = await dashboard();
await page.screenshot({ path: `${OUT}/clock-2-september.png`, fullPage: true });
check("the month moves on with the calendar", /September 2026/.test(september), (september.match(/\w+ \d{4}/) ?? ["?"])[0]);
check(
  "and August's spending does not follow it into September",
  /\$0\.00/.test(september) && !/\$40\.00/.test(september),
  (september.match(/\$[\d,]+\.\d{2}/g) ?? []).slice(0, 3).join(" "),
);

await record("12.50");
const sepAfter = await dashboard();
check("September's own spending lands in September", /\$12\.50/.test(sepAfter), (sepAfter.match(/\$[\d,]+\.\d{2}/) ?? ["?"])[0]);

// ---- back to August -----------------------------------------------------
// And it was not lost, only out of view.
await open("2026-08-31");
const backInAugust = await dashboard();
check("August's spending is still there when you look at August", /\$40\.00/.test(backInAugust), (backInAugust.match(/\$[\d,]+\.\d{2}/) ?? ["?"])[0]);

// ---- a budget belongs to its month --------------------------------------
// Latent while the clock was frozen, because there was only ever one month:
// the overall cap was looked up by category alone, so setting one in September
// found August's and rewrote it, leaving September with none and August with
// the wrong figure.
const setCap = async (value) => {
  await page.click('[data-testid="tab-budgets"]');
  await page.waitForTimeout(700);
  await page.fill("#limit", value);
  await page.click('[data-testid="save-budget"]');
  await page.waitForTimeout(1200);
};
const capText = async () => {
  await page.click('[data-testid="tab-budgets"]');
  await page.waitForTimeout(700);
  return page.locator("main").innerText();
};

await setCap("300.00");
check("a cap set in August reads back in August", /\$300\.00/.test(await capText()), "");

await open("2026-09-03");
const septemberBudgets = await capText();
await page.screenshot({ path: `${OUT}/clock-4-september-budget.png`, fullPage: true });
check(
  "September starts without August's cap",
  !/Currently \$300\.00/.test(septemberBudgets),
  septemberBudgets.replace(/\s+/g, " ").slice(0, 110),
);

await setCap("500.00");
await open("2026-08-31");
const augustAfter = await capText();
await page.screenshot({ path: `${OUT}/clock-5-august-budget.png`, fullPage: true });
check(
  "and setting September's cap leaves August's alone",
  /\$300\.00/.test(augustAfter) && !/\$500\.00/.test(augustAfter),
  augustAfter.replace(/\s+/g, " ").slice(0, 110),
);

// ---- recording a date that is not today ---------------------------------
await page.click('[data-testid="tab-add"]');
await page.waitForTimeout(500);
await page.fill("#amount", "7.25");
await page.fill("#occurred-on", "2026-08-02");
await page.click('[data-testid="record"]');
await page.waitForTimeout(1200);

await page.click('[data-testid="tab-more"]');
await page.waitForTimeout(300);
await page.click('[data-testid="more-transactions"]');
await page.waitForTimeout(800);
const list = await page.locator('[data-testid="transaction-list"]').innerText();
await page.screenshot({ path: `${OUT}/clock-3-backdated.png`, fullPage: true });
check(
  "yesterday's receipt can be recorded as yesterday",
  /2 Aug 2026/.test(list),
  list.replace(/\s+/g, " ").slice(0, 100),
);

const real = errors.filter((e) => !/favicon|React DevTools|Failed to load resource/i.test(e));
check("no page errors", real.length === 0, real.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
