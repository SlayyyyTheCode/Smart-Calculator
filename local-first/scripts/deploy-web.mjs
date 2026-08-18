// Publish the built app to Vercel as a static site.
//
// The two Cross-Origin-* headers are the whole reason this needs a config at
// all. The database is SQLite in OPFS, browsers only expose OPFS to a
// cross-origin-isolated page, and a host that does not send those headers gives
// you an app that looks perfect and loses everything on refresh. The dev and
// preview servers set them in vite.config.ts; a static host has to be told.
//
// The config is copied into dist because that folder is the deployment root —
// a vercel.json one level up is not read.
import { copyFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
if (!existsSync(`${root}dist/index.html`)) {
  console.error("No build to deploy. Run `npm run build` first.");
  process.exit(1);
}
copyFileSync(`${root}vercel.json`, `${root}dist/vercel.json`);

const args = ["deploy", "dist", "--yes", ...process.argv.slice(2)];
const result = spawnSync("vercel", args, { cwd: root, stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
