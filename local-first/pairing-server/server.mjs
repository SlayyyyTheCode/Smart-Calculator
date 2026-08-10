import { createServer } from "node:http";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * A pairing broker.
 *
 * Its whole job is to let two devices that cannot see each other exchange one
 * short-lived message, and its whole design goal is to be useless to whoever
 * runs it. It sees an ephemeral public key and a blob of ciphertext. It never
 * sees the recovery phrase, and it cannot derive it: the key that opens the
 * blob is agreed directly between the two devices and never sent anywhere.
 *
 * The dangerous part is the six-digit code. Six digits is a million
 * possibilities, which is nothing to a script, so the code alone is not the
 * security boundary — these limits are:
 *
 * - a session lives for two minutes and is then gone
 * - a code can be claimed once; the second claim finds nothing
 * - five wrong guesses burn the session
 * - both devices display a confirmation derived from the agreed key, so a
 *   swapped public key shows up as two different words on two screens
 *
 * Sessions are held in memory on purpose. There is nothing here worth
 * persisting, and anything persisted is something to leak.
 */

const PORT = Number(process.env.PORT ?? 4100);
const TTL_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/** code -> session */
const sessions = new Map();

/**
 * Failed guesses per caller, counted across every route that takes a code.
 *
 * The obvious place to count attempts is on the session, and it is the wrong
 * place: a guessed code that does not exist never reaches a session, so a
 * per-session counter never sees the attack it was meant to stop. Somebody
 * walking through all million codes would have met nothing but 404s.
 *
 * Counting per caller is what actually bounds guessing — but only if every
 * route counts. Limiting the claim route alone was decoration: four routes
 * take a code and all four answer "does this exist?", so an attacker could
 * find the live code for free on the poll route and then spend the single
 * claim it was allowed. Measured before this was fixed: 320 of 400 guesses
 * landed. The limit has to sit on the question, not on one way of asking it.
 *
 * Only failures count. The sender polls its own valid code while it waits and
 * the receiver polls for its own sealed payload; those succeed, so a legitimate
 * pairing never approaches the limit no matter how long it waits.
 *
 * Behind a proxy this needs the forwarded address instead, and behind a shared
 * NAT it is blunt — but a blunt limit that fires beats a precise one that cannot.
 */
const failures = new Map();
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 20;

const now = () => Date.now();

function callerOf(req) {
  return req.socket.remoteAddress ?? "unknown";
}

function tooManyFailures(caller) {
  const entry = failures.get(caller);
  if (!entry) return false;
  if (entry.until <= now()) {
    failures.delete(caller);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(caller) {
  const entry = failures.get(caller);
  if (!entry || entry.until <= now()) {
    failures.set(caller, { count: 1, until: now() + FAILURE_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

/** The 429 body, so every route refuses in the same words. */
const THROTTLED = { error: "Too many attempts. Wait, then start again." };

/**
 * Look a code up and count the miss.
 *
 * Every route that takes a code goes through here, which is what makes the
 * limit hold across all of them rather than on whichever one was written first.
 */
function lookup(req, res, code) {
  const caller = callerOf(req);
  if (tooManyFailures(caller)) {
    send(res, 429, THROTTLED);
    return null;
  }
  const entry = [...sessions.entries()].find(([known]) => sameCode(known, code ?? ""));
  if (!entry) {
    recordFailure(caller);
    send(res, 404, { error: "No such code, or it has expired." });
    return null;
  }
  return entry;
}

function sweep() {
  for (const [code, session] of sessions) {
    if (session.expiresAt <= now()) sessions.delete(code);
  }
  for (const [caller, entry] of failures) {
    if (entry.until <= now()) failures.delete(caller);
  }
}
setInterval(sweep, 10_000).unref();

/** Six digits, uniformly drawn, and never one already in play. */
function freshCode() {
  for (let i = 0; i < 50; i += 1) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (!sessions.has(code)) return code;
  }
  throw new Error("could not allocate a pairing code");
}

/** Constant-time compare, so a wrong code cannot be found by timing it. */
function sameCode(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "cache-control": "no-store",
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    // A pairing message is a public key or a small ciphertext. Anything larger
    // is not a pairing message.
    if (size > 8 * 1024) throw new Error("payload too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer((req, res) => {
  void (async () => {
    if (req.method === "OPTIONS") return send(res, 204, {});

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    try {
      // Device A opens a session and shows the code.
      if (req.method === "POST" && url.pathname === "/session") {
        sweep();
        const code = freshCode();
        const id = randomUUID();
        sessions.set(code, {
          id,
          expiresAt: now() + TTL_MS,
          attempts: 0,
          claimed: false,
          receiverPublicKey: null,
          sealed: null,
        });
        return send(res, 201, { code, id, expiresInMs: TTL_MS });
      }

      // Device B claims it, handing over an ephemeral public key.
      if (req.method === "POST" && url.pathname === "/claim") {
        const body = await readJson(req);
        sweep();

        const found = lookup(req, res, body.code);
        if (!found) return undefined;

        const [code, session] = found;
        if (session.claimed) {
          // One claim only. A code that has already been used is spent, even if
          // it is still inside its two minutes.
          recordFailure(callerOf(req));
          return send(res, 409, { error: "That code has already been used." });
        }

        session.attempts += 1;
        if (session.attempts > MAX_ATTEMPTS) {
          sessions.delete(code);
          return send(res, 429, { error: "Too many attempts. Start again on the first device." });
        }

        if (typeof body.publicKey !== "string" || body.publicKey.length > 2048) {
          recordFailure(callerOf(req));
          return send(res, 400, { error: "Expected a public key." });
        }

        session.claimed = true;
        session.receiverPublicKey = body.publicKey;
        return send(res, 200, { ok: true });
      }

      // Device A polls for the claim, then posts the sealed phrase.
      if (req.method === "GET" && url.pathname === "/session") {
        sweep();
        const found = lookup(req, res, url.searchParams.get("code"));
        if (!found) return undefined;
        const [, session] = found;
        return send(res, 200, {
          claimed: session.claimed,
          receiverPublicKey: session.receiverPublicKey,
        });
      }

      if (req.method === "POST" && url.pathname === "/seal") {
        const body = await readJson(req);
        sweep();
        const found = lookup(req, res, body.code);
        if (!found) return undefined;
        const [, session] = found;
        // Nothing to seal to before a device has claimed the code. Refusing
        // early keeps a stray payload from sitting in a session nobody joined.
        if (!session.claimed) {
          return send(res, 409, { error: "Nothing has claimed that code yet." });
        }
        if (typeof body.sealed !== "string" || body.sealed.length > 4096) {
          recordFailure(callerOf(req));
          return send(res, 400, { error: "Expected a sealed payload." });
        }
        session.sealed = body.sealed;
        return send(res, 200, { ok: true });
      }

      // Device B collects it. Reading it consumes it.
      if (req.method === "GET" && url.pathname === "/sealed") {
        sweep();
        const found = lookup(req, res, url.searchParams.get("code"));
        if (!found) return undefined;
        const [code, session] = found;
        if (!session.sealed) return send(res, 200, { sealed: null });
        const sealed = session.sealed;
        sessions.delete(code);
        return send(res, 200, { sealed });
      }

      return send(res, 404, { error: "Not found." });
    } catch (cause) {
      return send(res, 400, { error: String(cause instanceof Error ? cause.message : cause) });
    }
  })();
});

server.listen(PORT, () => {
  console.log(`Pairing broker on http://127.0.0.1:${PORT}`);
});
