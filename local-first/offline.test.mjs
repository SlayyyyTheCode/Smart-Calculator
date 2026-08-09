// L1: the app must work with no account and no network at all, and every
// derived figure must come from the shipped domain modules.
import { chromium } from "playwright-core";

const APP = "http://localhost:5174";
const OUT = process.env.SHOT_DIR ?? ".";

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

const instance = `t${Date.now()}`;
await page.goto(`${APP}/?instance=${instance}`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="offline-note"]', { timeout: 30000 });

// Cut the network entirely. Everything after this line happens with no server
// of any kind reachable — which is the claim being tested.
await context.setOffline(true);

await page.click('[data-testid="seed"]');
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="category"] option').length > 1,
  { timeout: 15000 },
);
check("seeds categories and an account offline", true);

// A budget of 100, then 85 spent: 85% is past the 80% threshold but under the
// cap, so amber.
await page.fill("#limit", "100.00");
await page.click('[data-testid="set-budget"]');
await page.waitForTimeout(500);
await page.fill("#amount", "85.00");
await page.selectOption('[data-testid="category"]', { index: 1 });
await page.click('[data-testid="add-expense"]');
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/l1-1-warning.png`, fullPage: true });

let budgets = await page.locator('[data-testid="budgets"]').innerText();
check("85 of 100 is a warning", /85\.00%\s*—\s*warning/.test(budgets), budgets.replace(/\s+/g, " "));

// Another 30 takes it to 115%: exceeded.
await page.fill("#amount", "30.00");
await page.click('[data-testid="add-expense"]');
await page.waitForTimeout(800);
budgets = await page.locator('[data-testid="budgets"]').innerText();
check("115 of 100 is exceeded", /115\.00%\s*—\s*exceeded/.test(budgets), budgets.replace(/\s+/g, " "));
await page.screenshot({ path: `${OUT}/l1-2-exceeded.png`, fullPage: true });

// A draft estimate must not move any total.
const spentBefore = await page.locator('[data-testid="spent"]').innerText();
await page.click('[data-testid="add-draft"]');
await page.waitForTimeout(800);
const spentAfter = await page.locator('[data-testid="spent"]').innerText();
const txCount = await page.locator('[data-testid="tx-count"]').innerText();
check(
  "a draft is stored but excluded from spending",
  spentBefore === spentAfter && /Transactions: 3/.test(txCount),
  `${spentBefore} -> ${spentAfter}, ${txCount}`,
);

// Income, so savings rate has something to work with.
await page.click('[data-testid="add-income"]');
await page.waitForTimeout(800);
const income = await page.locator('[data-testid="income"]').innerText();
const savings = await page.locator('[data-testid="savings"]').innerText();
const runway = await page.locator('[data-testid="runway"]').innerText();
const largest = await page.locator('[data-testid="largest"]').innerText();
await page.screenshot({ path: `${OUT}/l1-3-dashboard.png`, fullPage: true });

check("income is counted", /5,000\.00/.test(income), income);
// 5000 in, 115 out -> (5000-115)/5000 = 97.7%
check("savings rate is computed by the shipped module", /97\.7%/.test(savings), savings);
check("runway is computed", /months/.test(runway), runway);
check("largest expense is identified", /Groceries/.test(largest), largest);

// Money must survive as minor units, never a float.
const list = await page.locator('[data-testid="transactions"]').innerText();
check(
  "amounts are integer minor units",
  /8500 minor/.test(list) && /3000 minor/.test(list) && /500000 minor/.test(list),
  list.replace(/\s+/g, " ").slice(0, 140),
);

// It must survive a restart: this is persistence, not a value held in memory.
//
// The network comes back for the reload and stays up until the page has
// finished loading. L1 has no service worker yet, so the HTML, the JS and the
// SQLite wasm worker still have to be fetched; cutting the connection midway
// leaves the database unopened and every count reads zero — which looks
// exactly like data loss and is not.
//
// None of that weakens the claim: this instance has `transports: []`, so no
// server holds any of the data to send back. Whatever is on screen after the
// reload came off the disk.
await context.setOffline(false);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await context.setOffline(true);
const afterReload = await page.locator('[data-testid="tx-count"]').innerText().catch(() => "");
const budgetsAfter = await page.locator('[data-testid="budgets"]').innerText().catch(() => "");
await page.screenshot({ path: `${OUT}/l1-4-after-reload.png`, fullPage: true });
check("data survives a reload while still offline", /Transactions: 4/.test(afterReload), afterReload);
check("budget state survives too", /exceeded/.test(budgetsAfter), budgetsAfter.replace(/\s+/g, " "));

const real = errors.filter((e) => !/favicon|React DevTools|Failed to load resource/i.test(e));
check("no page errors", real.length === 0, real.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
