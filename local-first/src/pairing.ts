/**
 * Moving a recovery phrase between two devices without typing 24 words.
 *
 * The broker relays two messages and can read neither. Device B makes an
 * ephemeral key pair and publishes only the public half; device A agrees a
 * shared secret with it by ECDH and encrypts the phrase under that. The private
 * half never leaves device B and the agreed key is never transmitted, so a
 * broker that keeps every byte it ever saw still cannot open the result.
 *
 * The six-digit code is not the secret — it is a short-lived pointer to a
 * session, rate limited and single use on the server. What defends against a
 * substituted public key is the confirmation word: both devices derive it from
 * the agreed key, so if anything got in between, the two screens disagree and
 * the user is told to stop.
 *
 * P-256 and AES-GCM because both are in WebCrypto everywhere this has to run,
 * including an iOS WebView, without shipping a crypto library.
 */

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;

const b64 = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)));

const unb64 = (text: string): Uint8Array =>
  Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

export type EphemeralKeys = {
  publicKey: string;
  privateKey: CryptoKey;
};

export async function createEphemeralKeys(): Promise<EphemeralKeys> {
  const pair = await crypto.subtle.generateKey(ECDH, false, ["deriveKey", "deriveBits"]);
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  return { publicKey: b64(raw), privateKey: pair.privateKey };
}

async function agree(privateKey: CryptoKey, otherPublicKey: string): Promise<CryptoKey> {
  const publicKey = await crypto.subtle.importKey(
    "raw",
    unb64(otherPublicKey),
    ECDH,
    false,
    [],
  );
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    // Not extractable: the agreed key is used here and cannot be read back out.
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * A short word both devices can show, derived from the agreed key.
 *
 * If a third party substituted its own public key it agreed a different secret,
 * so the two devices display different words. Comparing them is what turns "a
 * six digit code" into something worth trusting with a key.
 */
async function confirmationOf(privateKey: CryptoKey, otherPublicKey: string): Promise<string> {
  const publicKey = await crypto.subtle.importKey("raw", unb64(otherPublicKey), ECDH, false, []);
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const digest = await crypto.subtle.digest("SHA-256", bits);
  const bytes = new Uint8Array(digest).slice(0, 4);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * The sender's public key travels with the ciphertext.
 *
 * The receiver needs it to agree the same secret, and the broker never held it.
 * Carrying it here does mean a hostile broker could substitute its own — which
 * is exactly what the confirmation word catches, because the two devices would
 * then derive different secrets and print different words.
 */
export type Sealed = { iv: string; data: string; senderPublicKey: string };

export async function seal(
  senderKeys: EphemeralKeys,
  receiverPublicKey: string,
  plaintext: string,
): Promise<{ sealed: string; confirmation: string }> {
  const key = await agree(senderKeys.privateKey, receiverPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    sealed: JSON.stringify({
      iv: b64(iv.buffer),
      data: b64(data),
      senderPublicKey: senderKeys.publicKey,
    } satisfies Sealed),
    confirmation: await confirmationOf(senderKeys.privateKey, receiverPublicKey),
  };
}

export async function open(
  receiverPrivateKey: CryptoKey,
  sealed: string,
): Promise<{ plaintext: string; confirmation: string }> {
  const parsed = JSON.parse(sealed) as Sealed;
  const key = await agree(receiverPrivateKey, parsed.senderPublicKey);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(parsed.iv) },
    key,
    unb64(parsed.data),
  );
  return {
    plaintext: new TextDecoder().decode(plaintext),
    confirmation: await confirmationOf(receiverPrivateKey, parsed.senderPublicKey),
  };
}

/** The broker. Only ever handed a public key and a ciphertext. */
export class PairingBroker {
  constructor(private readonly baseUrl: string) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(body.error ?? `Pairing failed (${response.status})`);
    return body;
  }

  openSession() {
    return this.call<{ code: string; expiresInMs: number }>("/session", { method: "POST" });
  }

  claim(code: string, publicKey: string) {
    return this.call<{ ok: true }>("/claim", {
      method: "POST",
      body: JSON.stringify({ code, publicKey }),
    });
  }

  poll(code: string) {
    return this.call<{ claimed: boolean; receiverPublicKey: string | null }>(
      `/session?code=${encodeURIComponent(code)}`,
    );
  }

  publish(code: string, sealed: string) {
    return this.call<{ ok: true }>("/seal", {
      method: "POST",
      body: JSON.stringify({ code, sealed }),
    });
  }

  collect(code: string) {
    return this.call<{ sealed: string | null }>(`/sealed?code=${encodeURIComponent(code)}`);
  }
}

export const DEFAULT_BROKER = "http://127.0.0.1:4100";
