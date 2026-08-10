import { useRef, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

import { Mnemonic } from "@evolu/common";

import { Button } from "@app/components/ui/button";
import { Field, Input } from "@app/components/ui/field";

import {
  createEphemeralKeys,
  DEFAULT_BROKER,
  open as openSealed,
  PairingBroker,
  seal,
} from "../pairing";

const broker = new PairingBroker(DEFAULT_BROKER);

/**
 * The sending half: this device has the phrase and shows a code.
 *
 * It waits for the other device to claim the code and publish an ephemeral
 * public key, seals the phrase to that key, and hands the broker a blob it
 * cannot read.
 */
export function PairingCode({ mnemonic }: { mnemonic: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const start = async () => {
    setError(null);
    setConfirmation(null);
    cancelled.current = false;
    try {
      const keys = await createEphemeralKeys();
      const session = await broker.openSession();
      setCode(session.code);
      setStatus("Waiting for the other device…");

      // Poll until the other device claims the code or the session expires.
      const deadline = Date.now() + session.expiresInMs;
      while (Date.now() < deadline && !cancelled.current) {
        const polled = await broker.poll(session.code).catch(() => null);
        if (polled?.claimed && polled.receiverPublicKey) {
          const { sealed, confirmation: word } = await seal(
            keys,
            polled.receiverPublicKey,
            mnemonic,
          );
          await broker.publish(session.code, sealed);
          setConfirmation(word);
          setStatus("Sent. Check the codes below match.");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!cancelled.current) {
        setStatus(null);
        setCode(null);
        setError("The code expired. Start again.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setCode(null);
      setStatus(null);
    }
  };

  return (
    <div className="space-y-3">
      {code ? (
        <>
          <p className="text-sm text-muted-foreground">
            Enter this on the other device, under Sync.
          </p>
          <p
            className="rounded-lg border border-border bg-surface-muted px-3 py-4 text-center font-mono text-3xl tracking-[0.3em]"
            data-testid="pairing-code"
          >
            {code}
          </p>
          {status ? (
            <p className="text-sm text-muted-foreground" data-testid="pairing-status">
              {status}
            </p>
          ) : null}
          {confirmation ? <ConfirmationWord value={confirmation} /> : null}
        </>
      ) : (
        <Button variant="outline" onClick={() => void start()} data-testid="show-pairing-code">
          <KeyRound aria-hidden />
          Pair with a code
        </Button>
      )}
      {error ? (
        <p className="text-sm text-rose-600 dark:text-rose-400" data-testid="pairing-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The receiving half: this device has no data and enters the code.
 *
 * What arrives is held, not adopted. Adopting it immediately and showing the
 * confirmation word on the way out asks the user to check something that has
 * already happened — and in practice they never saw it at all, because adopting
 * reloads the page and React does not paint before a reload. The one control
 * that makes a six-digit code safe existed on one screen only.
 */
export function PairingEntry({ onReceived }: { onReceived: (mnemonic: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [received, setReceived] = useState<{ mnemonic: string; confirmation: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const keys = await createEphemeralKeys();
      await broker.claim(code.trim(), keys.publicKey);

      // The other device now seals the phrase to our public key.
      const deadline = Date.now() + 2 * 60 * 1000;
      while (Date.now() < deadline) {
        const collected = await broker.collect(code.trim()).catch(() => null);
        if (collected?.sealed) {
          // The sender's public key rides with the ciphertext; the broker never
          // held it and cannot be asked for it.
          const { plaintext, confirmation: word } = await openSealed(
            keys.privateKey,
            collected.sealed,
          );
          // Checked here, where it can still be refused. Stored unvalidated it
          // would be parsed at startup instead, which throws before anything
          // renders and throws again on every load after that.
          if (!Mnemonic.from(plaintext.trim().replace(/\s+/g, " ")).ok) {
            setError("What arrived is not a recovery phrase. Start again on the other device.");
            return;
          }
          setReceived({ mnemonic: plaintext.trim().replace(/\s+/g, " "), confirmation: word });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      setError("Nothing arrived. Check the code and try again.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (received) {
    return (
      <div className="space-y-3">
        <ConfirmationWord value={received.confirmation} />
        <p className="text-sm text-muted-foreground">
          Adopting this replaces anything already on this device with the other one&apos;s data.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => onReceived(received.mnemonic)} data-testid="confirm-pairing">
            The codes match — continue
          </Button>
          <Button variant="outline" onClick={() => setReceived(null)} data-testid="cancel-pairing">
            They differ — stop
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3">
      <Field label="Pairing code" htmlFor="pairing-input" error={error ?? undefined}>
        <Input
          id="pairing-input"
          data-testid="pairing-input"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          className="tabular text-center text-lg tracking-[0.3em]"
        />
      </Field>
      <Button type="submit" disabled={busy || code.length !== 6} data-testid="submit-pairing-code">
        {busy ? "Pairing…" : "Pair this device"}
      </Button>
    </form>
  );
}

/**
 * Both devices derive this from the key they agreed, never from anything the
 * broker sent. Matching words mean nothing got in between; different words mean
 * something did.
 */
function ConfirmationWord({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted p-3 text-sm">
      <ShieldCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      <span className="text-muted-foreground">
        Both devices should show{" "}
        <strong className="font-mono text-foreground" data-testid="confirmation">
          {value}
        </strong>
        . If they differ, stop and use the recovery phrase instead.
      </span>
    </div>
  );
}
