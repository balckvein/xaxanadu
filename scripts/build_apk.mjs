// build_apk.mjs — build the web bundle, sync Capacitor, build a debug APK, and
// (with --install) push + launch it on a connected device (e.g. the Fire tablet).
//
//   npm run apk            -> build app-debug.apk
//   npm run apk:install    -> build, then `adb install` + launch on the device
//
// Prereqs (present on this machine): Android SDK at ANDROID_HOME, a JDK, and
// `npx cap add android` having been run once (creates the Capacitor android/ project).
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, "");
const isWin = process.platform === "win32";
const install = process.argv.includes("--install");
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;

function run(cmd, args, opts = {}) {
  const q = (s) => (isWin && /\s/.test(s) && !s.startsWith('"')) ? `"${s}"` : s;
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(q(cmd), args.map(q), { stdio: "inherit", shell: isWin, cwd: root, ...opts });
  if (r.status !== 0) { console.error(`\n✗ failed: ${cmd}`); process.exit(r.status ?? 1); }
}

run("node", ["scripts/build_web.mjs"]);
run("npx", ["cap", "sync", "android"]);

const gradlew = join(root, "android", isWin ? "gradlew.bat" : "gradlew");
run(gradlew, ["assembleDebug", "--console=plain"], { cwd: join(root, "android") });

const apk = join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
if (!existsSync(apk)) { console.error("✗ APK not found at", apk); process.exit(1); }
console.log(`\n✓ APK built: ${apk}`);

if (install) {
  if (!sdk) { console.error("✗ ANDROID_HOME not set — install manually:", apk); process.exit(1); }
  const adb = join(sdk, "platform-tools", isWin ? "adb.exe" : "adb");
  run(adb, ["install", "-r", apk]);
  run(adb, ["shell", "am", "start", "-n", "com.xaxanadu.game/.MainActivity"]);
  console.log("\n✓ Installed + launched XAXANADU on the device.");
}
