/* Individual checks. Each returns { id, title, status, detail, fix, points, max }.
   status: pass | warn | fail | info (shown, not scored) | skip (couldn't check, not scored). */
import { SCAN, apiJson, ascii, clip, discard, readPrefix, safeGet } from "./net.js";

export function check(id, title, max, status, detail, fix = "") {
  const points = status === "pass" ? max : status === "warn" ? Math.round(max / 2) : 0;
  return { id, title, status, detail, fix, points, max: status === "skip" || status === "info" ? 0 : max };
}

export function headerChecks(h, skipReason) {
  if (skipReason) {
    const no = (id, title, max) => check(id, title, max, "fail", skipReason, "Fix HTTPS first; then these protections can be added.");
    return [
      no("csp", "Content Security Policy", 10), no("clickjacking", "Clickjacking protection", 7),
      no("nosniff", "MIME-sniffing protection", 5), no("referrer", "Referrer policy", 4),
      no("permissions", "Permissions policy", 3), check("disclosure", "Software version hidden", 4, "skip", skipReason),
    ];
  }
  const out = [];

  const csp = h.get("content-security-policy");
  const cspRO = h.get("content-security-policy-report-only");
  if (csp) {
    const script = (/(?:^|;)\s*script-src([^;]*)/i.exec(csp) || /(?:^|;)\s*default-src([^;]*)/i.exec(csp) || [])[1] || "";
    const weak = /'unsafe-inline'/i.test(script) && !/'(nonce|sha(256|384|512))-/i.test(script);
    out.push(weak
      ? check("csp", "Content Security Policy", 10, "warn",
          "You have a Content Security Policy, but it allows inline scripts ('unsafe-inline'), which removes most of its protection against injected code.",
          "Move inline scripts into separate files (or use nonces) and remove 'unsafe-inline' from script-src.")
      : check("csp", "Content Security Policy", 10, "pass", "A Content Security Policy limits which scripts can run, which blocks most code-injection (XSS) attacks."));
  } else if (cspRO) {
    out.push(check("csp", "Content Security Policy", 10, "warn",
      "You have a Content Security Policy in report-only mode, so it reports problems but doesn't block anything yet.",
      "Once reports look clean, switch the header from Content-Security-Policy-Report-Only to Content-Security-Policy."));
  } else {
    out.push(check("csp", "Content Security Policy", 10, "fail",
      "There's no Content Security Policy, so if an attacker manages to inject code into a page, browsers will run it.",
      "Add a Content-Security-Policy header. Start with: default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self' and adjust for the services your site uses."));
  }

  const xfo = (h.get("x-frame-options") || "").toUpperCase();
  const fa = csp && /frame-ancestors/i.test(csp);
  out.push(xfo === "DENY" || xfo === "SAMEORIGIN" || fa
    ? check("clickjacking", "Clickjacking protection", 7, "pass", "Other websites can't secretly load your pages in a frame to trick visitors into clicking.")
    : check("clickjacking", "Clickjacking protection", 7, "fail",
        "Other websites can load your pages inside a hidden frame and trick visitors into clicking buttons (clickjacking).",
        "Add the header X-Frame-Options: DENY (or SAMEORIGIN), or frame-ancestors 'none' in your CSP."));

  out.push((h.get("x-content-type-options") || "").toLowerCase().trim() === "nosniff"
    ? check("nosniff", "MIME-sniffing protection", 5, "pass", "Browsers are told not to guess file types, which closes a class of upload and script tricks.")
    : check("nosniff", "MIME-sniffing protection", 5, "fail",
        "Browsers may guess a file's type and run a file as a script when it shouldn't be.",
        "Add the header X-Content-Type-Options: nosniff."));

  const rp = (h.get("referrer-policy") || "").toLowerCase();
  out.push(!rp
    ? check("referrer", "Referrer policy", 4, "fail",
        "Without a referrer policy, the full address of your pages (which can include private details) may be sent to other sites.",
        "Add the header Referrer-Policy: strict-origin-when-cross-origin.")
    : /unsafe-url|no-referrer-when-downgrade/.test(rp)
      ? check("referrer", "Referrer policy", 4, "warn", `Your referrer policy ("${clip(rp, 60)}") still shares full page addresses with other sites.`,
          "Change it to Referrer-Policy: strict-origin-when-cross-origin.")
      : check("referrer", "Referrer policy", 4, "pass", "Your site limits what page information is shared with other websites."));

  out.push(h.get("permissions-policy")
    ? check("permissions", "Permissions policy", 3, "pass", "Your site restricts access to features like the camera, microphone and location.")
    : check("permissions", "Permissions policy", 3, "fail",
        "There's no permissions policy, so any script on your site could ask for the camera, microphone or location.",
        "Add a Permissions-Policy header, for example: camera=(), microphone=(), geolocation=()."));

  const server = h.get("server") || "";
  const powered = h.get("x-powered-by") || h.get("x-aspnet-version") || h.get("x-generator") || "";
  const leak = /\d/.test(server) ? `Server: ${clip(server, 60)}` : powered ? `X-Powered-By: ${clip(powered, 60)}` : "";
  out.push(leak
    ? check("disclosure", "Software version hidden", 4, "fail",
        `Your server announces its software and version (${leak}). That helps attackers look up known weaknesses.`,
        "Turn off version banners (for example server_tokens off in nginx, ServerTokens Prod in Apache, expose_php = Off in PHP).")
    : check("disclosure", "Software version hidden", 4, "pass", "Your server doesn't advertise its software version."));
  return out;
}

