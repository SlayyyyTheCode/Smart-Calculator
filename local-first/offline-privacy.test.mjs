// The central claim: with sync off, nothing leaves the device.
//
// It is the one thing a user cannot check for themselves and the one thing the
// store listing will say, so it is worth proving rather than asserting. Every
// request the page makes is recorded and classified: anything that is not this
// origin's own code is a request that should not exist.
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

const requests = [];
page.on("request", (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() ?? "" }));
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${APP}/?instance=priv${Date.now()}&today=2026-08-09`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="seed"]', { timeout: 30000 });
await page.click('[data-testid="seed"]');
await page.waitForTimeout(1200);

// Something identifiable enough to search the whole request log for.
const SECRET_AMOUNT = "4242.42";
const SECRET_MERCHANT = "ZZQQ-PRIVATE-MERCHANT";

await page.click('[data-testid="tab-add"]');
await page.waitForTimeout(500);
await page.fill("#amount", SECRET_AMOUNT);
await page.selectOption("#category", { index: 1 });
await page.click('[data-testid="record"]');
await page.waitForTimeout(1500);

await page.click('[data-testid="tab-more"]');
await page.waitForTimeout(300);
await page.click('[data-testid="more-settings"]');
await page.waitForTimeout(700);
await page.fill("#category-name", SECRET_MERCHANT);
await page.click('[data-testid="add-category"]');
await page.waitForTimeout(1500);

await page.click('[data-testid="tab-dashboard"]');
await page.waitForTimeout(1200);

// ---- what was sent ------------------------------------------------------
const external = requests.filter((r) => {
  if (r.url.startsWith(APP)) return false;         // this app's own code
  if (r.url.startsWith("data:")) return false;     // inlined, never transmitted
  if (r.url.startsWith("blob:")) return false;     // the SQLite worker
  return true;
});

check(
  "no request goes anywhere but this origin",
  external.length === 0,
  external.length ? external.slice(0, 3).map((r) => `${r.method} ${r.url}`).join(" | ") : `${requests.length} requests, all local`,
);

const everythingSent = requests.map((r) => `${r.url} ${r.body}`).join("\n");
check(
  "the amount appears in nothing that was transmitted",
  !everythingSent.includes(SECRET_AMOUNT),
  `${requests.length} requests searched`,
);
check(
  "nor does a category name",
  !everythingSent.includes(SECRET_MERCHANT),
  `${requests.length} requests searched`,
);

// ---- and the app says so ------------------------------------------------
const mode = await page.locator('[data-testid="mode"]').innerText();
check("the header states where the data is", /no account/i.test(mode), mode);

// ---- with the network cut entirely --------------------------------------
// If anything above had been reaching a server, this is where it would stop
// working. It must not even notice.
await context.setOffline(true);
await page.click('[data-testid="tab-add"]');
await page.waitForTimeout(500);
await page.fill("#amount", "17.00");
await page.click('[data-testid="record"]');
await page.waitForTimeout(1500);
await page.click('[data-testid="tab-dashboard"]');
await page.waitForTimeout(1200);
const offlineText = await page.locator("main").innerText();
await page.screenshot({ path: `${OUT}/privacy-offline.png`, fullPage: true });
check(
  "recording works with no network at all",
  /4,?259\.42|4\.259,42/.test(offlineText.replace(/\s/g, "")) || /17\.00/.test(offlineText),
  offlineText.replace(/\s+/g, " ").slice(0, 80),
);

check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
