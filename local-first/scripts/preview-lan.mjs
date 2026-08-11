// `LAN=1 vite preview`, written as a script because npm runs scripts through
// cmd.exe on Windows, where the inline VAR=value prefix is not a thing.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../certs", import.meta.url));
if (!existsSync(`${dir}/lan.key`)) {
  console.error("No certificate yet. Run `npm run certs` first.");
  process.exit(1);
}

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((entry) => entry && entry.family === "IPv4" && !entry.internal);

console.log("On your phone, on the same Wi-Fi:");
for (const entry of addresses) console.log(`  https://${entry.address}:5175`);
console.log("\nAccept the certificate warning once. It is self-signed.\n");

spawn("npx", ["vite", "preview"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, LAN: "1" },
}).on("exit", (code) => process.exit(code ?? 0));