export function spfCheck(txt, domain, lookups = null, hasMx = true) {
  if (txt === null) return check("spf", "SPF (email sender list)", 9, "skip", "We couldn't look up your DNS records right now.");
  const spf = txt.filter((t) => /^v=spf1(\s|$)/i.test(t.trim()));
  if (!spf.length && !hasMx) {
    return check("spf", "SPF (email sender list)", 9, "fail",
      `${domain} doesn't receive email and has no SPF record, so scammers can still send email that claims to come from it.`,
      "If you never send email from this domain, publish a TXT record that says so: v=spf1 -all");
  }
  if (!spf.length) {
    return check("spf", "SPF (email sender list)", 9, "fail",
      `${domain} has no SPF record, so anyone can send email that claims to come from your domain.`,
      "Add a TXT record listing who sends your email, e.g. v=spf1 include:_spf.google.com ~all (your email provider gives you the exact value).");
  }
  if (spf.length > 1) {
    return check("spf", "SPF (email sender list)", 9, "fail",
      `${domain} has ${spf.length} SPF records. Only one is allowed, so receiving servers may ignore all of them.`,
      "Merge them into a single v=spf1 record.");
  }
  const rec = spf[0];
  if (/(^|\s)\+?all(\s|$)/i.test(rec) && !/[~?-]all/i.test(rec)) {
    return check("spf", "SPF (email sender list)", 9, "fail",
      "Your SPF record ends in +all, which tells the world that any server may send email as you.",
      "Change the ending to ~all or -all.");
  }
  if (lookups !== null && lookups > 10) {
    return check("spf", "SPF (email sender list)", 9, "fail",
      `Your SPF record needs ${lookups} DNS lookups, but the limit is 10. Past the limit, receiving servers treat SPF as broken, so your real email can land in spam and fakes aren't blocked.`,
      "Remove senders you no longer use, or replace include: entries with the services' IP ranges (\"SPF flattening\"). Keep the total at 10 or fewer.");
  }
  if (/[~-]all/i.test(rec) || /redirect=/i.test(rec)) {
    return check("spf", "SPF (email sender list)", 9, "pass", "Your SPF record tells email providers which servers may send email for your domain.");
  }
  return check("spf", "SPF (email sender list)", 9, "warn",
    "Your SPF record doesn't end in ~all or -all, so it doesn't actually tell providers to distrust other senders.",
    "End the record with ~all (or -all once you're confident it's complete).");
}

