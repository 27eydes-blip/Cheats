// `npm run calls:setup`: checks everything real phone calls need, then prints exactly what to
// set in the Twilio console. It never prints a key, token or phone number: only whether each
// one is set and looks right. Add --no-network to skip the check of your tunnel.
import { secrets, settings } from "../server/config.js";
import { callSettings } from "../server/calls/policy.js";
import { isAllowedHost } from "../server/guard.js";
import { pathToFileURL } from "node:url";

/**
 * The checks, as data (for the tests). Each: { name, ok, note }. `env` holds the raw .env values,
 * `calls` the calls settings. Notes never contain the values themselves.
 */
export function checkCallSetup(env, calls) {
  const out = [];
  const add = (name, ok, note) => out.push({ name, ok, note });
  const sid = String(env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(env.TWILIO_AUTH_TOKEN || "").trim();
  const number = String(env.TWILIO_PHONE_NUMBER || "").trim();
  const mine = String(env.MY_PHONE_NUMBER || "").trim();
  const access = String(env.JERICHO_ACCESS_TOKEN || "").trim();
  add("TWILIO_ACCOUNT_SID", /^AC[0-9a-f]{32}$/i.test(sid), !sid ? "missing" : /^AC[0-9a-f]{32}$/i.test(sid) ? "set" : "set, but it should be AC followed by 32 letters and digits");
  add("TWILIO_AUTH_TOKEN", /^[0-9a-f]{32}$/i.test(token), !token ? "missing" : /^[0-9a-f]{32}$/i.test(token) ? "set" : "set, but it should be 32 letters and digits (Twilio console, Account info)");
  add("TWILIO_PHONE_NUMBER", /^\+[1-9]\d{7,14}$/.test(number), !number ? "missing" : /^\+[1-9]\d{7,14}$/.test(number) ? "set" : "set, but it should look like +15551234567");
  add("MY_PHONE_NUMBER", /^\+[1-9]\d{7,14}$/.test(mine), !mine ? "missing" : /^\+[1-9]\d{7,14}$/.test(mine) ? "set" : "set, but it should look like +15551234567");
  add(
    "JERICHO_ACCESS_TOKEN",
    access.length >= 16,
    !access ? "missing: without it, everything through the tunnel is refused" : access.length >= 16 ? "set" : "set, but too short for the internet: use at least 16 random characters",
  );
  let url = null;
  try {
    url = calls.publicUrl ? new URL(calls.publicUrl) : null;
  } catch {
    url = null;
  }
  const publicOk = Boolean(url) && url.protocol === "https:" && !isAllowedHost(url.host) && url.pathname === "/" && !url.search;
  const funnel = Boolean(url) && /\.ts\.net$/i.test(url.hostname);
  add(
    "calls.publicUrl",
    publicOk || (funnel && url.protocol === "https:" && url.pathname === "/"),
    !calls.publicUrl
      ? "missing: set it in settings.json to your tunnel's https address"
      : !url
        ? "isn't a web address"
        : url.protocol !== "https:"
          ? "must start with https://"
          : url.pathname !== "/" || url.search
            ? "should be just the address, like https://name.example.com (no path)"
            : !publicOk && !funnel
              ? "points at this PC or the home network: Twilio can't reach that"
              : calls.publicUrl,
  );
  add("calls.testMode", calls.testMode === false, calls.testMode === false ? "off (real calls)" : "on: calls are simulated. Set it to false in settings.json for real calls");
  return out;
}

/** What to set in the Twilio console. */
export function consoleSteps(publicUrl) {
  const base = String(publicUrl || "https://YOUR-TUNNEL-ADDRESS").replace(/\/+$/, "");
  return [
    "In the Twilio console: Phone Numbers > Manage > Active numbers > click your number.",
    "Under Voice configuration:",
    "  Configure with:        Webhook",
    `  A call comes in:       Webhook   ${base}/twilio/voice   HTTP POST`,
    "  Primary handler fails: leave empty",
    `  Call status changes:   ${base}/twilio/status   HTTP POST`,
    "Click Save configuration.",
    "",
    "Jericho's own outgoing calls send these addresses to Twilio by themselves. The number's",
    "settings decide what happens if someone calls your Twilio number: Jericho doesn't take",
    "incoming calls, so it answers with a hang-up, and the request is still signature-checked.",
  ];
}

/** Optional: is the tunnel up, and does it refuse strangers? Never sends a key. */
export async function checkTunnel(publicUrl, fetchFn = fetch) {
  const out = [];
  const get = async (path, init) => {
    try {
      const r = await fetchFn(publicUrl.replace(/\/+$/, "") + path, { ...init, redirect: "manual", signal: AbortSignal.timeout(8000) });
      return r.status;
    } catch (err) {
      return `unreachable (${err.cause?.code || err.name || "error"})`;
    }
  };
  const page = await get("/");
  out.push({ name: "Tunnel: the page without a token", ok: page === 401 || page === 403, note: typeof page === "number" ? (page === 401 || page === 403 ? `refused (${page}), good` : `answered ${page}: it should be refused`) : page });
  const hook = await get("/twilio/voice", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "CallSid=test" });
  out.push({ name: "Tunnel: an unsigned webhook", ok: hook === 403, note: typeof hook === "number" ? (hook === 403 ? "refused (403), good" : `answered ${hook}: it should be refused`) : hook });
  return out;
}

const mark = (ok) => (ok ? "✅" : "❌");

async function main() {
  const calls = callSettings();
  const env = {
    TWILIO_ACCOUNT_SID: secrets.twilioSid,
    TWILIO_AUTH_TOKEN: secrets.twilioToken,
    TWILIO_PHONE_NUMBER: secrets.twilioNumber,
    MY_PHONE_NUMBER: secrets.myPhoneNumber,
    JERICHO_ACCESS_TOKEN: secrets.accessToken,
  };
  console.log("\nJericho: real phone call setup\n");
  const results = checkCallSetup(env, { ...calls, testMode: settings.calls?.testMode !== false });
  if (calls.publicUrl && !process.argv.includes("--no-network")) results.push(...(await checkTunnel(calls.publicUrl)));
  for (const r of results) console.log(`${mark(r.ok)} ${r.name}: ${r.note}`);
  const ready = results.every((r) => r.ok);
  console.log("");
  for (const line of consoleSteps(calls.publicUrl)) console.log(line);
  console.log("");
  console.log(ready ? "Everything is in place." : "Fix the ❌ lines above (keys go in .env, the rest in settings.json), then run this again.");
  console.log("The keys themselves are never shown here.\n");
  process.exitCode = ready ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
