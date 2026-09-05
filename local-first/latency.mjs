// Interaction latency: tap to painted, measured inside the page.
//
// The earlier benchmark timed navigation through the More menu as one number,
// which is two taps and a menu in between — it can only ever look slow. And
// every measurement crossed the Playwright boundary twice, so it carried IPC
// that no user experiences.
//
// Here the click is dispatched and the clock read entirely in page context,
// stopping after two animation frames, which is the first moment the new screen
// is actually on the glass.
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const APP = process.env.BENCH_APP ?? "http://localhost:5175";
const OUT = process.env.SHOT_DIR ?? ".";
const ROWS = Number(process.env.BENCH_ROWS ?? 3000);
const REPEATS = Number(process.env.BENCH_REPEATS ?? 7);
const TODAY = "2026-08-30";

const lines = ["Date,Description,Amount"];
const start = new Date(Date.UTC(2023, 7, 30));
for (let i = 0; i < ROWS; i += 1) {
  const day = new Date(start.getTime() + Math.floor(i / 2) * 86400000);
  lines.push(`${day.toISOString().slice(0, 10)},SHOP ${i},-${(((i * 37) % 9000) / 100 + 1.5).toFixed(2)}`);
}
const csvPath = `${OUT}/lat-${ROWS}.csv`;
writeFileSync(csvPath, lines.join("\n"), "utf8");

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto(`${APP}/?instance=lat${Date.now()}&today=${TODAY}`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="seed"]', { timeout: 30000 });
await page.click('[data-testid="seed"]');
await page.waitForTimeout(2000);

await page.click('[data-testid="tab-more"]');
await page.waitForTimeout(400);
await page.click('[data-testid="more-import"]');
await page.waitForTimeout(700);
await page.locator('[data-testid="csv-file"]').setInputFiles(csvPath);
await page.waitForSelector('[data-testid="import-summary"]', { timeout: 60000 });
await page.click('[data-testid="commit-import"]');
await page.waitForSelector('[data-testid="import-done"]', { timeout: 300000 });
await page.waitForTimeout(1500);

/**
 * Click one thing and stop the clock when the result has painted.
 *
 * Two animation frames: the first is scheduled after React commits, the second
 * fires once the browser has actually put those pixels up. One frame can return
 * before paint and flatter the number.
 */
const tap = (selector) =>
  page.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const t0 = performance.now();
    el.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - t0;
  }, selector);

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function measure(label, steps) {
  const samples = [];
  for (let i = 0; i < REPEATS; i += 1) {
    let worst = 0;
    for (const step of steps) {
      const ms = await tap(step);
      if (ms !== null) worst = Math.max(worst, ms);
      await page.waitForTimeout(120);
    }
    samples.push(worst);
  }
  const p50 = median(samples);
  const p95 = [...samples].sort((a, b) => a - b)[Math.max(0, Math.ceil(samples.length * 0.95) - 1)];
  const flag = p95 < 100 ? "ok " : "SLOW";
  console.log(
    `${flag} ${label.padEnd(34)} p50 ${p50.toFixed(0).padStart(4)} ms   p95 ${p95.toFixed(0).padStart(4)} ms`,
  );
  return { label, p50, p95 };
}

console.log(`\n=== interaction latency, ${ROWS} transactions, ${REPEATS} repeats ===\n`);

const out = [];
out.push(await measure("dashboard tab", ['[data-testid="tab-dashboard"]']));
out.push(await measure("budgets tab", ['[data-testid="tab-budgets"]']));
out.push(await measure("add tab", ['[data-testid="tab-add"]']));
out.push(await measure("open the More menu", ['[data-testid="tab-more"]']));
out.push(await measure("More -> transactions", ['[data-testid="tab-more"]', '[data-testid="more-transactions"]']));
out.push(await measure("More -> where it went", ['[data-testid="tab-more"]', '[data-testid="more-breakdown"]']));
out.push(await measure("More -> net worth", ['[data-testid="tab-more"]', '[data-testid="more-net-worth"]']));

// On the breakdown screen already: changing the period is the interaction that
// recomputes over every transaction.
await page.click('[data-testid="tab-more"]');
await page.waitForTimeout(300);
await page.click('[data-testid="more-breakdown"]');
await page.waitForTimeout(800);
out.push(await measure("breakdown: switch period", ['[data-testid="range-all"]', '[data-testid="range-7d"]']));

// Show more on a long list.
await page.click('[data-testid="tab-more"]');
await page.waitForTimeout(300);
await page.click('[data-testid="more-transactions"]');
await page.waitForTimeout(800);
out.push(await measure("transactions: show 100 more", ['[data-testid="show-more"]']));

const worst = out.reduce((a, b) => (b.p95 > a.p95 ? b : a));
console.log(`\nslowest: ${worst.label} at ${worst.p95.toFixed(0)} ms p95`);
console.log(JSON.stringify(out.map((o) => [o.label, Math.round(o.p50), Math.round(o.p95)])));

await browser.close();