export function dmarcCheck(txt, domain) {
  if (txt === null) return check("dmarc", "DMARC (email spoofing policy)", 10, "skip", "We couldn't look up your DNS records right now.");
  const rec = txt.find((t) => /^v=DMARC1/i.test(t.trim()));
  if (!rec) {
    return check("dmarc", "DMARC (email spoofing policy)", 10, "fail",
      `${domain} has no DMARC policy, so scammers can send convincing fake emails "from" your business to your clients.`,
      `Add a TXT record at _dmarc.${domain}: v=DMARC1; p=quarantine; rua=mailto:you@${domain} (start with p=none for a few weeks if you're unsure).`);
  }
  const p = (/(?:^|;)\s*p\s*=\s*(\w+)/i.exec(rec) || [])[1]?.toLowerCase();
  if (p === "reject" || p === "quarantine") {
    return check("dmarc", "DMARC (email spoofing policy)", 10, "pass", `Your DMARC policy (p=${p}) tells email providers to block or junk fake emails using your domain.`);
  }
  return check("dmarc", "DMARC (email spoofing policy)", 10, "warn",
    "You have DMARC, but it's set to p=none: fake emails are reported but still delivered.",
    "Once your reports show your real email passes, change it to p=quarantine, then p=reject.");
}

/* Well-known files that should never be public. A file only counts as exposed when its
   content matches what that file really looks like (so "200 OK" error pages don't count). */
const notHtml = (t) => !/<html|<!doctype/i.test(t);
export const EXPOSED_FILES = [
  { path: "/.env", risk: "an environment file, which usually holds passwords and API keys",
    match: (b) => { const t = ascii(b); return notHtml(t) && /^\s*[A-Z][A-Z0-9_]{2,}\s*=/m.test(t); } },
  { path: "/.git/HEAD", risk: "part of your source-code history (.git), which can let anyone download your site's code",
    match: (b) => /^(ref: refs\/|[0-9a-f]{40}\s*$)/.test(ascii(b)) },
  { path: "/.git/config", risk: "your Git configuration, which can reveal repository addresses and credentials",
    match: (b) => /^\s*\[core\]/m.test(ascii(b)) },
  { path: "/wp-config.php.bak", risk: "a WordPress config backup containing your database password",
    match: (b) => /DB_PASSWORD|DB_NAME/.test(ascii(b)) },
  { path: "/wp-config.php~", risk: "a WordPress config backup containing your database password",
    match: (b) => /DB_PASSWORD|DB_NAME/.test(ascii(b)) },
  { path: "/backup.sql", risk: "a database backup, which may contain customer data",
    match: (b) => { const t = ascii(b); return notHtml(t) && /\b(CREATE TABLE|INSERT INTO)\b/i.test(t); } },
  { path: "/.htpasswd", risk: "a password file", match: (b) => { const t = ascii(b); return notHtml(t) && /^[^:\s<>]+:[^\s]{4,}$/m.test(t); } },
  { path: "/.DS_Store", risk: "a Mac folder index that lists hidden files on your server",
    match: (b) => b.length >= 8 && b[3] === 1 && b[4] === 0x42 && b[5] === 0x75 && b[6] === 0x64 && b[7] === 0x31 },
  { path: "/phpinfo.php", risk: "a PHP diagnostics page that reveals detailed server configuration",
    match: (b) => /phpinfo\(\)|<title>PHP \d/i.test(ascii(b)) },
  { path: "/server-status", risk: "the Apache status page, which shows live visitor requests",
    match: (b) => /Apache Server Status/i.test(ascii(b)) },
];

export async function probeFile(ctx, origin, file) {
  const r = await safeGet(ctx, new URL(file.path, origin));
  if (!r.res) return false;
  try {
    if (r.res.status !== 200) {
      discard(r.res);
      return false;
    }
    return file.match(await readPrefix(r.res));
  } finally {
    r.done();
  }
}

export async function securityTxt(ctx, origin) {
  const r = await safeGet(ctx, new URL("/.well-known/security.txt", origin));
  if (!r.res) return false;
  try {
    if (r.res.status !== 200) {
      discard(r.res);
      return false;
    }
    return /^\s*Contact:/im.test(ascii(await readPrefix(r.res)));
  } finally {
    r.done();
  }
}


/* ------------------------------------------------------------ deeper passive checks */

const daysUntil = (iso) => Math.floor((Date.parse(iso) - Date.now()) / 864e5);
const fmtDate = (iso) => new Date(iso).toISOString().slice(0, 10);

/* Counts SPF DNS lookups (include, a, mx, ptr, exists, redirect), following includes.
   If we hit our own fetch cap, unexpanded includes still count as 1 each, so the result is a
   lower bound: > 10 is a definite failure; otherwise an incomplete count returns null (unknown). */
