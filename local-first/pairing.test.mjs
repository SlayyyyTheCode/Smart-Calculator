// L4: pairing a second device with a six-digit code instead of 24 words —
// and proving the broker in the middle cannot read what it relays.
import { chromium } from "playwright-core";

const APP = "http://localhost:5174";
const BROKER = "http://127.0.0.1:4100";
const OUT = process.env.SHOT_DIR ?? ".";

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

// ---- the broker's own limits, tested directly ---------------------------
{
  const opened = await (await fetch(`${BROKER}/session`, { method: "POST" })).json();
  check("the broker issues a six-digit code", /^\d{6}$/.test(opened.code), opened.code);

  // A wrong code must not reveal whether a session exists.
  const wrong = await fetch(`${BROKER}/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "000000", publicKey: "x" }),
  });
  check("an unknown code is refused", wrong.status === 404, String(wrong.status));

  // One claim only.
  const first = await fetch(`${BROKER}/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: opened.code, publicKey: "abc" }),
  });
  const second = await fetch(`${BROKER}/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: opened.code, publicKey: "abc" }),
  });
  check("a code can only be claimed once", first.ok && second.status === 409, `${first.status} then ${second.status}`);

  // The guessing limit is exercised at the very end: it is per caller, and this
  // test shares an address with the browser below, so burning it here would
  // block the real pairing.
}

// ---- two devices, through the UI ---------------------------------------
const browser = await chromium.launch();
const shared = `pair${Date.now()}`;

// Everything device A sends to the broker, so it can be inspected afterwards.
const brokerTraffic = [];

async function openDevice(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (request) => {
    if (request.url().startsWith(BROKER)) {
      brokerTraffic.push(request.postData() ?? "");
    }
  });
  await page.goto(`${APP}/?instance=${name}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="mode"]', { timeout: 30000 });
  return { context, page, errors };
}

const goToSync = async (page) => {
  await page.click('[data-testid="tab-more"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="more-sync"]');
  await page.waitForTimeout(600);
};

// Device A: has data, sync on, shows a code.
const a = await openDevice(`${shared}-A`);
await a.page.click('[data-testid="seed"]');
await a.page.waitForTimeout(1200);
await a.page.click('[data-testid="tab-add"]');
await a.page.waitForTimeout(400);
await a.page.fill("#amount", "31.41");
await a.page.selectOption("#category", { index: 1 });
await a.page.click('[data-testid="record"]');
await a.page.waitForTimeout(1200);

await goToSync(a.page);
await a.page.click('[data-testid="enable-sync"]');
await a.page.waitForTimeout(3500);
await goToSync(a.page);
await a.page.click('[data-testid="show-pairing-code"]');
await a.page.waitForSelector('[data-testid="pairing-code"]', { timeout: 20000 });
const code = (await a.page.locator('[data-testid="pairing-code"]').innerText()).trim();
await a.page.screenshot({ path: `${OUT}/l4-1-code-shown.png`, fullPage: true });
check("the sending device shows a code", /^\d{6}$/.test(code), code);

// Device B: brand new, enters the code.
const b = await openDevice(`${shared}-B`);
await goToSync(b.page);
await b.page.fill('[data-testid="pairing-input"]', code);
await b.page.click('[data-testid="submit-pairing-code"]');

// The confirmation word is the only thing standing between a six-digit code and
// a substituted key, and it is worth nothing unless the user can actually read
// it on BOTH screens. The receiving device used to adopt the phrase and reload
// in the same breath, so its word was set into state that never painted — the
// check existed on one screen and could never be performed.
const bWord = await b.page
  .locator('[data-testid="confirmation"]')
  .innerText({ timeout: 60000 })
  .catch(() => "");
await b.page.screenshot({ path: `${OUT}/l4-2-device-b-confirm.png`, fullPage: true });
check("the receiving device shows its confirmation before adopting anything", /^[0-9A-F]{8}$/.test(bWord), bWord);

