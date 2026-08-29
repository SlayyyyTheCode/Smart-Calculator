// The starting categories, and the seventeenth.
//
// Sixteen headings ship with the app; the point of the seventeenth is that
// there is no seventeenth — anyone can add their own, at the moment they need
// it, without leaving the screen they are recording on.
import { chromium } from "playwright-core";

const APP = process.env.BENCH_APP ?? "http://localhost:5174";
const OUT = process.env.SHOT_DIR ?? ".";

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

const EXPECTED = [
  "Food", "Social Life", "Self-Development", "Transportation", "Culture",
  "Household", "Apparel", "Beauty", "Health", "Education", "Gift",
  "Electronic", "Tax", "Lottery", "Donation/Prayer", "Miscellaneous",
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(`${APP}/?instance=cat${Date.now()}&today=2026-08-29`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="seed"]', { timeout: 30000 });
await page.click('[data-testid="seed"]');
await page.waitForTimeout(2000);

const options = async () =>
  page.$$eval("#category option", (nodes) => nodes.map((n) => n.textContent.trim()));

await page.click('[data-testid="tab-add"]');
await page.waitForTimeout(800);
const expense = await options();
await page.screenshot({ path: `${OUT}/cat-1-expense.png`, fullPage: true });

check(
  "all sixteen expense categories are there",
  EXPECTED.every((name) => expense.includes(name)),
  EXPECTED.filter((n) => !expense.includes(n)).join(", ") || `${EXPECTED.length} present`,
);
check("they are in the order they were listed", 
  EXPECTED.every((name, i) => expense.indexOf(name) === i + 1),
  expense.slice(1, 5).join(" · "));
check("the old six-category set is gone", !expense.includes("Groceries") && !expense.includes("Entertainment"), expense.slice(1, 4).join(" · "));

// Income is a separate list and must not have picked these up.
await page.locator('label:has-text("Income")').first().click();
await page.waitForTimeout(500);
const income = await options();
check(
  "income keeps its own categories",
  income.includes("Gross Income") && income.includes("Dividend") && !income.includes("Food"),
  income.slice(1, 4).join(" · "),
);

// ---- the seventeenth ----------------------------------------------------
await page.locator('label:has-text("Expense")').first().click();
await page.waitForTimeout(500);
check("the picker offers to add one", (await options()).some((o) => /New category/i.test(o)), "");

await page.selectOption("#category", { label: "+ New category…" });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/cat-2-adding.png`, fullPage: true });
check("choosing it asks for a name", await page.locator('[data-testid="new-category"]').isVisible(), "");

await page.fill('[data-testid="new-category"]', "Pet care");
await page.click('[data-testid="save-category"]');
await page.waitForTimeout(1500);

const afterAdd = await options();
check("the new category joins the list", afterAdd.includes("Pet care"), afterAdd.slice(-3).join(" · "));
check(
  "and is already selected, so recording continues",
  (await page.$eval("#category", (n) => n.selectedOptions[0].textContent.trim())) === "Pet care",
  "",
);

// It has to survive being used, not merely appear.
await page.fill("#amount", "31.00");
await page.click('[data-testid="record"]');
await page.waitForTimeout(1600);
await page.click('[data-testid="tab-more"]');
await page.waitForTimeout(300);
await page.click('[data-testid="more-transactions"]');
await page.waitForTimeout(900);
const list = await page.locator('[data-testid="transaction-list"]').innerText();
await page.screenshot({ path: `${OUT}/cat-3-recorded.png`, fullPage: true });
check("an expense files under it", /Pet care/.test(list) && /31\.00/.test(list), list.replace(/\s+/g, " ").slice(0, 70));

// ---- and a custom income category is income, not expense ----------------
await page.click('[data-testid="tab-add"]');
await page.waitForTimeout(600);
await page.locator('label:has-text("Income")').first().click();
await page.waitForTimeout(400);
await page.selectOption("#category", { label: "+ New category…" });
await page.waitForTimeout(400);
await page.fill('[data-testid="new-category"]', "Rental income");
await page.click('[data-testid="save-category"]');
await page.waitForTimeout(1500);
check("a category added under Income is an income category", (await options()).includes("Rental income"), "");

await page.locator('label:has-text("Expense")').first().click();
await page.waitForTimeout(500);
check(
  "and does not leak into the expense list",
  !(await options()).includes("Rental income"),
  "",
);

// ---- it survives a restart ----------------------------------------------
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(3000);
await page.click('[data-testid="tab-add"]');
await page.waitForTimeout(900);
check("custom categories survive a restart", (await options()).includes("Pet care"), "");

const real = errors.filter((e) => !/favicon|React DevTools|Failed to load resource/i.test(e));
check("no page errors", real.length === 0, real.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
