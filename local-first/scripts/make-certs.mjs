// A certificate for testing on a real phone.
//
// Not a security measure — it is self-signed and every device will warn about
// it once. It exists because of a mechanical requirement: the database is
// SQLite in OPFS, browsers only expose OPFS to a cross-origin-isolated page,
// and isolation requires a secure context. localhost qualifies; a bare
// http://192.168.x.x does not. Without TLS the app on a phone loads, looks
// entirely normal, and holds everything in memory until the first refresh.
//
// The addresses are read off this machine rather than written down, because a
// certificate naming somebody else's subnet is a certificate that fails on
// every device it was made for.
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../certs", import.meta.url));
mkdirSync(dir, { recursive: true });

const addresses = Object.entries(networkInterfaces())
  .flatMap(([name, list]) => (list ?? []).map((entry) => ({ ...entry, name })))
  .filter((entry) => entry.family === "IPv4" && !entry.internal)
  // WSL and Docker put their own bridges on this machine. They are real
  // interfaces and useless to a phone, so they are named but not preferred.
  .filter((entry) => !/^169\.254\./.test(entry.address));

if (addresses.length === 0) {
  console.error("No network address found. Connect to Wi-Fi and run this again.");
  process.exit(1);
}

const san = [
  ...addresses.map((entry) => `IP:${entry.address}`),
  "IP:127.0.0.1",
  "DNS:localhost",
].join(",");

execFileSync(
  "openssl",
  [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", `${dir}/lan.key`,
    "-out", `${dir}/lan.crt`,
    "-days", "365",
    "-subj", "/CN=Smart Planner LAN",
    "-addext", `subjectAltName=${san}`,
    "-addext", "basicConstraints=critical,CA:FALSE",
    "-addext", "keyUsage=critical,digitalSignature,keyEncipherment",
    "-addext", "extendedKeyUsage=serverAuth",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

if (!existsSync(`${dir}/lan.key`)) {
  console.error("openssl produced no key.");
  process.exit(1);
}

console.log("Certificate written to local-first/certs (gitignored, expires in 365 days).\n");
console.log("Serve it with:  npm run preview:lan\n");
console.log("Then on your phone, on the same Wi-Fi, open one of:");
for (const entry of addresses) {
  console.log(`  https://${entry.address}:5175   (${entry.name})`);
}
console.log(
  "\nThe browser will warn that the certificate is not trusted. That is expected —\n" +
    "it is self-signed. Accept it once per device.",
);