await a.page.waitForTimeout(1500);
const aWord = await a.page.locator('[data-testid="confirmation"]').innerText().catch(() => "");
await a.page.screenshot({ path: `${OUT}/l4-3-confirmation.png`, fullPage: true });
check("the sending device shows a confirmation to compare", /^[0-9A-F]{8}$/.test(aWord), aWord);
check("the two devices derive the same word", aWord.length === 8 && aWord === bWord, `${aWord} vs ${bWord}`);

// Nothing is adopted until the person says the words match. Adopting first and
// showing the word afterwards asks the user to check something already done.
await b.page.click('[data-testid="confirm-pairing"]');

let arrived = false;
for (let i = 0; i < 60; i += 1) {
  const text = await b.page.locator("main").innerText().catch(() => "");
  if (/\$31\.41/.test(text)) {
    arrived = true;
    break;
  }
  await b.page.waitForTimeout(1000);
}
await b.page.screenshot({ path: `${OUT}/l4-2-device-b.png`, fullPage: true });
check("the second device receives the data via the code", arrived, (await b.page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 90));

// The claim the whole design rests on: the broker relayed the phrase without
// ever being able to read it. Device A's own recovery phrase is fetched from
// its screen and looked for in every byte it sent.
await goToSync(a.page);
await a.page.click('[data-testid="reveal-mnemonic"]').catch(() => {});
await a.page.waitForTimeout(500);
const phrase = (await a.page.locator('[data-testid="mnemonic"]').innerText().catch(() => "")).trim();
const sentToBroker = brokerTraffic.join("\n");

check("the phrase was revealed for comparison", phrase.split(/\s+/).length >= 12, `${phrase.split(/\s+/).length} words`);
check(
  "the broker never received the phrase",
  phrase.length > 0 && !sentToBroker.includes(phrase),
  `${brokerTraffic.length} requests inspected`,
);
check(
  "not even one word of it appears in what was sent",
  phrase.split(/\s+/).every((word) => !new RegExp(`\\b${word}\\b`).test(sentToBroker)),
  "checked every word individually",
);

const real = [...a.errors, ...b.errors].filter(
  (e) => !/favicon|React DevTools|Failed to load resource/i.test(e),
);
check("no page errors", real.length === 0, real.slice(0, 3).join(" | "));

// ---- a phrase that is not a phrase --------------------------------------
// The typed-phrase form validates before it stores. The pairing path did not,
// and what it stores is whatever the other side sealed. A bad value there is
// not a failed pairing: the mnemonic is parsed at module scope, so it throws
// before anything renders, and the bad value is in localStorage, so it throws
// again on every load afterwards. Unrecoverable from inside the app.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${APP}/?instance=brick${Date.now()}`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.setItem(
      "smart-planner.sync",
      JSON.stringify({ mnemonic: "not actually a recovery phrase", relayUrl: "ws://localhost:4000", adopted: false }),
    );
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const visible = await page.locator("main").innerText().catch(() => "");
  await page.screenshot({ path: `${OUT}/l4-4-bad-phrase.png`, fullPage: true });
  check(
    "a stored phrase that will not parse does not brick the app",
    visible.trim().length > 0,
    visible.replace(/\s+/g, " ").slice(0, 80) || "nothing rendered at all",
  );

  // And having survived it, the device must be usable — not stuck in a loop
  // retrying the same broken config.
  const recovered = await page.evaluate(() => localStorage.getItem("smart-planner.sync"));
  check("and the unusable config is cleared rather than retried forever", recovered === null, String(recovered));
  await context.close();
}

// ---- guessing, last, because it burns this caller's allowance -----------
{
  let lastStatus = 0;
  for (let i = 0; i < 30; i += 1) {
    const attempt = await fetch(`${BROKER}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: String(100000 + i), publicKey: "guess" }),
    });
    lastStatus = attempt.status;
    if (lastStatus === 429) break;
  }
  check(
    "guessing unknown codes gets rate limited per caller",
    lastStatus === 429,
    `last status ${lastStatus} — a per-session counter would never have seen these`,
  );
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