export async function spfLookupCount(ctx, record, txtFn, state = { fetched: 0, incomplete: false }, depth = 0) {
  let count = 0;
  for (const t of record.split(/\s+/)) {
    const m = /^[+~?-]?(include:|a\b|a:|a\/|mx\b|mx:|mx\/|ptr|exists:|redirect=)(.*)$/i.exec(t);
    if (!m) continue;
    count++;
    const kind = m[1].toLowerCase();
    if (kind !== "include:" && kind !== "redirect=") continue;
    if (depth >= 4 || state.fetched >= 8) {
      state.incomplete = true;
      continue;
    }
    state.fetched++;
    const sub = (await txtFn(m[2]))?.find((r) => /^v=spf1(\s|$)/i.test(r));
    if (sub) count += await spfLookupCount(ctx, sub, txtFn, state, depth + 1);
  }
  if (depth === 0 && state.incomplete && count <= 10) return null;
  return count;
}

export function emailProviderFromMx(mxAnswers) {
  const hosts = (mxAnswers || []).filter((a) => a.type === 15).map((a) => String(a.data).toLowerCase());
  const p = hosts.join(" ");
  const provider = /google\.com|googlemail\.com/.test(p) ? "google"
    : /outlook\.com|office365|protection\.outlook/.test(p) ? "microsoft"
    : /zoho\./.test(p) ? "zoho" : /protonmail|proton\.me/.test(p) ? "proton"
    : /secureserver\.net/.test(p) ? "godaddy" : null;
  return { hasMx: hosts.length > 0, provider };
}

export const DKIM_SELECTORS = {
  google: ["google"],
  microsoft: ["selector1", "selector2"],
  zoho: ["zmail", "zoho"],
  default: ["default", "selector1", "google", "k1"],
};

export function dkimCheck(found, provider) {
  if (found) return check("dkim", "DKIM (email signatures)", 8, "pass", `We found a DKIM signing key (selector "${clip(found, 30)}"), so your outgoing email can be verified as genuinely yours.`);
  if (provider === "google" || provider === "microsoft") {
    return check("dkim", "DKIM (email signatures)", 8, "fail",
      `Your email runs on ${provider === "google" ? "Google Workspace" : "Microsoft 365"}, but DKIM signing isn't turned on, so receivers can't verify your messages are really from you.`,
      "Turn on DKIM in your email admin console and add the DNS record it gives you.");
  }
  return check("dkim", "DKIM (email signatures)", 8, "info",
    "We couldn't find DKIM at the common locations. It may still be set up under a custom name; ask whoever manages your email to confirm DKIM signing is on.",
    "Ask your email provider how to turn on DKIM signing and add the DNS record it gives you.");
}

export function mtastsCheck(txt) {
  return txt?.some((t) => /^v=STSv1/i.test(t))
    ? check("mtasts", "MTA-STS (encrypted email delivery)", 0, "info", "You publish an MTA-STS policy, so other mail servers must use encryption when delivering email to you.")
    : check("mtasts", "MTA-STS (encrypted email delivery)", 0, "info",
        "Optional: you don't publish MTA-STS, which forces other mail servers to encrypt email they deliver to you.",
        "Once SPF, DKIM and DMARC are solid, consider MTA-STS (your email provider has a guide).");
}

export function dnssecCheck(ds) {
  if (ds === null) return check("dnssec", "DNSSEC (tamper-proof DNS)", 4, "skip", "We couldn't look up your DNS records right now.");
  return ds.answers.some((a) => a.type === 43)
    ? check("dnssec", "DNSSEC (tamper-proof DNS)", 4, "pass", "Your domain uses DNSSEC, which stops attackers from faking your DNS answers.")
    : check("dnssec", "DNSSEC (tamper-proof DNS)", 4, "warn",
        "DNSSEC isn't turned on, so in some attacks your visitors or email could be quietly redirected to a fake server.",
        "Turn on DNSSEC at your DNS provider, then add the DS record at your domain registrar (often one click if they're the same company).");
}

export function caaCheck(caa, domain) {
  if (caa === null) return check("caa", "CAA (who may issue certificates)", 0, "skip", "We couldn't look up your DNS records right now.");
  const recs = caa.answers.filter((a) => a.type === 257);
  return recs.length
    ? check("caa", "CAA (who may issue certificates)", 0, "info", "You limit which certificate authorities may issue HTTPS certificates for your domain.")
    : check("caa", "CAA (who may issue certificates)", 0, "info",
        `Optional: ${domain} has no CAA record, so any certificate authority may issue a certificate for it.`,
        "Add a CAA record naming the certificate authority your host uses (for example letsencrypt.org).");
}

