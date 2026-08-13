// Changing the settings that used to be hardcoded, and proving nothing breaks.
//
// `const CURRENCY = "SGD"` lived in nine screens. Nine copies of a decision is
// nine chances for eight of them to be missed, so this checks the change lands
// on every screen rather than on the one that was easiest to reach.
//
// It also drives every screen in the app once with the new settings in force —
// the "does anything fall over" pass. A screen that throws renders nothing, and
// nothing is easy to mistake for empty.
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const APP = "http://localhost:5174";
const OUT = process.env.SHOT_DIR ?? ".";

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

const csv = ["Date,Description,Amount", "2026-08-05,BOOKSHOP,-25.00"].join("\n");
const csvPath = `${OUT}/params-fixture.csv`;
writeFileSync(csvPath, csv, "utf8");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

const instance = `param${Date.now()}`;
const load = () => page.goto(`${APP}/?instance=${instance}&today=2026-08-09`, { waitUntil: "networkidle" });

await load();
await page.waitForSelector('[data-testid="seed"]', { timeout: 30000 });
await page.click('[data-testid="seed"]');
await page.waitForTimeout(1200);

const goTo = async (id) => {
  await page.click('[data-testid="tab-more"]');
  await page.waitForTimeout(300);
  await page.click(`[data-testid="more-${id}"]`);
  await page.waitForTimeout(800);
};
const tab = async (id) => {
  await page.click(`[data-testid="tab-${id}"]`);
  await page.waitForTimeout(800);
};

// Something to look at on every screen.
await tab("add");
await page.fill("#amount", "1234.50");
await page.selectOption("#category", { index: 1 });
await page.click('[data-testid="record"]');
await page.waitForTimeout(1200);

await tab("budgets");
await page.fill("#limit", "2000.00");
await page.click('[data-testid="save-budget"]');
await page.waitForTimeout(1200);

// ---- the default ---------------------------------------------------------
await tab("dashboard");
const beforeText = await page.locator("main").innerText();
check("the default is Singapore dollars", /\$1,234\.50/.test(beforeText), (beforeText.match(/[^\s]*1,234\.50/) ?? ["?"])[0]);

