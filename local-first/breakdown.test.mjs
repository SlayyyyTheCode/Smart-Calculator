// The spending breakdown: a donut, and a period you choose.
//
// The chart is the easy part to get wrong quietly — a slice can be the right
// colour and the wrong size, or the total can disagree with the list beside it,
// and both look fine. So the geometry is measured rather than eyeballed: the
// arcs are read back out of the DOM and their angles compared to the amounts.
import { chromium } from "playwright-core";

const APP = process.env.BENCH_APP ?? "http://localhost:5174";
const OUT = process.env.SHOT_DIR ?? ".";
const TODAY = "2026-08-30";

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

await page.goto(`${APP}/?instance=brk${Date.now()}&today=${TODAY}`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="seed"]', { timeout: 30000 });
await page.click('[data-testid="seed"]');
await page.waitForTimeout(2500);

const tab = async (id) => {
  await page.click(`[data-testid="tab-${id}"]`);
  await page.waitForTimeout(700);
};
const goTo = async (id) => {
  await page.click('[data-testid="tab-more"]');
  await page.waitForTimeout(300);
  await page.click(`[data-testid="more-${id}"]`);
  await page.waitForTimeout(900);
};

// Seven categories so the fold to "Other" is exercised, and one of them far
// enough back in time to prove the period picker actually restricts.
const add = async (amount, category, date) => {
  await tab("add");
  await page.fill("#amount", amount);
  await page.selectOption("#category", { label: category });
  await page.fill("#occurred-on", date);
  await page.click('[data-testid="record"]');
  await page.waitForTimeout(1200);
};

await add("400.00", "Household", "2026-08-28");
await add("200.00", "Food", "2026-08-28");
await add("150.00", "Transportation", "2026-08-27");
await add("100.00", "Health", "2026-08-26");
await add("80.00", "Education", "2026-08-25");
await add("40.00", "Beauty", "2026-08-24");
await add("30.00", "Gift", "2026-08-23");
// Last year: inside "All time", outside every other preset.
await add("999.00", "Lottery", "2025-03-11");

await goTo("breakdown");
await page.screenshot({ path: `${OUT}/breakdown-1-month.png`, fullPage: true });

// ---- the numbers -------------------------------------------------------
const title = await page.locator("main h2, main h3").first().innerText().catch(() => "");
const heading = await page.locator("main").innerText();
check(
  "this month totals the seven entries, not the old one",
  /\$1,000\.00/.test(heading) && !/\$1,999\.00/.test(heading),
  (heading.match(/\$[\d,]+\.\d{2}/) ?? ["?"])[0],
);

const centre = await page.locator('[data-testid="donut-centre"]').innerText();
check("the donut centre carries the total", centre.trim() === "$1,000.00", centre.trim());

// ---- the geometry ------------------------------------------------------
// Five categories get a slice; the remaining two fold into Other. A slice that
// is the right colour and the wrong size still looks correct.
const slices = await page.$$eval('[data-testid="donut-slice"]', (nodes) =>
  nodes.map((n) => ({ label: n.dataset.label, d: n.getAttribute("d") })),
);
check("five categories plus a remainder", slices.length === 6, `${slices.length} slices`);
check("the sixth is the fold, and says how many", /^Other \(2\)$/.test(slices[5]?.label ?? ""), slices[5]?.label ?? "");
check(
  "slices are ordered largest first",
  slices.slice(0, 5).map((s) => s.label).join(",") === "Household,Food,Transportation,Health,Education",
  slices.slice(0, 5).map((s) => s.label).join(","),
);

// Household is 400 of 1000, so its arc must sweep about 40% of the circle.
// Read the sweep back from the path rather than trusting the input.
const sweep = await page.evaluate(() => {
  const path = document.querySelector('[data-testid="donut-slice"]');
  const box = path.getBBox();
  return { w: Math.round(box.width), h: Math.round(box.height) };
});
check(
  "the largest arc is drawn at a plausible size",
  sweep.w > 90 && sweep.h > 90 && sweep.w < 230 && sweep.h < 230,
  `${sweep.w}x${sweep.h}px bounding box`,
);