/* Cookies set by the home page. */
export function cookiesCheck(setCookies) {
  if (!setCookies.length) return check("cookies", "Cookie security", 5, "pass", "Your home page doesn't set any cookies, so there's nothing to steal here.");
  const problems = [];
  let worst = "pass";
  for (const raw of setCookies.slice(0, 20)) {
    const [pair, ...attrs] = raw.split(";");
    const name = clip(pair.split("=")[0], 40);
    const a = attrs.map((x) => x.trim().toLowerCase());
    const has = (k) => a.some((x) => x === k || x.startsWith(`${k}=`));
    const sessiony = /sess|sid|auth|token|login|logged|jwt|csrf|xsrf|remember/i.test(name);
    const missing = [];
    if (!has("secure")) missing.push("Secure");
    if (sessiony && !has("httponly")) missing.push("HttpOnly");
    if (!has("samesite")) missing.push("SameSite");
    if (!missing.length) continue;
    if (missing.includes("Secure") || missing.includes("HttpOnly")) worst = "fail";
    else if (worst === "pass") worst = "warn";
    if (problems.length < 4) problems.push(`${name} (missing ${missing.join(", ")})`);
  }
  if (worst === "pass") return check("cookies", "Cookie security", 5, "pass", "The cookies your home page sets are marked Secure and protected from scripts and other sites.");
  return check("cookies", "Cookie security", 5, worst,
    `Some cookies aren't fully protected: ${problems.join("; ")}. Unprotected cookies can be stolen over insecure connections or by injected scripts, letting someone take over a logged-in session.`,
    "Mark cookies Secure and SameSite=Lax, and mark login/session cookies HttpOnly.");
}

export function mixedCheck(info, httpsOk, htmlRead) {
  if (!httpsOk || !htmlRead) return check("mixed", "Mixed content", 5, "skip", "Couldn't be checked because we couldn't read your home page over HTTPS.");
  return info.mixed.length
    ? check("mixed", "Mixed content", 5, "fail",
        `Your secure page loads ${info.mixed.length === 5 ? "5 or more" : info.mixed.length} item(s) over insecure http://, for example ${info.mixed.slice(0, 2).join(", ")}. Browsers block or warn about these, and they can be tampered with.`,
        "Change those links to https:// (or remove them).")
    : check("mixed", "Mixed content", 5, "pass", "Everything on your home page loads securely over HTTPS.");
}

export function formsCheck(info, htmlRead) {
  if (!htmlRead) return check("forms", "Secure forms", 6, "skip", "Couldn't be checked because we couldn't read your home page.");
  return info.insecureForms
    ? check("forms", "Secure forms", 6, "fail",
        `${info.insecureForms} form(s) on your home page send information to an insecure http:// address, so anything visitors type (names, emails, maybe more) travels unencrypted.`,
        "Change each form's action address to https://, or have your developer fix the form plugin.")
    : check("forms", "Secure forms", 6, "pass", "Forms on your home page send information securely.");
}

export function thirdPartyCheck(info, htmlRead) {
  if (!htmlRead) return check("thirdparty", "Third-party scripts", 0, "skip", "Couldn't be checked because we couldn't read your home page.");
  const ext = info.externalScripts;
  if (!ext.length) return check("thirdparty", "Third-party scripts", 0, "info", "Your home page doesn't load scripts from outside services.");
  const hosts = ext.map((e) => e.host).slice(0, 6).join(", ");
  return check("thirdparty", "Third-party scripts", 0, "info",
    `Your home page runs code from ${ext.length} outside service(s): ${hosts}${ext.length > 6 ? ", …" : ""}. Each one can change what runs on your site, so if any is hacked, your visitors are affected.`,
    "Remove scripts you no longer use. For fixed-version libraries loaded from a CDN, add Subresource Integrity (integrity=\"sha384-...\") so tampered files are blocked.");
}

