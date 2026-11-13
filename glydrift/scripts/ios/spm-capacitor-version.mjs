// Runs after every `npm install` / `npm ci` (package.json "postinstall").
//
// The iOS app is built with Swift Package Manager: `npx cap sync ios` writes
// ios/App/CapApp-SPM/Package.swift, which pins Capacitor exactly (8.x) and adds every Capacitor
// plugin from node_modules by path. @capacitor-community/apple-sign-in 7.1.0 (the newest release,
// used for Sign in with Apple) still declares `capacitor-swift-pm from: "7.0.0"`, i.e. 7.x only,
// so Xcode can't resolve the packages and the iOS build stops before compiling. Its Swift code
// works unchanged with Capacitor 8 (it only uses CAPBridgedPlugin and saveCall / savedCall /
// releaseCall, all still in Capacitor 8), so this widens the plugin's requirement to the
// Capacitor major version actually installed. Does nothing when the plugin isn't installed or
// already allows it. Never fails the install.
//
// GLY_ROOT (optional): the folder holding node_modules (tests); default: this project.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.env.GLY_ROOT || resolve(import.meta.dirname, "../..");
const PLUGINS = ["@capacitor-community/apple-sign-in"];

try {
  const capPkg = resolve(root, "node_modules/@capacitor/ios/package.json");
  const major = existsSync(capPkg)
    ? Number(JSON.parse(readFileSync(capPkg, "utf8")).version.split(".")[0])
    : 0;
  for (const name of major ? PLUGINS : []) {
    const file = resolve(root, "node_modules", name, "Package.swift");
    if (!existsSync(file)) continue;
    const src = readFileSync(file, "utf8");
    const out = src.replace(
      /(capacitor-swift-pm\.git",\s*from:\s*")(\d+)(\.\d+\.\d+")/,
      (m, a, v) => (Number(v) < major ? `${a}${major}.0.0"` : m),
    );
    if (out !== src) {
      writeFileSync(file, out);
      console.log(`[glydrift] ${name}: its Swift package now accepts Capacitor ${major}`);
    }
  }
} catch (err) {
  console.warn(`[glydrift] couldn't adjust the Swift package versions: ${err?.message || err}`);
}
