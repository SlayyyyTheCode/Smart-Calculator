import { useState } from "react";
import { AlertTriangle, Check, Copy, RefreshCw, Smartphone } from "lucide-react";

import { Mnemonic } from "@evolu/common";

import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/ui/card";
import { Field, Input } from "@app/components/ui/field";
import { PageHeader } from "@app/components/ui/page-header";

import { evolu } from "../db";
import { PairingCode, PairingEntry } from "./pairing";
import {
  clearSyncConfig,
  DEFAULT_RELAY,
  readSyncConfig,
  writeSyncConfig,
  type SyncConfig,
} from "../sync-config";

/**
 * Turning sync on, and getting the data onto a second device.
 *
 * Sync is opt-in and off by default. With it off the app is complete and the
 * data has never left the device. With it on, the relay stores ciphertext under
 * an opaque owner id and can read none of it — the mnemonic below is the only
 * key, and it never leaves this device except when you deliberately move it to
 * another one.
 *
 * Changing the owner means reopening the database under a different key, which
 * Evolu does at construction, so both paths reload the page rather than trying
 * to swap it underneath a running app.
 */
export function Sync({ config }: { config: SyncConfig | null }) {
  const [phrase, setPhrase] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  /**
   * Sync adopts the owner this device already has.
   *
   * Minting a fresh one instead looks equivalent and is not: Evolu created an
   * owner when the database was first opened, and everything recorded so far
   * belongs to it. A new owner would sync an empty account and leave the real
   * history stranded under a key nothing points at any more — the user turns on
   * sync and watches their records vanish.
   */
  const enable = async () => {
    const existing = await evolu.appOwner;
    // adopted: this device already owns the data, so nothing is restored and
    // nothing is wiped.
    writeSyncConfig({ mnemonic: String(existing.mnemonic), relayUrl: DEFAULT_RELAY, adopted: true });
    location.reload();
  };

  const restore = (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = phrase.trim().replace(/\s+/g, " ");
    // Validated before it is stored, so a typo fails here with a readable
    // message rather than at startup with a broken database.
    const parsed = Mnemonic.from(cleaned);
    if (!parsed.ok) {
      setError("That is not a valid recovery phrase. Check the words and the order.");
      return;
    }
    // adopted: false — the next load restores this owner, replacing whatever is
    // on this device with the other one's data.
    writeSyncConfig({ mnemonic: cleaned, relayUrl: config?.relayUrl ?? DEFAULT_RELAY, adopted: false });
    location.reload();
  };

  const disable = () => {
    clearSyncConfig();
    location.reload();
  };

  if (!config) {
    return (
      <>
        <PageHeader
          title="Sync"
          description="Off. Everything you have recorded is on this device and nowhere else."
        />

        <Card>
          <CardHeader>
            <CardTitle>Use this on more than one device</CardTitle>
            <CardDescription>
              Turning sync on creates an encryption key held only by your devices. The server
              stores what it cannot read — not your amounts, not your categories, not even the
              names of the tables.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <p className="text-muted-foreground">
                Because only you hold the key, nobody can recover your data for you. Lose every
                device without the recovery phrase and it is gone permanently.
              </p>
            </div>
            <Button onClick={() => void enable()} data-testid="enable-sync">
              Turn on sync
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pair with your other device</CardTitle>
            <CardDescription>
              Show a code on the device that already has your data, and enter it here. The phrase
              is encrypted to this device on the way across; the service in between only relays it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PairingEntry
              onReceived={(received) => {
                writeSyncConfig({ mnemonic: received, relayUrl: DEFAULT_RELAY, adopted: false });
                location.reload();
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Or type the recovery phrase</CardTitle>
            <CardDescription>
              Enter the phrase from your other device to pick up its data here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={restore} className="space-y-3">
              <Field label="Recovery phrase" htmlFor="phrase" error={error ?? undefined}>
                <textarea
                  id="phrase"
                  data-testid="phrase-input"
                  rows={3}
                  value={phrase}
                  onChange={(event) => setPhrase(event.target.value)}
                  placeholder="twenty four words, separated by spaces"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
                />
              </Field>
              <Button type="submit" data-testid="restore-sync">
                Use this phrase
              </Button>
            </form>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Sync"
        description="On. Your devices share this data; the server holds only ciphertext."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add another device</CardTitle>
          <CardDescription>
            Open this app on the other device, choose <strong>Sync</strong>, and enter the phrase
            below. It carries the key, so treat it like a password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <PairingCode mnemonic={config.mnemonic} />

          <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or type the phrase
            <span className="h-px flex-1 bg-border" />
          </div>

          {revealed ? (
            <>
              <p
                className="rounded-lg border border-border bg-surface-muted p-3 font-mono text-sm leading-relaxed"
                data-testid="mnemonic"
              >
                {config.mnemonic}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(config.mnemonic);
                    setCopied(true);
                  }}
                  data-testid="copy-mnemonic"
                >
                  {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button variant="outline" onClick={() => setRevealed(false)}>
                  Hide
                </Button>
              </div>
            </>
          ) : (
            // Not shown until asked for. A recovery phrase sitting on screen is
            // a key sitting on screen, and screens get shoulder-surfed and
            // screenshotted.
            <Button variant="outline" onClick={() => setRevealed(true)} data-testid="reveal-mnemonic">
              <Smartphone aria-hidden />
              Show recovery phrase
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Relay</CardTitle>
          <CardDescription>
            Where the encrypted copies are exchanged. It can read none of them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field label="Relay URL" htmlFor="relay">
            <Input id="relay" readOnly value={config.relayUrl} data-testid="relay-url" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Turn sync off</CardTitle>
          <CardDescription>
            This device keeps its data and stops exchanging it. Your other devices are unaffected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={disable} data-testid="disable-sync">
            <RefreshCw aria-hidden />
            Turn off sync
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
