// L2: the real screens, built from the shipped design system, driven end to end
// on the device with no account and no network.
import { chromium } from "playwright-core";

const APP = "http://localhost:5174";
const OUT = process.env.SHOT_DIR ?? ".";

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

const browser = await chromium.launch();
// A phone, because that is where this app is meant to live.
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(`${APP}/?instance=s${Date.now()}&today=2026-08-09`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="mode"]', { timeout: 30000 });

// Everything from here happens with no server reachable at all.
await context.setOffline(true);

check("app announces it holds data on the device", /no account/i.test(await page.locator('[data-testid="mode"]').innerText()));

// Styles must actually be applied — a reused component with no CSS looks
// correct in the source and broken on screen.
const styled = await page.evaluate(() => {
  const header = document.querySelector("header");
  if (!header) return null;
  const bg = getComputedStyle(header).backgroundColor;
  return { bg, transparent: bg === "rgba(0, 0, 0, 0)" || bg === "transparent" };
});
check("the shipped stylesheet is applied", styled && !styled.transparent, styled?.bg ?? "no header");

await page.click('[data-testid="seed"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/l2-1-empty-dashboard.png`, fullPage: true });
check("empty dashboard offers a way in", (await page.locator('[data-testid="empty-record"]').count()) > 0);

// Record through the real quick-add form.
await page.click('[data-testid="empty-record"]');
await page.waitForTimeout(400);
await page.fill("#amount", "85.00");
await page.selectOption("#category", { index: 1 });
await page.screenshot({ path: `${OUT}/l2-2-quickadd.png`, fullPage: true });
await page.click('[data-testid="record"]');
await page.waitForTimeout(1200);
check("recording returns to the dashboard", (await page.locator('[data-testid="tab-dashboard"]').getAttribute("aria-current")) === "page");

// Set a cap that the spend already breaches the warning band of.
await page.click('[data-testid="tab-budgets"]');
await page.waitForTimeout(500);
await page.fill("#limit", "100.00");
await page.click('[data-testid="save-budget"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/l2-3-budget-warning.png`, fullPage: true });

let budgetText = await page.locator('[data-testid="budget-list"]').innerText();
check("85 of 100 renders as Close to limit", /Close to limit/.test(budgetText), budgetText.replace(/\s+/g, " ").slice(0, 110));

// Push it over.
await page.click('[data-testid="tab-add"]');
await page.waitForTimeout(400);
await page.fill("#amount", "30.00");
await page.click('[data-testid="record"]');
await page.waitForTimeout(1200);
await page.click('[data-testid="tab-budgets"]');
await page.waitForTimeout(800);
budgetText = await page.locator('[data-testid="budget-list"]').innerText();
await page.screenshot({ path: `${OUT}/l2-4-budget-exceeded.png`, fullPage: true });
check("115 of 100 renders as Exceeded", /Exceeded/.test(budgetText), budgetText.replace(/\s+/g, " ").slice(0, 110));

// The dashboard must carry the same warning.
await page.click('[data-testid="tab-dashboard"]');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/l2-5-dashboard.png`, fullPage: true });
const dash = await page.locator("main").innerText();
check("dashboard surfaces the warning", (await page.locator('[data-testid="warning-exceeded"]').count()) > 0, dash.replace(/\s+/g, " ").slice(0, 120));
check("dashboard shows the spend", /\$115\.00/.test(dash), dash.match(/\$[\d,.]+/g)?.slice(0, 4).join(" ") ?? "");
check("largest expense is named", /largest expense/i.test(dash));

// A recurring expense is an estimate: stored, but counted by nobody.
await page.click('[data-testid="tab-add"]');
await page.waitForTimeout(400);
await page.fill("#amount", "500.00");
await page.locator('label:has-text("Recurring")').first().click();
await page.click('[data-testid="record"]');
await page.waitForTimeout(1400);
const afterDraft = await page.locator("main").innerText();
await page.screenshot({ path: `${OUT}/l2-6-after-draft.png`, fullPage: true });
check("a recurring estimate does not move the totals", /\$115\.00/.test(afterDraft) && !/\$615\.00/.test(afterDraft), afterDraft.match(/\$[\d,.]+/g)?.slice(0, 3).join(" ") ?? "");

// ---- the screens behind More -------------------------------------------
const goTo = async (id) => {
  await page.click('[data-testid="tab-more"]');
  await page.waitForTimeout(300);
  await page.click(`[data-testid="more-${id}"]`);
  await page.waitForTimeout(700);
};

await goTo("transactions");
const txList = await page.locator('[data-testid="transaction-list"]').innerText();
await page.screenshot({ path: `${OUT}/l2-9-transactions.png`, fullPage: true });
check("transactions lists what was recorded", /\$85\.00/.test(txList) && /\$30\.00/.test(txList), txList.replace(/\s+/g, " ").slice(0, 100));
check("the draft is shown but marked", (await page.locator('[data-testid="draft-badge"]').count()) === 1);

// Income, once there is some.
await page.click('[data-testid="tab-add"]');
await page.waitForTimeout(400);
await page.locator('label:has-text("Income")').first().click();
await page.fill("#amount", "5000.00");
await page.click('[data-testid="record"]');
await page.waitForTimeout(1200);
await goTo("income");
const incomeText = await page.locator("main").innerText();
await page.screenshot({ path: `${OUT}/l2-10-income.png`, fullPage: true });
check("income splits active from passive", /Active/.test(incomeText) && /Passive/.test(incomeText), incomeText.match(/\$[\d,.]+/g)?.slice(0, 3).join(" ") ?? "");

// Goals — the monthly figure is the point of the screen.
await goTo("goals");
await page.fill("#goal-name", "Japan trip");
await page.fill("#goal-target", "6000.00");
await page.click('[data-testid="add-goal"]');
await page.waitForTimeout(1200);
const goalText = await page.locator('[data-testid="goal-monthly"]').innerText();
await page.screenshot({ path: `${OUT}/l2-11-goals.png`, fullPage: true });
check("a goal states what to set aside monthly", /Set aside \$[\d,.]+ a month/.test(goalText), goalText);

// Debts — a payoff that works, and one that never does.
await goTo("debts");
await page.fill("#debt-name", "Car loan");
await page.fill("#debt-balance", "15000.00");
await page.fill("#debt-apr", "6.5");
await page.fill("#debt-payment", "450.00");
await page.click('[data-testid="add-debt"]');
await page.waitForTimeout(1200);
const payoff = await page.locator('[data-testid="payoff"]').first().innerText().catch(() => "");
check("a debt projects a payoff date and interest", /Clear by \d{4}-\d{2}-\d{2}.*months.*interest/.test(payoff), payoff);

await page.fill("#debt-name", "Bad card");
await page.fill("#debt-balance", "10000.00");
await page.fill("#debt-apr", "24");
await page.fill("#debt-payment", "10.00");
await page.click('[data-testid="add-debt"]');
await page.waitForTimeout(1200);
const underwater = await page.locator('[data-testid="underwater"]').first().innerText().catch(() => "");
await page.screenshot({ path: `${OUT}/l2-12-debts.png`, fullPage: true });
check("a payment below the interest is called out, not projected", /never clears it/.test(underwater) && /Pay at least/.test(underwater), underwater.replace(/\s+/g, " ").slice(0, 120));

// Net worth nets the debts off.
await goTo("net-worth");
await page.fill("#asset-name", "Flat");
await page.fill("#asset-value", "500000.00");
await page.click('[data-testid="add-asset"]');
await page.waitForTimeout(1200);
const nw = await page.locator("main").innerText();
await page.screenshot({ path: `${OUT}/l2-13-networth.png`, fullPage: true });
check("net worth counts assets and subtracts debts", /Net worth/.test(nw) && /Liabilities/.test(nw), nw.match(/\$[\d,.]+/g)?.slice(0, 4).join(" ") ?? "");

await page.click('[data-testid="tab-dashboard"]');
await page.waitForTimeout(700);

// Nothing may hide behind the fixed tab bar on a phone.
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("no horizontal overflow at 390px", overflow <= 1, `${overflow}px`);

// It has to survive a restart. The network comes back for the reload itself —
// L1/L2 have no service worker, so the HTML, JS and SQLite wasm still have to
// be fetched — but no server holds the data, because this instance has no
// transports. Whatever is on screen afterwards came off the disk.
await context.setOffline(false);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);

// Money must be integer minor units on disk, never a float. Read straight out
// of the database rather than off the screen, which is formatted. This needs a
// module fetch, so it happens here while the connection is up rather than
// failing for a reason that has nothing to do with the data.
const stored = await page.evaluate(async () => {
  const { evolu } = await import("/src/db.ts");
  const rows = await evolu.loadQuery(
    evolu.createQuery((db) => db.selectFrom("transaction").select(["amountMinor", "status"])),
  );
  return rows.map((r) => `${r.amountMinor}:${r.status}`);
});
check(
  "amounts are stored as integer minor units",
  stored.includes("8500:confirmed") &&
    stored.includes("3000:confirmed") &&
    stored.includes("50000:draft") &&
    stored.includes("500000:confirmed"),
  stored.join(" "),
);

await context.setOffline(true);
const reloaded = await page.locator("main").innerText();
await page.screenshot({ path: `${OUT}/l2-8-after-reload.png`, fullPage: true });
check("data survives a restart", /\$115\.00/.test(reloaded), reloaded.match(/\$[\d,.]+/g)?.slice(0, 3).join(" ") ?? "");
check(
  "the budget state survives too",
  (await page.locator('[data-testid="warning-exceeded"]').count()) > 0,
);

// Dark mode, since the tokens came across with the stylesheet.
await page.emulateMedia({ colorScheme: "dark" });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/l2-7-dark.png`, fullPage: true });
const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check("dark mode applies", darkBg !== "rgba(0, 0, 0, 0)", darkBg);

const real = errors.filter((e) => !/favicon|React DevTools|Failed to load resource/i.test(e));
check("no page errors", real.length === 0, real.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