const gapless = await page.evaluate(() => {
  const paths = [...document.querySelectorAll('[data-testid="donut-slice"]')];
  return paths.every((p) => (p.getAttribute("d") ?? "").length > 40);
});
check("every slice actually has an arc", gapless, "");

// ---- the table carries the tail ----------------------------------------
const rows = await page.$$eval('[data-testid="breakdown-list"] li', (n) =>
  n.map((li) => li.textContent.replace(/\s+/g, " ").trim()),
);
check("the list holds every category, not just the five", rows.length === 7, `${rows.length} rows`);
check("including the ones folded into Other", rows.some((r) => r.startsWith("Beauty")) && rows.some((r) => r.startsWith("Gift")), "");
check("shares are shown", /40%/.test(rows[0]) && /\$400\.00/.test(rows[0]), rows[0]);

// ---- the period picker -------------------------------------------------
await page.click('[data-testid="range-all"]');
await page.waitForTimeout(700);
const allTime = await page.locator("main").innerText();
await page.screenshot({ path: `${OUT}/breakdown-2-alltime.png`, fullPage: true });
check("all time picks up last year's entry", /\$1,999\.00/.test(allTime), (allTime.match(/\$[\d,]+\.\d{2}/) ?? ["?"])[0]);
check("and Lottery becomes the largest slice",
  (await page.$$eval('[data-testid="donut-slice"]', (n) => n[0]?.dataset.label)) === "Lottery", "");

await page.click('[data-testid="range-7d"]');
await page.waitForTimeout(700);
const week = await page.locator("main").innerText();
// Today is the 30th, so the window opens on the 24th and the Gift recorded on
// the 23rd falls outside it: $1,000 less $30. Asserting the round number would
// have passed while an off-by-one at the boundary went unnoticed.
check(
  "seven days stops exactly at the seventh day back",
  /\$970\.00/.test(week) && !/\$1,999\.00/.test(week),
  (week.match(/\$[\d,]+\.\d{2}/) ?? ["?"])[0],
);
const weekRows = await page.$$eval('[data-testid="breakdown-list"] li', (n) => n.length);
check("and the excluded day is gone from the list too", weekRows === 6, `${weekRows} rows`);

await page.click('[data-testid="range-year"]');
await page.waitForTimeout(700);
check(
  "this year excludes last year",
  !/\$1,999\.00/.test(await page.locator("main").innerText()),
  "",
);

// A period with nothing in it must say so rather than draw an empty ring.
await page.fill('[data-testid="from"]', "2026-01-01");
await page.fill('[data-testid="to"]', "2026-01-31");
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/breakdown-3-empty.png`, fullPage: true });
check(
  "an empty period says so instead of drawing nothing",
  /Nothing spent in this period/.test(await page.locator("main").innerText()),
  "",
);

// Custom range covering just the older entry.
await page.fill('[data-testid="from"]', "2025-01-01");
await page.fill('[data-testid="to"]', "2025-12-31");
await page.waitForTimeout(900);
const custom = await page.locator("main").innerText();
await page.screenshot({ path: `${OUT}/breakdown-4-custom.png`, fullPage: true });
check("a custom period works", /\$999\.00/.test(custom), (custom.match(/\$[\d,]+\.\d{2}/) ?? ["?"])[0]);
check(
  "a single category needs no fold",
  (await page.$$eval('[data-testid="donut-slice"]', (n) => n.length)) === 1,
  "",
);

// ---- it reads without colour -------------------------------------------
const label = await page.locator('[data-testid="donut"]').getAttribute("aria-label");
check("the chart describes itself for a screen reader", /Lottery/.test(label ?? ""), (label ?? "").slice(0, 60));

const real = errors.filter((e) => !/favicon|React DevTools|Failed to load resource/i.test(e));
check("no page errors", real.length === 0, real.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
