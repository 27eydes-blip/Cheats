#!/usr/bin/env node
// npm run plugs:test — finds the Tapo plugs named in settings.json (plugs.devices) and shows
// whether each is on or off. Shows whether TAPO_EMAIL and TAPO_PASSWORD are set, never their values.
import { credStatus, discover, plugSettings, TIP } from "../server/plugs/index.js";

const status = credStatus();
console.log("\nJericho: Tapo smart plugs\n");
for (const [k, v] of Object.entries(status)) console.log(`${v === "set" ? "✅" : "❌"} ${k}: ${v}`);
const names = plugSettings().devices.map((d) => d.name);
console.log(`   Looking for: ${names.join(", ")} (settings.json plugs.devices)\n`);
if (Object.values(status).includes("missing")) {
  console.log("Add TAPO_EMAIL and TAPO_PASSWORD (your Tapo app login) to .env, then run this again.\n");
  process.exitCode = 1;
} else {
  try {
    const { found, missing } = await discover();
    for (const [name, p] of Object.entries(found)) console.log(`✅ ${name.padEnd(12)} ${(p.on ? "ON" : "off").padEnd(4)} ${p.model.padEnd(6)} ${p.ip}`);
    for (const name of missing) console.log(`❌ ${name.padEnd(12)} not found`);
    if (missing.length) console.log(`\nThe name in the Tapo app must match settings.json. ${TIP}`);
    console.log("");
    process.exitCode = missing.length ? 1 : 0;
  } catch (err) {
    console.log(`❌ ${err.code === "no-creds" || err.code === "auth" ? err.message : `Couldn't search the network. ${TIP}`}\n`); // never the library's raw error
    process.exitCode = 1;
  }
}