// ---- change it -----------------------------------------------------------
await goTo("settings");
await page.fill('[data-testid="currency"]', "EUR");
await page.selectOption('[data-testid="locale"]', "de-DE");
await page.click('[data-testid="save-format"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/params-1-eur.png`, fullPage: true });

const preview = await page.locator('[data-testid="format-preview"]').innerText();
check("the settings screen shows the new format immediately", /EUR/.test(preview) && /1\.500,00/.test(preview), preview);

// German formatting is a good check precisely because it inverts both
// separators: 1.234,50 where en-SG writes 1,234.50. A screen still on the old
// setting is unmistakable rather than subtly different.
await tab("dashboard");
const dash = await page.locator("main").innerText();
await page.screenshot({ path: `${OUT}/params-2-dashboard.png`, fullPage: true });
check("the dashboard follows", /1\.234,50/.test(dash), (dash.match(/[\d.,]+\s*€|€\s*[\d.,]+/) ?? ["?"])[0]);

await goTo("transactions");
const tx = await page.locator('[data-testid="transaction-list"]').innerText();
check("the transaction list follows", /1\.234,50/.test(tx), tx.replace(/\s+/g, " ").slice(0, 60));

await tab("budgets");
const budgets = await page.locator("main").innerText();
check("budgets follow", /2\.000,00/.test(budgets), budgets.replace(/\s+/g, " ").slice(0, 80));

await goTo("income");
check("income follows", !/\$/.test(await page.locator("main").innerText()), "no dollar sign left");

await goTo("net-worth");
const worth = await page.locator("main").innerText();
check("net worth follows", /€/.test(worth) && !/\$/.test(worth), worth.replace(/\s+/g, " ").slice(0, 70));

// ---- it survives a restart ----------------------------------------------
await load();
await page.waitForTimeout(3000);
const afterReload = await page.locator("main").innerText();
check("the choice survives a restart", /1\.234,50/.test(afterReload), afterReload.replace(/\s+/g, " ").slice(0, 70));

// ---- a bad value is refused, not stored ---------------------------------
// The obvious check — format something and catch the error — does not work.
// Intl only rejects a malformed code; "XYZ" is three letters, so it is accepted
// and printed verbatim. This failed the first time it ran, with every screen
// reading "1.234,50 XYZ" and no error anywhere. Nothing crashing is exactly why
// it would have shipped.
await goTo("settings");
await page.fill('[data-testid="currency"]', "XYZ");
await page.click('[data-testid="save-format"]');
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/params-3-rejected.png`, fullPage: true });
const settingsText = await page.locator("main").innerText();
check("an invented currency code is refused", /not a currency code/i.test(settingsText), settingsText.replace(/\s+/g, " ").match(/XYZ[^.]*\./)?.[0] ?? "");

await tab("dashboard");
const stillFine = await page.locator("main").innerText();
check(
  "and nothing was stored — the old setting still stands",
  /1\.234,50/.test(stillFine) && !/XYZ/.test(stillFine),
  stillFine.replace(/\s+/g, " ").slice(0, 60),
);

// ---- every screen, once, with the new settings --------------------------
const screens = [
  ["dashboard", "tab"], ["add", "tab"], ["budgets", "tab"],
  ["transactions", "more"], ["income", "more"], ["goals", "more"], ["debts", "more"],
  ["net-worth", "more"], ["recurring", "more"], ["import", "more"], ["settings", "more"],
  ["sync", "more"],
];
const blank = [];
for (const [id, how] of screens) {
  if (how === "tab") await tab(id);
  else await goTo(id);
  const text = (await page.locator("main").innerText().catch(() => "")).trim();
  if (text.length < 20) blank.push(id);
}
check(
  "every screen renders with the changed settings",
  blank.length === 0,
  blank.length ? `blank: ${blank.join(", ")}` : `${screens.length} screens`,
);

// ---- and the features still work in the new currency --------------------
await goTo("recurring");
await page.fill("#rule-label", "Miete");
await page.fill("#rule-amount", "900.00");
await page.click('[data-testid="add-rule"]');
await page.waitForTimeout(1200);
await page.click('[data-testid="post-due"]');
await page.waitForTimeout(2500);
const posted = await page.locator('[data-testid="posted"]').innerText().catch(() => "");
check("recurring rules still post", /Posted \d+/.test(posted), posted);

await goTo("import");
await page.locator('[data-testid="csv-file"]').setInputFiles(csvPath);
await page.waitForTimeout(1500);
const summary = await page.locator('[data-testid="import-summary"]').innerText().catch(() => "");
check("import still previews, in the new currency", /25,00/.test(summary), summary.replace(/\s+/g, " ").slice(0, 90));
await page.click('[data-testid="commit-import"]');
await page.waitForTimeout(1500);
check("import still commits", /Imported 1/.test(await page.locator('[data-testid="import-done"]').innerText().catch(() => "")), "");

await goTo("goals");
await page.fill("#goal-name", "Urlaub");
await page.fill("#goal-target", "5000.00");
await page.click('[data-testid="add-goal"]');
await page.waitForTimeout(1200);
const goals = await page.locator('[data-testid="goal-list"]').innerText().catch(() => "");
check("goals still calculate", /5\.000,00/.test(goals), goals.replace(/\s+/g, " ").slice(0, 80));

await goTo("debts");
await page.fill("#debt-name", "Autokredit");
await page.fill("#debt-balance", "10000.00");
await page.fill("#debt-payment", "300.00");
await page.click('[data-testid="add-debt"]');
await page.waitForTimeout(1200);
const payoff = await page.locator('[data-testid="payoff"]').innerText().catch(() => "");
check("debt payoff still projects", /months/.test(payoff), payoff.replace(/\s+/g, " ").slice(0, 70));

// ---- and back again -----------------------------------------------------
await goTo("settings");
await page.fill('[data-testid="currency"]', "USD");
await page.selectOption('[data-testid="locale"]', "en-US");
await page.click('[data-testid="save-format"]');
await page.waitForTimeout(1500);
await tab("dashboard");
const usd = await page.locator("main").innerText();
await page.screenshot({ path: `${OUT}/params-4-usd.png`, fullPage: true });
check("changing again works, and goes back to Anglo separators", /\$1,234\.50/.test(usd), (usd.match(/\$[\d,.]+/) ?? ["?"])[0]);

const real = errors.filter((e) => !/favicon|React DevTools|Failed to load resource/i.test(e));
check("no page errors throughout", real.length === 0, real.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
