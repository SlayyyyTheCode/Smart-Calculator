// The last three screens: recurring rules, CSV import, settings.
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const APP = "http://localhost:5174";
const OUT = process.env.SHOT_DIR ?? ".";

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

// A bank export shaped like a real one: "Value Date" that must not beat "Date",
// a quoted thousands separator, and a credit.
const csv = [
  "Value Date,Date,Description,Amount",
  "2026-08-01,2026-08-02,COFFEE HOUSE,-4.80",
  '2026-08-03,2026-08-04,SUPERMARKET,"-1,234.50"',
  "2026-08-05,2026-08-06,SALARY AUG,5000.00",
].join("\n");
const csvPath = `${OUT}/import-fixture.csv`;
writeFileSync(csvPath, csv, "utf8");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(`${APP}/?instance=r${Date.now()}`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="seed"]', { timeout: 30000 });
await page.click('[data-testid="seed"]');
await page.waitForTimeout(1200);

// Everything below runs with no server reachable.
await context.setOffline(true);

const goTo = async (id) => {
  await page.click('[data-testid="tab-more"]');
  await page.waitForTimeout(300);
  await page.click(`[data-testid="more-${id}"]`);
  await page.waitForTimeout(700);
};

// ---- recurring rules ----------------------------------------------------
await goTo("recurring");

// A fixed rule: same amount, posts confirmed.
await page.fill("#rule-label", "Rent");
await page.fill("#rule-amount", "1800.00");
await page.click('[data-testid="add-rule"]');
await page.waitForTimeout(1200);

// A variable one: posts a draft from the estimate.
await page.locator('label:has-text("Recurring")').first().click();
await page.waitForTimeout(300);
await page.fill("#rule-label", "Electricity");
await page.fill("#rule-amount", "120.00");
await page.click('[data-testid="add-rule"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/l2c-1-rules.png`, fullPage: true });

const ruleList = await page.locator('[data-testid="rule-list"]').innerText();
check("both kinds of rule are stored and labelled apart", /Fixed/.test(ruleList) && /Estimate/.test(ruleList), ruleList.replace(/\s+/g, " ").slice(0, 110));
check("the recurrence is described in words", /month/i.test(ruleList), ruleList.replace(/\s+/g, " ").slice(0, 80));

await page.click('[data-testid="post-due"]');
await page.waitForTimeout(2500);
const posted = await page.locator('[data-testid="posted"]').innerText().catch(() => "");
await page.screenshot({ path: `${OUT}/l2c-2-posted.png`, fullPage: true });
check("posting what is due reports what it did", /Posted \d+/.test(posted), posted);

// The fixed rule counts; the estimate must not.
await page.click('[data-testid="tab-dashboard"]');
await page.waitForTimeout(1000);
const dash = await page.locator("main").innerText();
await page.screenshot({ path: `${OUT}/l2c-3-after-posting.png`, fullPage: true });
check("the fixed rule's postings count toward spending", /\$1,800\.00|\$3,600\.00|\$5,400\.00/.test(dash), dash.match(/\$[\d,.]+/g)?.slice(0, 3).join(" ") ?? "");

await goTo("transactions");
const txList = await page.locator('[data-testid="transaction-list"]').innerText();
check("the estimate is posted as a draft", (await page.locator('[data-testid="draft-badge"]').count()) > 0, txList.replace(/\s+/g, " ").slice(0, 90));

// ---- CSV import ---------------------------------------------------------
await goTo("import");
await page.locator('[data-testid="csv-file"]').setInputFiles(csvPath);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/l2c-4-import-preview.png`, fullPage: true });

const summary = await page.locator('[data-testid="import-summary"]').innerText().catch(() => "");
check("the import previews before committing", /3 to import/.test(summary), summary);
check('the "Date" column beats "Value Date"', /dates from "Date"/.test(summary), summary);
// The totals were NaN once, from reading the wrong field names off the shipped
// summary. A number that is not a number is worse than a missing one.
check("the preview totals are real numbers", !/NaN/.test(summary), summary);
check("the preview totals add up", /\$1,239\.30 out/.test(summary) && /\$5,000\.00 in/.test(summary), summary);

const preview = await page.locator('[data-testid="import-preview"]').innerText().catch(() => "");
check("a quoted thousands separator survives", /1,234\.50/.test(preview), preview.replace(/\s+/g, " ").slice(0, 100));
check("the credit is read as income", /\+\$5,000\.00/.test(preview), preview.replace(/\s+/g, " ").slice(0, 100));

await page.click('[data-testid="commit-import"]');
await page.waitForTimeout(2000);
const done = await page.locator('[data-testid="import-done"]').innerText().catch(() => "");
check("the import commits", /Imported 3/.test(done), done);

// ---- settings -----------------------------------------------------------
await goTo("settings");
const beforeArchive = await page.locator('[data-testid="category-list"]').innerText();
await page.locator('[data-testid="toggle-archive"]').first().click();
await page.waitForTimeout(1000);
const afterArchive = await page.locator('[data-testid="category-list"]').innerText();
await page.screenshot({ path: `${OUT}/l2c-5-settings.png`, fullPage: true });
check("a category can be archived rather than deleted", beforeArchive !== afterArchive && (await page.locator('[data-testid="toggle-archive"]').first().innerText()) === "Restore");

await page.fill("#account-name", "Savings");
await page.fill("#account-opening", "1000.00");
await page.click('[data-testid="add-account"]');
await page.waitForTimeout(1200);
const accountList = await page.locator('[data-testid="account-list"]').innerText();
check("an account can be added and shows a balance", /Savings/.test(accountList) && /\$1,000\.00/.test(accountList), accountList.replace(/\s+/g, " ").slice(0, 110));

// Deleting. Never covered until the type checker showed the flag was being
// sent as a boolean where Evolu wants 0 or 1 — a delete button that may never
// have deleted anything.
await goTo("transactions");
const beforeDelete = await page.locator('[data-testid="transaction-list"] > li').count();
await page.locator('[data-testid="delete"]').first().click();
await page.waitForTimeout(1200);
const afterDelete = await page.locator('[data-testid="transaction-list"] > li').count();
await page.screenshot({ path: `${OUT}/l2c-6-after-delete.png`, fullPage: true });
check("deleting a transaction removes it", afterDelete === beforeDelete - 1, `${beforeDelete} -> ${afterDelete}`);

// Online only long enough to fetch the page itself — there is no service worker
// in dev, and nothing but this device holds the data anyway.
await context.setOffline(false);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await context.setOffline(true);
await goTo("transactions");
const afterReload = await page.locator('[data-testid="transaction-list"] > li').count();
check("and it stays deleted after a restart", afterReload === afterDelete, `${afterDelete} -> ${afterReload}`);

const real = errors.filter((e) => !/favicon|React DevTools|Failed to load resource/i.test(e));
check("no page errors", real.length === 0, real.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
