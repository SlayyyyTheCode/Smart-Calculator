// Income categories, CPF, and take-home pay, through the screens.
//
// The arithmetic is unit-tested against the CPF Board's own tables in
// src/lib/domain/cpf.test.ts. What this checks is the part unit tests cannot:
// that the right figure reaches the right screen, that it is stored rather than
// recomputed, and that it survives a restart.
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

const instance = `cpf${Date.now()}`;
const load = () => page.goto(`${APP}/?instance=${instance}&today=2026-08-15`, { waitUntil: "networkidle" });

await load();
await page.waitForSelector('[data-testid="seed"]', { timeout: 30000 });
await page.click('[data-testid="seed"]');
await page.waitForTimeout(1500);

const tab = async (id) => {
  await page.click(`[data-testid="tab-${id}"]`);
  await page.waitForTimeout(800);
};
const goTo = async (id) => {
  await page.click('[data-testid="tab-more"]');
  await page.waitForTimeout(300);
  await page.click(`[data-testid="more-${id}"]`);
  await page.waitForTimeout(800);
};
const toIncome = async () => {
  await tab("add");
  await page.locator('label:has-text("Income")').first().click();
  await page.waitForTimeout(400);
};

// ---- the categories exist and are separated ------------------------------
await toIncome();
const incomeOptions = await page.locator("#category option").allInnerTexts();
await page.screenshot({ path: `${OUT}/cpf-1-income-categories.png`, fullPage: true });

const wanted = [
  "General Income", "Gross Income", "Dividend", "Commissions and Fees",
  "Royalties", "Interests", "Capital gains", "Freelance Income",
];
const missing = wanted.filter((name) => !incomeOptions.includes(name));
check("every income category is offered", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : `${wanted.length} categories`);

check(
  "expense categories are not offered under income",
  !incomeOptions.includes("Food") && !incomeOptions.includes("Household"),
  incomeOptions.join(", ").slice(0, 90),
);

// Switched back explicitly. Clicking the Add tab while already on Add does not
// remount the form, so the direction stays where it was left — correct
// behaviour, and a trap for a test that assumes otherwise.
await page.locator('label:has-text("Expense")').first().click();
await page.waitForTimeout(400);
const expenseOptions = await page.locator("#category option").allInnerTexts();
check(
  "and income categories are not offered under expense",
  !expenseOptions.includes("Dividend") && expenseOptions.includes("Food"),
  expenseOptions.join(", ").slice(0, 80),
);

// ---- active against passive is decided by the category -------------------
await toIncome();
await page.selectOption("#category", { label: "Dividend" });
await page.waitForTimeout(400);
const passiveNote = await page.locator('[data-testid="income-type"]').innerText().catch(() => "");
check("a dividend is passive without being asked", /passive/i.test(passiveNote), passiveNote.replace(/\s+/g, " ").slice(0, 80));

await page.selectOption("#category", { label: "Freelance Income" });
await page.waitForTimeout(400);
const activeNote = await page.locator('[data-testid="income-type"]').innerText().catch(() => "");
check("freelance income is active", /active/i.test(activeNote), activeNote.replace(/\s+/g, " ").slice(0, 60));

// ---- CPF needs to be set up, and says so ---------------------------------
await page.selectOption("#category", { label: "Gross Income" });
await page.fill("#amount", "5000.00");
await page.waitForTimeout(500);
const unset = await page.locator('[data-testid="cpf-unset"]').innerText().catch(() => "");
check("before setup it says what is missing rather than silently doing nothing", /Settings/.test(unset), unset.replace(/\s+/g, " ").slice(0, 80));

