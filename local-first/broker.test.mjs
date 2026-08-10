// The broker on its own, with no browser: what it does when someone is not
// pairing a device but attacking it.
//
// The rate limit exists because six digits is a million possibilities and a
// script can walk all of them. A limit on one route is not a limit if another
// route answers the same question for free.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PORT = 4177;
const BROKER = `http://127.0.0.1:${PORT}`;

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

const serverPath = fileURLToPath(new URL("./pairing-server/server.mjs", import.meta.url));
const server = spawn(process.execPath, [serverPath], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
});

const ready = async () => {
  for (let i = 0; i < 50; i += 1) {
    try {
      await fetch(`${BROKER}/nope`);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return false;
};
check("the broker starts", await ready());

const post = (path, body) =>
  fetch(`${BROKER}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

// ---- the legitimate flow must survive the limits ------------------------
// Device A polls its own code while it waits for B. Those are successes, not
// guesses, and a limit that counts them would break pairing rather than
// protect it — so this is checked before anything hostile runs.
{
  const opened = await (await post("/session")).json();
  let allOk = true;
  for (let i = 0; i < 40; i += 1) {
    const poll = await fetch(`${BROKER}/session?code=${opened.code}`);
    if (!poll.ok) allOk = false;
  }
  check("polling your own code forty times is never throttled", allOk, "the sender's own wait loop");

  let sealedOk = true;
  for (let i = 0; i < 40; i += 1) {
    const collect = await fetch(`${BROKER}/sealed?code=${opened.code}`);
    if (!collect.ok) sealedOk = false;
  }
  check("collecting from your own code forty times is never throttled", sealedOk, "the receiver's own wait loop");
}

// ---- enumeration -------------------------------------------------------
// A code that exists answers differently from one that does not. If that
// question can be asked without limit, the limit on /claim is decoration:
// find the live code for free, then spend the single claim you are allowed.
{
  let statuses = [];
  for (let i = 0; i < 60; i += 1) {
    const probe = await fetch(`${BROKER}/session?code=${String(200000 + i)}`);
    statuses.push(probe.status);
  }
  check(
    "probing unknown codes on the poll route is rate limited",
    statuses.includes(429),
    `60 probes, statuses seen: ${[...new Set(statuses)].join(",")}`,
  );
}

{
  let statuses = [];
  for (let i = 0; i < 60; i += 1) {
    const probe = await fetch(`${BROKER}/sealed?code=${String(300000 + i)}`);
    statuses.push(probe.status);
  }
  check(
    "probing unknown codes on the collect route is rate limited",
    statuses.includes(429),
    `60 probes, statuses seen: ${[...new Set(statuses)].join(",")}`,
  );
}

{
  let statuses = [];
  for (let i = 0; i < 60; i += 1) {
    const probe = await post("/seal", { code: String(400000 + i), sealed: "x" });
    statuses.push(probe.status);
  }
  check(
    "probing unknown codes on the publish route is rate limited",
    statuses.includes(429),
    `60 probes, statuses seen: ${[...new Set(statuses)].join(",")}`,
  );
}

// ---- the limit must actually bound the search --------------------------
// Not "some route eventually says 429", but: across every route that takes a
// code, one caller cannot make many thousands of guesses.
{
  const before = results.length;
  let allowed = 0;
  const routes = [
    (c) => fetch(`${BROKER}/session?code=${c}`),
    (c) => fetch(`${BROKER}/sealed?code=${c}`),
    (c) => post("/claim", { code: c, publicKey: "guess" }),
    (c) => post("/seal", { code: c, sealed: "x" }),
  ];
  for (let i = 0; i < 400; i += 1) {
    const route = routes[i % routes.length];
    const response = await route(String(500000 + i));
    if (response.status !== 429) allowed += 1;
  }
  check(
    "one caller cannot spread its guesses across routes to escape the limit",
    allowed < 100,
    `${allowed} of 400 guesses landed before the door shut`,
  );
  if (results.length !== before + 1) throw new Error("check accounting");
}

server.kill();

// ---- behind a proxy ----------------------------------------------------
// With every caller arriving from the proxy's address, one bucket is shared by
// everybody: one attacker locks the door for every real user. The fix is to
// read the forwarded address — but only as far back as the operator says is
// trustworthy, because the rest of that header is written by whoever is calling.
{
  const proxied = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: "4178", TRUSTED_PROXY_HOPS: "1" },
    stdio: "ignore",
  });
  const AT = "http://127.0.0.1:4178";
  for (let i = 0; i < 50; i += 1) {
    try {
      await fetch(`${AT}/nope`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const guess = (forwarded, code) =>
    fetch(`${AT}/session?code=${code}`, { headers: { "x-forwarded-for": forwarded } });

  // One client burns its own allowance.
  let blocked = 0;
  for (let i = 0; i < 40; i += 1) {
    const r = await guess("203.0.113.9", String(600000 + i));
    if (r.status === 429) blocked += 1;
  }
  check("a client behind the proxy is limited by its own address", blocked > 0, `${blocked} of 40 refused`);

  // A different client on the same proxy is unaffected — which is the entire
  // reason for reading the header rather than the socket.
  const neighbour = await guess("203.0.113.10", "700000");
  check("and its neighbour is not punished for it", neighbour.status === 404, String(neighbour.status));

  // The spoof: the blocked client prepends an innocent address. Counting from
  // the right means the entry its proxy appended is still what is read.
  const spoof = await guess("198.51.100.1, 203.0.113.9", "700001");
  check(
    "prepending a made-up address does not escape the limit",
    spoof.status === 429,
    `${spoof.status} — hops are counted from the right for exactly this`,
  );

  proxied.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
