# Hosting the two services

Only needed if you want sync. Without them the app is complete on one device,
which is how it ships by default.

Neither service can read your data. The relay holds ciphertext under an opaque
owner id; the broker holds a public key and a ciphertext for two minutes. The
key that opens any of it is derived from a phrase that never leaves your
devices — `pairing.test.mjs` searches every byte the sending device transmits
for that phrase and each of its 24 words, and finds none of them.

## Once

```bash
# https://fly.io/docs/hands-on/install-flyctl/
fly auth login
```

## The relay

```bash
cd local-first/deploy
fly launch --no-deploy --copy-config --config relay.fly.toml --name smart-planner-relay
fly volumes create relay_data --size 1 --region sin
fly deploy --config relay.fly.toml
```

The volume holds encrypted messages devices have not collected yet. Losing it
costs a resync, not the data — every device still has its own full copy.

## The broker

```bash
cd local-first/pairing-server
fly launch --no-deploy --copy-config --name smart-planner-pairing
fly deploy
```

No volume on purpose. Sessions last two minutes and belong in memory.

`TRUSTED_PROXY_HOPS = "1"` is already set, and matters: Fly terminates TLS and
forwards, so without it every caller looks like Fly's proxy and one attacker
guessing pairing codes would lock out every real user. Hops count from the
right — the rightmost entry is the one Fly appended and the only one it
observed. See `broker.test.mjs`, which prepends a made-up address and is still
refused.

## Point the app at them

```bash
cd local-first
VITE_RELAY_URL=wss://smart-planner-relay.fly.dev \
VITE_PAIRING_BROKER=https://smart-planner-pairing.fly.dev \
npm run build
npx cap sync
```

Note `wss://` and `https://`, not `ws://` and `http://`. A page served over
HTTPS refuses to open an insecure socket, and the failure looks like sync
quietly not working rather than like an error.

## Cost

Both fit in Fly's free allowance at this size: two shared-cpu-1x machines and a
1 GB volume. `auto_stop_machines` is off in both configs deliberately. Letting
them sleep saves nothing here and costs correctness — a sleeping relay is a
phone that syncs minutes late, and a sleeping broker fails the pairing outright,
because the code expires in two minutes and the second device is typing it now.
