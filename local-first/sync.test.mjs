// L3: opt-in encrypted sync between two devices, through a relay we run and
// can therefore read — which is the point: it must have nothing to read.
import { chromium } from "playwright-core";

const APP = "http://localhost:5174";
const OUT = process.env.SHOT_DIR ?? ".";

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

const browser = await chromium.launch();

async function openDevice(name) {
  // A separate context is a separate storage bucket, so each page is genuinely
  // a different device rather than a second tab of the same one.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${APP}/?instance=${name}&today=2026-08-09`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="mode"]', { timeout: 30000 });
  return { context, page, errors };
}

const shared = `sync${Date.now()}`;
const a = await openDevice(`${shared}-A`);

check("a fresh device says the data is local", /no account/i.test(await a.page.locator('[data-testid="mode"]').innerText()));

// Seed and record something identifiable.
await a.page.click('[data-testid="seed"]');
await a.page.waitForTimeout(1200);
await a.page.click('[data-testid="tab-add"]');
await a.page.waitForTimeout(400);
await a.page.fill("#amount", "42.42");
await a.page.selectOption("#category", { index: 1 });
await a.page.click('[data-testid="record"]');
await a.page.waitForTimeout(1200);

// Turn sync on.
await a.page.click('[data-testid="tab-more"]');
await a.page.waitForTimeout(300);
await a.page.click('[data-testid="more-sync"]');
await a.page.waitForTimeout(600);
await a.page.screenshot({ path: `${OUT}/l3-1-sync-off.png`, fullPage: true });
check("sync is off by default", (await a.page.locator('[data-testid="enable-sync"]').count()) > 0);

await a.page.click('[data-testid="enable-sync"]');
await a.page.waitForTimeout(3500);
check("enabling sync says so in the header", /encrypted/i.test(await a.page.locator('[data-testid="mode"]').innerText()));

// The phrase is the key, so it must not be sitting on screen uninvited.
await a.page.click('[data-testid="tab-more"]');
await a.page.waitForTimeout(300);
await a.page.click('[data-testid="more-sync"]');
await a.page.waitForTimeout(600);
check("the recovery phrase is hidden until asked for", (await a.page.locator('[data-testid="mnemonic"]').count()) === 0);

await a.page.click('[data-testid="reveal-mnemonic"]');
await a.page.waitForTimeout(400);
const mnemonic = (await a.page.locator('[data-testid="mnemonic"]').innerText()).trim();
await a.page.screenshot({ path: `${OUT}/l3-2-recovery-phrase.png`, fullPage: true });
check("a recovery phrase is produced", mnemonic.split(/\s+/).length >= 12, `${mnemonic.split(/\s+/).length} words`);

// Let device A push to the relay.
await a.page.waitForTimeout(4000);

// ---- device B: brand new, then paired with the phrase ------------------
const b = await openDevice(`${shared}-B`);
const bBefore = await b.page.locator("main").innerText();
check("device B starts with nothing", /Nothing here yet|Set me up/.test(bBefore), bBefore.replace(/\s+/g, " ").slice(0, 60));

await b.page.click('[data-testid="tab-more"]');
await b.page.waitForTimeout(300);
await b.page.click('[data-testid="more-sync"]');
await b.page.waitForTimeout(600);

// A wrong phrase must fail here, readably, not at startup.
await b.page.fill('[data-testid="phrase-input"]', "not actually a recovery phrase at all");
await b.page.click('[data-testid="restore-sync"]');
await b.page.waitForTimeout(800);
const rejected = await b.page.locator("main").innerText();
await b.page.screenshot({ path: `${OUT}/l3-3-bad-phrase.png`, fullPage: true });
check("a bad recovery phrase is rejected with a readable message", /not a valid recovery phrase/i.test(rejected));

await b.page.fill('[data-testid="phrase-input"]', mnemonic);
await b.page.click('[data-testid="restore-sync"]');
await b.page.waitForTimeout(4000);

let arrived = false;
for (let i = 0; i < 40; i++) {
  const text = await b.page.locator("main").innerText().catch(() => "");
  if (/\$42\.42/.test(text)) {
    arrived = true;
    break;
  }
  await b.page.waitForTimeout(1000);
}
await b.page.screenshot({ path: `${OUT}/l3-4-device-b.png`, fullPage: true });
check("device B receives device A's data", arrived, (await b.page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 90));

// ---- and back the other way -------------------------------------------
await b.page.click('[data-testid="tab-add"]');
await b.page.waitForTimeout(500);
await b.page.fill("#amount", "13.13");
await b.page.click('[data-testid="record"]');
await b.page.waitForTimeout(1500);

let returned = false;
for (let i = 0; i < 40; i++) {
  await a.page.reload({ waitUntil: "networkidle" });
  await a.page.waitForTimeout(1500);
  const text = await a.page.locator("main").innerText().catch(() => "");
  if (/\$13\.13/.test(text)) {
    returned = true;
    break;
  }
}
await a.page.screenshot({ path: `${OUT}/l3-5-device-a-after.png`, fullPage: true });
check("a change on B reaches A", returned);

const allErrors = [...a.errors, ...b.errors].filter(
  (e) => !/favicon|React DevTools|Failed to load resource/i.test(e),
);
check("no page errors", allErrors.length === 0, allErrors.slice(0, 3).join(" | "));

console.log(`\nMNEMONIC_FOR_RELAY_CHECK=${mnemonic}`);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
