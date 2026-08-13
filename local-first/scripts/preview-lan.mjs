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

// Vite's own binary, run by this Node directly. Going through `npx` needed
// shell: true on Windows, which concatenates arguments instead of escaping them
// — Node deprecated it for exactly that reason, and there is no need for a
// shell here at all.
const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));

spawn(process.execPath, [vite, "preview"], {
  stdio: "inherit",
  env: { ...process.env, LAN: "1" },
}).on("exit", (code) => process.exit(code ?? 0));
