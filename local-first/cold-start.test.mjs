// L5: a cold start with no network at all.
//
// The claim being tested is the one that separates a local-first app from a
// website that happens to keep a copy: kill the connection, close the app,
// open it again, and everything is still there and still works.
import { chromium } from "playwright-core";

const APP = "http://localhost:5175";
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

// --- first run, online: install the worker and record something ----------
await page.goto(`${APP}/?today=2026-08-09`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="mode"]', { timeout: 30000 });

const manifest = await page.request.get(`${APP}/manifest.webmanifest`);
check("a manifest is served", manifest.ok(), String(manifest.status()));
const manifestBody = manifest.ok() ? await manifest.json() : {};
check(
  "the manifest can support an install",
  Boolean(manifestBody.name && manifestBody.start_url && (manifestBody.icons ?? []).length >= 2),
  `${manifestBody.name ?? "?"} · ${(manifestBody.icons ?? []).length} icons · ${manifestBody.display ?? "?"}`,
);

// Wait for the service worker to take control and finish precaching.
const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  return reg?.active ? "active" : "none";
});
check("the service worker activates", swState === "active", swState);

await page.click('[data-testid="seed"]');
await page.waitForTimeout(1200);
await page.click('[data-testid="tab-add"]');
await page.waitForTimeout(400);
await page.fill("#amount", "64.00");
await page.selectOption("#category", { index: 1 });
await page.click('[data-testid="record"]');
await page.waitForTimeout(1500);
check("recorded while online", /\$64\.00/.test(await page.locator("main").innerText()));

// Give Workbox time to finish writing the precache.
await page.waitForTimeout(4000);
const precached = await page.evaluate(async () => {
  const names = await caches.keys();
  let total = 0;
  let wasm = 0;
  for (const name of names) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    total += keys.length;
    wasm += keys.filter((r) => r.url.endsWith(".wasm")).length;
  }
  return { names, total, wasm };
});
check("the shell is precached", precached.total > 5, `${precached.total} entries in ${precached.names.length} cache(s)`);
check(
  "the SQLite wasm is precached",
  precached.wasm > 0,
  "without it the database cannot open and every screen reads empty",
);

// --- now cut the network and cold start ----------------------------------
await context.setOffline(true);

// A full reload with no connection: HTML, JS, the worker script and the wasm
// all have to come from the cache or nothing renders.
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/l5-1-cold-start.png`, fullPage: true });

const afterCold = await page.locator("main").innerText().catch(() => "");
check("the app starts with no network", /Dashboard|Spent this month/.test(afterCold), afterCold.replace(/\s+/g, " ").slice(0, 80));
check("the data is still there", /\$64\.00/.test(afterCold), afterCold.match(/\$[\d,.]+/g)?.slice(0, 3).join(" ") ?? "");

// And it must still be usable, not merely visible.
await page.click('[data-testid="tab-add"]');
await page.waitForTimeout(500);
await page.fill("#amount", "9.99");
await page.click('[data-testid="record"]');
await page.waitForTimeout(1500);
const afterWrite = await page.locator("main").innerText().catch(() => "");
await page.screenshot({ path: `${OUT}/l5-2-write-offline.png`, fullPage: true });
check("it still accepts a new entry offline", /\$73\.99/.test(afterWrite), afterWrite.match(/\$[\d,.]+/g)?.slice(0, 3).join(" ") ?? "");

// A second cold start, still offline, to prove the first was not a fluke of
// a warm page cache.
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(4000);
const secondCold = await page.locator("main").innerText().catch(() => "");
await page.screenshot({ path: `${OUT}/l5-3-second-cold-start.png`, fullPage: true });
check("a second cold start also works", /\$73\.99/.test(secondCold), secondCold.match(/\$[\d,.]+/g)?.slice(0, 3).join(" ") ?? "");

const real = errors.filter(
  (e) => !/favicon|React DevTools|Failed to load resource|net::ERR_INTERNET_DISCONNECTED/i.test(e),
);
check("no page errors", real.length === 0, real.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