/* PHP release support dates (php.net). Update this table as new versions ship. */
const PHP_EOL = { "7.4": "2022-11-28", "8.0": "2023-11-26", "8.1": "2025-12-31", "8.2": "2026-12-31", "8.3": "2027-12-31", "8.4": "2028-12-31", "8.5": "2029-12-31" };
const vcmp = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

/* Looks up detected libraries in OSV and the WordPress version against wordpress.org. */
export async function softwareCheck(ctx, info, headers, htmlRead) {
  const findings = [];
  const notes = [];

  const tasks = [];
  if (info.libs.length) {
    tasks.push(apiJson(ctx, "https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries: info.libs.map((l) => ({ package: { name: l.name, ecosystem: "npm" }, version: l.version })) }),
    }).then((out) => {
      if (!out?.results) return notes.push("We couldn't reach the vulnerability database to check your JavaScript libraries.");
      out.results.forEach((r, i) => {
        const n = r?.vulns?.length || 0;
        const l = info.libs[i];
        if (n) findings.push(`${l.name} ${l.version} has ${n} known security issue${n === 1 ? "" : "s"}`);
      });
    }));
  }
  if (info.wpVersion) {
    tasks.push(apiJson(ctx, "https://api.wordpress.org/core/version-check/1.7/").then((out) => {
      const latest = out?.offers?.[0]?.current;
      if (latest && vcmp(info.wpVersion, latest) < 0) findings.push(`WordPress ${info.wpVersion} is out of date (the latest is ${latest})`);
      else if (!latest) notes.push("We couldn't confirm the latest WordPress version.");
    }));
  }
  await Promise.all(tasks);

  const php = /PHP\/(\d+)\.(\d+)/i.exec(headers?.get("x-powered-by") || "");
  if (php) {
    const branch = `${php[1]}.${php[2]}`;
    const eol = PHP_EOL[branch] || (Number(php[1]) < 8 ? "2022-11-28" : null);
    if (eol && Date.parse(eol) < Date.now()) findings.push(`PHP ${branch} stopped getting security fixes on ${eol}`);
    else if (eol && daysUntil(eol) < 90) notes.push(`PHP ${branch} stops getting security fixes on ${eol}; plan the upgrade.`);
  }

  const seen = [info.wpVersion && `WordPress ${info.wpVersion}`, ...info.libs.map((l) => `${l.name} ${l.version}`), php && `PHP ${php[1]}.${php[2]}`].filter(Boolean);
  if (findings.length) {
    return check("software", "Outdated software", 12, "fail",
      `${findings.join("; ")}. Attackers scan the internet for exactly these versions and use published exploits against them.${notes.length ? ` ${notes.join(" ")}` : ""}`,
      "Update the software listed above (and, if it comes from a theme or plugin, update or replace that theme or plugin). Back up first.");
  }
  if (!htmlRead && !php) return check("software", "Outdated software", 12, "skip", "Couldn't be checked because we couldn't read your home page.");
  return check("software", "Outdated software", 12, notes.length ? "warn" : "pass",
    seen.length
      ? `The versions we could see (${seen.slice(0, 5).join(", ")}) have no known security issues.${notes.length ? ` ${notes.join(" ")}` : ""}`
      : "No outdated software was visible from outside. (A full audit also checks plugins and server software we can't see from here.)",
    notes.length ? "Plan the update noted above." : "");
}

/* Certificate expiry from public Certificate Transparency logs. */
export async function certExpiryCheck(ctx, host) {
  const out = await apiJson(ctx, `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(host)}&match_wildcards=true&expand=dns_names`);
  if (!Array.isArray(out) || !out.length) return check("certexpiry", "Certificate expiry", 6, "skip", "We couldn't read your certificate's expiry date from public logs right now.");
  const parent = host.split(".").slice(1).join(".");
  const covering = out.filter((c) => (c.dns_names || []).some((n) => n === host || n === `*.${parent}`));
  const latest = (covering.length ? covering : out).map((c) => c.not_after).filter(Boolean).sort().pop();
  if (!latest) return check("certexpiry", "Certificate expiry", 6, "skip", "We couldn't read your certificate's expiry date from public logs right now.");
  const days = daysUntil(latest);
  if (days < 0) return check("certexpiry", "Certificate expiry", 6, "fail", `Your most recent certificate expired on ${fmtDate(latest)}.`, "Renew the certificate now and turn on automatic renewal.");
  if (days < 7) return check("certexpiry", "Certificate expiry", 6, "fail", `Your certificate expires in ${days} day(s) (${fmtDate(latest)}). When it lapses, browsers show a full-page security warning.`, "Renew now and make sure automatic renewal is working.");
  if (days < 21) return check("certexpiry", "Certificate expiry", 6, "warn", `Your certificate expires in ${days} days (${fmtDate(latest)}). That's fine if it renews automatically.`, "Confirm automatic renewal is on (most hosts and Cloudflare renew automatically).");
  return check("certexpiry", "Certificate expiry", 6, "pass", `Your certificate is valid until ${fmtDate(latest)} (${days} days).`);
}

