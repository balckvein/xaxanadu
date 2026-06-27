// build_web.mjs — copy the static game into ./www, which Capacitor uses as its
// webDir (bundled into the APK). Node-only so it works cross-platform with no shell.
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const www = join(root, "www");

if (existsSync(www)) rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const item of ["index.html", "js", "css", "assets"]) {
  cpSync(join(root, item), join(www, item), { recursive: true });
}
console.log("built www/ (game bundled for Capacitor)");
