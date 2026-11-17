#!/usr/bin/env node
// Nightly site check (no AI, no extra packages): glydrift.com and its pages load, and every link
// and file they point at answers without a 404 (or any other error).
//   node scripts/site-check.mjs [https://glydrift.com]
// Prints one line per problem and exits 1 if there is any; writes site-check.txt for the report.
import { writeFileSync } from "node:fs";

const BASE = (process.argv[2] || "https://glydrift.com").replace(/\/$/, "");
// the pages that must load, and words each must contain (a blank page or the game's fallback
// page served in place of a missing one would not)
const PAGES = [
  { path: "/", must: ["Glydrift", "Gleyde Technologies, LLC"] },
  { path: "/privacy", must: ["Privacy"] },
  { path: "/support", must: ["Support"] },
  { path: "/links/", must: ["Glydrift"] },
];
const UA = "glydrift-nightly-site-check";
const problems = [];
const warnings = [];
const checked = new Map();

async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { redirect: "follow", headers: { "user-agent": UA } });
      const type = r.headers.get("content-type") || "";
      return { status: r.status, text: /text|json|javascript|xml/.test(type) ? await r.text() : "" };
    } catch (e) {
      if (attempt === 3) return { status: 0, text: "", error: e.message };
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

/** Every href/src on a page (and a manifest's icons), resolved, without in-page or mail links. */
function linksOf(html, pageUrl) {
  const out = new Set();
  for (const m of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    const raw = m[1].trim();
    if (!raw || /^(#|mailto:|tel:|javascript:|data:|sms:)/i.test(raw)) continue;
    // Cloudflare's hidden email addresses (decoded by the page's script; always 404 to a bot)
    if (raw.includes("/cdn-cgi/l/email-protection")) continue;
    try {
      out.add(new URL(raw, pageUrl).href.split("#")[0]);
    } catch {
      problems.push(`${pageUrl}: unreadable link "${raw}"`);
    }
  }
  return out;
}

async function checkLink(url, from) {
  if (checked.has(url)) return;
  checked.set(url, null);
  const r = await get(url);
  checked.set(url, r.status);
  const ours = url.startsWith(BASE);
  if (r.status >= 200 && r.status < 400) return;
  const line = `${r.status || "no answer"} ${url} (linked from ${from})${r.error ? `: ${r.error}` : ""}`;
  // our own files must always answer; another site that turns bots away (403/429) or can't be
  // reached this once is a warning, but a 404 / 410 there is a dead link
  if (ours || r.status === 404 || r.status === 410) problems.push(line);
  else warnings.push(line);
}

for (const p of PAGES) {
  const url = BASE + p.path;
  const r = await get(url);
  if (r.status !== 200) {
    problems.push(`${r.status || "no answer"} ${url}: the page doesn't load${r.error ? ` (${r.error})` : ""}`);
    continue;
  }
  for (const w of p.must) if (!r.text.includes(w)) problems.push(`${url}: loads but doesn't say "${w}"`);
  for (const link of linksOf(r.text, url)) await checkLink(link, p.path);
}

// the web app manifest's icons, and the files the game checks at launch
const man = await get(`${BASE}/manifest.json`);
if (man.status !== 200) problems.push(`${man.status} ${BASE}/manifest.json`);
else
  try {
    for (const icon of JSON.parse(man.text).icons || [])
      await checkLink(new URL(icon.src, `${BASE}/`).href, "/manifest.json");
  } catch (e) {
    problems.push(`${BASE}/manifest.json: not valid JSON (${e.message})`);
  }
for (const f of ["/version.json", "/sw.js", "/seasons.json"]) await checkLink(BASE + f, "the game");

const report = [
  `site check of ${BASE}: ${checked.size} links and files checked, ${problems.length} problem(s), ${warnings.length} warning(s)`,
  ...problems.map((p) => `FAIL ${p}`),
  ...warnings.map((w) => `WARN ${w}`),
].join("\n");
console.log(report);
writeFileSync("site-check.txt", report + "\n");
process.exit(problems.length ? 1 : 0);
