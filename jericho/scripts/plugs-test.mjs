#!/usr/bin/env node
// npm run plugs:test            finds the Tapo plugs named in settings.json and shows on/off
// npm run plugs:test -- --debug also shows, for each address tried, only safe facts: IP, MAC,
//                               which protocol answered, the step it failed at, HTTP statuses,
//                               sizes, whether a session cookie came back, which login-hash
//                               variant matched, and device error codes.
// Never prints the email, password, keys, tokens, seeds or full responses: TAPO_EMAIL and
// TAPO_PASSWORD are only shown as "set" or "missing".
import { credStatus, discover, loginForProbe, plugSettings, TIP } from "../server/plugs/index.js";
import { probeAddress, probeLine } from "../server/plugs/probe.js";

const debug = process.argv.includes("--debug");

/** One trace event as a short safe line (only known fields). */
export function traceLine(e) {
  const keep = ["step", "status", "bytes", "cookie", "shape", "matched", "matches", "errorCode", "resultKeys", "decrypt", "tpap", "tls", "port", "pake", "dac", "owner", "cipherSuites", "encryption", "iterations", "transform", "note", "failed"];
  return keep.filter((k) => e[k] !== undefined && e[k] !== null).map((k) => `${k}=${String(e[k]).slice(0, 60)}`).join(" ");
}

export async function main(log = console.log, { probe = probeAddress } = {}) {
  const status = credStatus();
  log("\nJericho: Tapo smart plugs\n");
  for (const [k, v] of Object.entries(status)) log(`${v === "set" ? "✅" : "❌"} ${k}: ${v}`);
  const names = plugSettings().devices.map((d) => d.name);
  log(`   Looking for: ${names.join(", ")} (settings.json plugs.devices)\n`);
  if (Object.values(status).includes("missing")) {
    log("Add TAPO_EMAIL and TAPO_PASSWORD (your Tapo app login) to .env, then run this again.\n");
    return 1;
  }
  try {
    const r = await discover({ debug });
    if (debug) {
      log(`Tapo account: ${r.accountError ? `couldn't read the plug list (${r.accountError})` : `${r.account.length} plug(s)`}`);
      for (const a of r.account || []) log(`   ${a.name.padEnd(14)} MAC ${a.mac || "?"}  ${a.model}  ${a.online ? "online" : "offline"} in the cloud`);
      if ((r.account || []).length && r.account.every((a) => !a.online)) {
        log("   Every plug shows offline in the Tapo cloud's device list. That list is the older cloud API, which");
        log("   reports plugs on newer (TPAP) firmware as offline even when the Tapo app controls them, so cloud");
        log("   control can't work for them; local control (TPAP or KLAP) is what will.");
      }
      log("");
      const ips = [...new Set(r.debug.filter((d) => !d.cloud && d.ip).map((d) => d.ip))];
      const { email, password } = loginForProbe(); // used only to compute login hashes; never printed
      for (const ip of ips) {
        log(`Protocol probe for ${ip} (each protocol in turn; safe facts only):`);
        for (const row of await probe(ip, { email, password })) {
          log(`   ${probeLine(row)}`);
          for (const e of row.trace || []) log(`        ${traceLine(e)}`);
        }
        log("");
      }
      if (!r.debug.length) log("No candidate addresses: no device on this network matched the account's MAC addresses.");
      for (const d of r.debug) {
        if (d.cloud) {
          log(`   cloud      for MAC ${d.mac}: failed (${d.reason})`);
          continue;
        }
        log(`   ${String(d.ip).padEnd(15)} MAC ${d.mac || "?"}  ${d.ok ? `OK via ${d.protocol}, name "${d.nickname}"` : `FAILED at ${d.failedAt} (${d.reason})${d.detail ? `: ${d.detail}` : ""}`}`);
        for (const e of d.trace || []) log(`        ${traceLine(e)}`);
      }
      log("");
    }
    for (const [name, p] of Object.entries(r.found)) {
      if (p.path === "none") continue;
      log(`✅ ${name.padEnd(12)} ${(p.on === null ? "?" : p.on ? "ON" : "off").padEnd(4)} ${String(p.model || "").padEnd(6)} ${p.ip || "(no local address)"}  via ${p.path}${p.path === "cloud" ? ` (local: ${p.localError})` : ""}`);
    }
    for (const name of r.missing) log(`❌ ${name.padEnd(12)} ${r.found[name]?.localError ? `not reachable (local: ${r.found[name].localError}; the cloud failed too)` : "not found"}`);
    if (r.missing.length) log(`\nThe name in the Tapo app must match settings.json. ${TIP}${debug ? "" : " Run npm run plugs:test -- --debug for details."}`);
    log("");
    return r.missing.length ? 1 : 0;
  } catch (err) {
    log(`❌ ${["no-creds", "auth"].includes(err.code) ? err.message : `Couldn't search the network. ${TIP}`}\n`); // never a raw library error
    return 1;
  }
}

if (process.argv[1]?.endsWith("plugs-test.mjs")) process.exitCode = await main();