/* Domain registration expiry and transfer lock from public RDAP records. */
export async function domainChecks(ctx, registrable) {
  const rdap = await apiJson(ctx, `https://rdap.org/domain/${encodeURIComponent(registrable)}`, { headers: { Accept: "application/rdap+json, application/json" } });
  if (!rdap || rdap.objectClassName !== "domain") {
    return [
      check("domainexpiry", "Domain renewal", 6, "skip", "We couldn't read your domain's registration record right now."),
      check("registrarlock", "Domain transfer lock", 3, "skip", "We couldn't read your domain's registration record right now."),
    ];
  }
  const exp = (rdap.events || []).find((e) => e.eventAction === "expiration")?.eventDate;
  const status = (rdap.status || []).map((s) => String(s).toLowerCase());
  const out = [];
  if (!exp) out.push(check("domainexpiry", "Domain renewal", 6, "skip", "Your registry doesn't publish an expiry date."));
  else {
    const d = daysUntil(exp);
    out.push(d < 30
      ? check("domainexpiry", "Domain renewal", 6, "fail", `${registrable} expires in ${d} day(s) (${fmtDate(exp)}). If it lapses, your website and email stop working and someone else can register it.`, "Renew now and turn on auto-renew with a current payment card.")
      : d < 60
        ? check("domainexpiry", "Domain renewal", 6, "warn", `${registrable} expires in ${d} days (${fmtDate(exp)}).`, "Make sure auto-renew is on and your payment card is current.")
        : check("domainexpiry", "Domain renewal", 6, "pass", `${registrable} is registered until ${fmtDate(exp)}.`));
  }
  out.push(status.some((s) => s.includes("client transfer prohibited") || s.includes("server transfer prohibited"))
    ? check("registrarlock", "Domain transfer lock", 3, "pass", "Your domain is locked against unauthorized transfers to another registrar.")
    : check("registrarlock", "Domain transfer lock", 3, "warn", "Your domain isn't transfer-locked, which makes it easier to hijack if your registrar account is compromised.", "Turn on \"Domain lock\" / \"Transfer lock\" at your registrar, and protect that account with two-factor login."));
  return out;
}

/* Google Safe Browsing (only when an API key is configured). */
export async function blocklistCheck(ctx, key, url) {
  if (!key) return null;
  const out = await apiJson(ctx, `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client: { clientId: "gleyde-security-check", clientVersion: "1.0" },
      threatInfo: {
        threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url }],
      },
    }),
  });
  if (out === null) return check("blocklist", "Malware & phishing blocklists", 10, "skip", "We couldn't check Google Safe Browsing right now.");
  return out.matches?.length
    ? check("blocklist", "Malware & phishing blocklists", 10, "fail",
        "Google Safe Browsing lists your site as dangerous, so Chrome, Safari and Firefox show visitors a red warning page. This usually means the site was hacked.",
        "Have the site cleaned by a professional, then request a review in Google Search Console (Security issues).")
    : check("blocklist", "Malware & phishing blocklists", 10, "pass", "Your site isn't on Google's malware or phishing blocklist.");
}

/* Registrable domain without a full public-suffix list: last two labels, or three for common
   two-part suffixes (co.uk, com.au, ...). Good enough for RDAP/DNSSEC lookups. */
const TWO_PART = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "com.au", "net.au", "org.au", "co.nz", "com.br", "co.jp", "co.in", "com.mx", "co.za", "com.sg", "com.tr", "com.cn"]);
export function registrableDomain(host) {
  const l = host.split(".");
  return TWO_PART.has(l.slice(-2).join(".")) ? l.slice(-3).join(".") : l.slice(-2).join(".");
}
