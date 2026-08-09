// Two browser contexts = two devices. Device A records an expense; device B
// restores A's owner and must end up with the same data, through a relay we run
// ourselves and can then inspect.
import { chromium } from "playwright-core";

const APP = "http://localhost:5173";
const OUT = process.env.SHOT_DIR;

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

const browser = await chromium.launch();

// One mnemonic, handed to both devices — the pairing code's job in a real app
// is simply to carry this across.
const MNEMONIC =
  "sting viable ancient focus village cup demand step copper purpose cash stone shrimp ancient monitor public flight omit connect smoke farm mule farm meat";

async function openDevice(name) {
  // A separate context gives a separate storage bucket, so each page really is
  // an independent device rather than another tab of the same one.
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${APP}/?device=${name}&mnemonic=${encodeURIComponent(MNEMONIC)}`, {
    waitUntil: "networkidle",
  });
  return { context, page, errors };
}

const a = await openDevice("A");
await a.page.waitForSelector('[data-testid="owner"]', { timeout: 30000 });
const ownerA = await a.page.locator('[data-testid="owner"]').innerText();
check("device A derives an owner from the mnemonic", /owner: \S+/.test(ownerA), ownerA);
await a.page.screenshot({ path: `${OUT}/evolu-1-deviceA.png`, fullPage: true });

// Record two expenses on A.
for (const amount of ["12.34", "56.78"]) {
  await a.page.fill("#amount", amount);
  await a.page.click('[data-testid="add"]');
  await a.page.waitForTimeout(600);
}
await a.page.waitForFunction(
  () => /Transactions: [1-9]/.test(document.querySelector('[data-testid="count"]')?.textContent ?? ""),
  { timeout: 15000 },
);
const aCount = await a.page.locator('[data-testid="count"]').innerText();
const aList = await a.page.locator('[data-testid="list"]').innerText();
check("device A stores minor units, not floats", /1234 minor/.test(aList) && /5678 minor/.test(aList), aList.replace(/\s+/g, " "));
await a.page.screenshot({ path: `${OUT}/evolu-2-deviceA-data.png`, fullPage: true });

// Give the relay a moment to receive A's writes.
await a.page.waitForTimeout(3000);

// Device B: a fresh device holding the same owner.
const b = await openDevice("B");
await b.page.waitForSelector('[data-testid="count"]', { timeout: 30000 });
const ownerB = await b.page.locator('[data-testid="owner"]').innerText();
check("both devices derive the same owner id", ownerA === ownerB, `${ownerA} vs ${ownerB}`);

// B should converge on whatever A has, not on a hardcoded number — the relay
// is shared state and a fixed count makes the test lie when it is not empty.
let synced = false;
for (let i = 0; i < 40; i++) {
  await b.page.waitForTimeout(1000);
  const text = await b.page.locator('[data-testid="count"]').innerText().catch(() => "");
  if (text.trim() === aCount.trim()) {
    synced = true;
    break;
  }
}
await b.page.screenshot({ path: `${OUT}/evolu-3-deviceB.png`, fullPage: true });
const bList = await b.page.locator('[data-testid="list"]').innerText().catch(() => "");
check("device B receives A's data through the relay", synced, bList.replace(/\s+/g, " ").slice(0, 120));
check(
  "the amounts arrive intact",
  /1234 minor/.test(bList) && /5678 minor/.test(bList),
  bList.replace(/\s+/g, " ").slice(0, 120),
);

// A write on B should travel back to A: sync is bidirectional.
await b.page.fill("#amount", "99.99");
await b.page.click('[data-testid="add"]');
let backToA = false;
for (let i = 0; i < 40; i++) {
  await a.page.waitForTimeout(1000);
  const text = await a.page.locator('[data-testid="list"]').innerText().catch(() => "");
  if (/9999 minor/.test(text)) {
    backToA = true;
    break;
  }
}
check("a write on B reaches A", backToA);
await a.page.screenshot({ path: `${OUT}/evolu-4-deviceA-after.png`, fullPage: true });

const allErrors = [...a.errors, ...b.errors].filter(
  (e) => !/favicon|Download the React DevTools/i.test(e),
);
check("no page errors", allErrors.length === 0, allErrors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
