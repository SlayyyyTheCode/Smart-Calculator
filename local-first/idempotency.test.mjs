// Posting what is due, twice.
//
// On the server a unique index on (recurring_rule_id, occurred_on) made this
// safe no matter how many times the cron ran. Nothing enforces that here, so
// the guard is the rule's own cursor — and a guard that has never been tested
// is a guess. Double-posting means double-counted money.
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

await page.goto(`${APP}/?instance=idem${Date.now()}&today=2026-08-09`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="seed"]', { timeout: 30000 });
await page.click('[data-testid="seed"]');
await page.waitForTimeout(1200);
await context.setOffline(true);

const goTo = async (id) => {
  await page.click('[data-testid="tab-more"]');
  await page.waitForTimeout(300);
  await page.click(`[data-testid="more-${id}"]`);
  await page.waitForTimeout(700);
};


// Counted through the UI rather than a dynamic import: the import needs the
// network and this test deliberately has none.
const countTransactions = async () => {
  await goTo("transactions");
  const rows = await page.locator('[data-testid="transaction-list"] > li').count();
  await page.click('[data-testid="tab-more"]');
  await page.waitForTimeout(200);
  await page.click('[data-testid="more-recurring"]');
  await page.waitForTimeout(500);
  return rows;
};

await goTo("recurring");
await page.fill("#rule-label", "Rent");
await page.fill("#rule-amount", "1800.00");
await page.click('[data-testid="add-rule"]');
await page.waitForTimeout(1200);

// First posting.
await page.click('[data-testid="post-due"]');
await page.waitForTimeout(2500);
const firstMessage = await page.locator('[data-testid="posted"]').innerText();
const countAfterFirst = await countTransactions();
check("the first posting creates transactions", countAfterFirst > 0, `${firstMessage} → ${countAfterFirst} rows`);

// Second posting, immediately. Nothing new is due.
await page.click('[data-testid="post-due"]');
await page.waitForTimeout(2500);
const secondMessage = await page.locator('[data-testid="posted"]').innerText();
const countAfterSecond = await countTransactions();
await page.screenshot({ path: `${OUT}/idem-1-second-post.png`, fullPage: true });

check(
  "posting again posts nothing",
  countAfterSecond === countAfterFirst,
  `${countAfterFirst} → ${countAfterSecond} rows, message: "${secondMessage}"`,
);

// A third, after a reload, because the cursor has to survive a restart too.
await context.setOffline(false);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await context.setOffline(true);
await goTo("recurring");
await page.click('[data-testid="post-due"]');
await page.waitForTimeout(2500);
const countAfterReload = await countTransactions();
check(
  "and posts nothing after a restart either",
  countAfterReload === countAfterFirst,
  `${countAfterFirst} → ${countAfterReload} rows`,
);

// The dashboard total must match one month's rent, not several.
await page.click('[data-testid="tab-dashboard"]');
await page.waitForTimeout(1200);
const dash = await page.locator("main").innerText();
const spent = dash.match(/Spent this month\s+(\$[\d,.]+)/)?.[1] ?? "?";
check("the month's spend is one rent, not a multiple", spent === "$1,800.00", `spent ${spent}`);

const real = errors.filter((e) => !/favicon|React DevTools|Failed to load resource/i.test(e));
check("no page errors", real.length === 0, real.slice(0, 2).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