// ---- set it up -----------------------------------------------------------
await goTo("settings");
await page.selectOption('[data-testid="residency"]', "citizen_or_pr3");
await page.fill('[data-testid="birth-date"]', "1994-03-20"); // 32 on 2026-08-15
await page.click('[data-testid="save-cpf"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/cpf-2-settings.png`, fullPage: true });
const status = await page.locator('[data-testid="cpf-status"]').innerText();
check("settings confirms the age it worked out", /Age 32/.test(status), status.replace(/\s+/g, " ").slice(0, 90));

// ---- the deduction is shown before committing ----------------------------
await toIncome();
await page.selectOption("#category", { label: "Gross Income" });
await page.fill("#amount", "5000.00");
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/cpf-3-breakdown.png`, fullPage: true });

const cpfAmount = await page.locator('[data-testid="cpf-amount"]').innerText().catch(() => "");
const takeHome = await page.locator('[data-testid="cpf-take-home"]').innerText().catch(() => "");
// 20% of $5,000 at age 32 = $1,000, leaving $4,000.
check("CPF is worked out as you type", /1,000\.00/.test(cpfAmount), cpfAmount);
check("and take-home with it", /4,000\.00/.test(takeHome), takeHome);

const band = await page.locator('[data-testid="cpf-breakdown"]').innerText();
check("it names the age band it used", /55 and below/.test(band), band.replace(/\s+/g, " ").slice(0, 70));

await page.click('[data-testid="record"]');
await page.waitForTimeout(1500);

// ---- the dashboard shows it ----------------------------------------------
await tab("dashboard");
const dash = await page.locator("main").innerText();
await page.screenshot({ path: `${OUT}/cpf-4-dashboard.png`, fullPage: true });
check("the dashboard shows take-home pay", /Take home/.test(dash), (dash.match(/Take home\s+\S+/) ?? ["?"])[0]);
check("take-home is gross less CPF", /\$4,000\.00/.test(dash), (dash.match(/\$4,000\.00/) ?? ["not found"])[0]);
check("and CPF is shown separately", /\$1,000\.00/.test(dash), (dash.match(/\$1,000\.00/) ?? ["not found"])[0]);
check("gross income is still reported as gross", /\$5,000\.00/.test(dash), (dash.match(/\$5,000\.00/) ?? ["not found"])[0]);

// ---- the ceiling ---------------------------------------------------------
await toIncome();
await page.selectOption("#category", { label: "Gross Income" });
await page.fill("#amount", "12000.00");
await page.waitForTimeout(700);
const capped = await page.locator('[data-testid="cpf-breakdown"]').innerText();
await page.screenshot({ path: `${OUT}/cpf-5-ceiling.png`, fullPage: true });
// The Ordinary Wage ceiling is $8,000, so 20% stops at $1,600.
check("the wage ceiling caps the contribution", /1,600\.00/.test(capped), capped.replace(/\s+/g, " ").slice(0, 90));
check("and the screen says why", /ceiling/i.test(capped), "");

// ---- income that is not salary is untouched ------------------------------
await toIncome();
await page.selectOption("#category", { label: "Dividend" });
await page.fill("#amount", "800.00");
await page.waitForTimeout(600);
const noCpf = await page.locator('[data-testid="cpf-breakdown"]').count();
check("a dividend has no CPF taken from it", noCpf === 0, `${noCpf} breakdowns shown`);
await page.click('[data-testid="record"]');
await page.waitForTimeout(1400);

await tab("dashboard");
const withDividend = await page.locator("main").innerText();
check(
  "passive income lands in the passive column",
  /\$800\.00 passive/.test(withDividend),
  (withDividend.match(/\$[\d,.]+ active · \$[\d,.]+ passive/) ?? ["?"])[0],
);
// $5,800 income less $1,000 CPF.
check("take-home counts the dividend but deducts only the salary's CPF", /\$4,800\.00/.test(withDividend), (withDividend.match(/\$4,800\.00/) ?? ["not found"])[0]);

// ---- an older worker pays less -------------------------------------------
await goTo("settings");
await page.fill('[data-testid="birth-date"]', "1958-01-10"); // 68 on 2026-08-15
await page.click('[data-testid="save-cpf"]');
await page.waitForTimeout(1500);
await toIncome();
await page.selectOption("#category", { label: "Gross Income" });
await page.fill("#amount", "5000.00");
await page.waitForTimeout(700);
const older = await page.locator('[data-testid="cpf-amount"]').innerText();
// Above 65 to 70 is 7.5%: $375 on $5,000.
check("an older worker is charged the lower band", /375\.00/.test(older), older);

// ---- the stored figure is not recomputed ---------------------------------
// The earlier salary was recorded at 32. Changing the date of birth must not
// restate it — the deduction is a fact about that payment.
await tab("dashboard");
const afterAgeChange = await page.locator("main").innerText();
check(
  "changing your age does not rewrite last month's payslip",
  /\$1,000\.00/.test(afterAgeChange),
  (afterAgeChange.match(/CPF this month[\s\S]{0,40}/) ?? ["?"])[0].replace(/\s+/g, " "),
);

// ---- and it survives a restart -------------------------------------------
await load();
await page.waitForTimeout(3000);
const afterReload = await page.locator("main").innerText();
check("all of it survives a restart", /\$4,800\.00/.test(afterReload), afterReload.replace(/\s+/g, " ").slice(0, 90));

const real = errors.filter((e) => !/favicon|React DevTools|Failed to load resource/i.test(e));
check("no page errors", real.length === 0, real.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
