/* Passive website security check: orchestration, scoring and report.

   What it does (and ONLY this):
     - DNS lookups over HTTPS (A, AAAA, MX, TXT for SPF/DMARC/DKIM/MTA-STS, DS, CAA)
     - GET the home page over https:// (following up to 4 redirects, reading at most 300 KB)
       and http://, a short fixed list of commonly exposed files (at most 4 KB each, contents
       never returned), and /.well-known/security.txt
     - look up public records: RDAP (domain registration), Certificate Transparency logs,
       the OSV vulnerability database, wordpress.org's latest version, and (if configured)
       Google Safe Browsing
   No logins, no form submissions, no query strings on the target site, no payloads,
   no port scanning. SSRF protection lives in ./scan/net.js. */
import { enrich, INDUSTRIES, priorities } from "./scan/advice.js";
import {
  DKIM_SELECTORS, EXPOSED_FILES, blocklistCheck, caaCheck, certExpiryCheck, check, cookiesCheck, dkimCheck, dmarcCheck,
  dnssecCheck, domainChecks, emailProviderFromMx, formsCheck, headerChecks, mixedCheck, mtastsCheck, probeFile,
  registrableDomain, securityTxt, softwareCheck, spfCheck, spfLookupCount, thirdPartyCheck,
} from "./scan/checks.js";
import { analyzeHtml, detectPlatform } from "./scan/html.js";
import { Ctx, SCAN, ScanError, ascii, discard, dnsQuery, getFollowing, readPrefix, resolvePublic, safeGet, txtRecords } from "./scan/net.js";

export { EXPOSED_FILES } from "./scan/checks.js";
export { INDUSTRIES } from "./scan/advice.js";
export { SCAN, ScanError, normalizeDomain } from "./scan/net.js";

const getSetCookies = (h) => {
  if (!h) return [];
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const v = h.get("set-cookie");
  return v ? v.split(/,(?=\s*[^;,=\s]+=)/) : [];
};

export async function runScan(host, { userAgent = "GleydeSecurityCheck/1.0 (passive)", industry = "", safeBrowsingKey = "" } = {}) {
  const ctx = new Ctx(userAgent);

  let first = await resolvePublic(ctx, host);
  // People often type (or the page trims to) the bare domain of a site that only exists at www.
  if (!first.ok && first.reason === "nxdomain" && !host.startsWith("www.")) {
    const www = await resolvePublic(ctx, `www.${host}`);
    if (www.ok || www.reason === "private") {
      first = www;
      host = `www.${host}`;
    }
  }
  if (!first.ok) {
    if (first.reason === "private") {
      throw new ScanError("private", "That domain points to a private or internal network address, so we don't check it.");
    }
    if (first.reason === "nxdomain") throw new ScanError("nxdomain", "We couldn't find that domain. Please check the spelling.");
    throw new ScanError("dns", "We couldn't look up that domain right now. Please try again in a minute.");
  }

  const emailDomain = registrableDomain(host);
  const txtCache = new Map();
  const txt = (name) => {
    if (!txtCache.has(name)) txtCache.set(name, txtRecords(ctx, name));
    return txtCache.get(name);
  };

  /* Round 1: the website itself, plus email and domain records, all in parallel. */
  const [https, http, spfTxt, dmarcTxt, mx, ds, caa, mtaTxt, domainRes, certRes] = await Promise.all([
    getFollowing(ctx, `https://${host}/`),
    safeGet(ctx, new URL(`http://${host}/`)),
    txt(emailDomain),
    txt(`_dmarc.${emailDomain}`),
    dnsQuery(ctx, emailDomain, "MX"),
    dnsQuery(ctx, emailDomain, "DS"),
    dnsQuery(ctx, emailDomain, "CAA"),
    txt(`_mta-sts.${emailDomain}`),
    domainChecks(ctx, emailDomain),
    certExpiryCheck(ctx, host),
  ]);

  const httpsOk = Boolean(https.res) && https.url.protocol === "https:";
  const finalUrl = https.res ? https.url.href : null;
  const origin = httpsOk ? https.url.origin : null;
  const headers = https.res?.headers;
  let html = "";
  if (https.res) {
    const type = headers.get("content-type") || "";
    if (https.res.status < 400 && /html/i.test(type)) html = ascii(await readPrefix(https.res, SCAN.maxHtmlBytes));
    else discard(https.res);
    https.done?.();
  }
  const htmlRead = httpsOk && html.length > 0;
  const info = analyzeHtml(html, finalUrl || `https://${host}/`);
  const platform = detectPlatform(headers, info);
  const { hasMx, provider: emailProvider } = emailProviderFromMx(mx?.answers);

  const tls = [];
  if (httpsOk) {
    tls.push(check("https", "HTTPS encryption", 15, "pass", "Your site loads over HTTPS, so information visitors send is encrypted."));
  } else {
    const why = https.tooManyRedirects ? "it redirects too many times"
      : https.blocked ? "a redirect points somewhere we don't follow (a private address or non-standard port)"
      : https.res ? "its https:// address sends visitors to an insecure http:// page"
      : "the server didn't answer on https://, or its certificate isn't trusted";
    tls.push(check("https", "HTTPS encryption", 15, "fail",
      `We couldn't load your site securely over HTTPS: ${why}. Visitors' information may be sent unencrypted, and browsers show "Not secure".`,
      "Install a free certificate (for example with Cloudflare or Let's Encrypt), set it to renew automatically, and make sure https:// loads your site."));
  }

  if (http.res) {
    const loc = http.res.headers.get("Location") || "";
    discard(http.res);
    http.done?.();
    const redirects = http.res.status >= 300 && http.res.status < 400 && /^https:\/\//i.test(loc);
    tls.push(redirects
      ? check("redirect", "HTTP to HTTPS redirect", 8, "pass", "Visitors who type http:// are sent to the secure https:// version.")
      : check("redirect", "HTTP to HTTPS redirect", 8, "fail",
          "Your site also loads on plain http:// without redirecting, so some visitors get an unencrypted page.",
          "Turn on \"Always Use HTTPS\" in Cloudflare, or add a permanent (301) redirect from http:// to https://."));
  } else {
    tls.push(check("redirect", "HTTP to HTTPS redirect", 8, "pass", "Plain http:// doesn't serve your site, so nobody lands on an unencrypted page."));
  }

  const hsts = httpsOk ? headers.get("strict-transport-security") : null;
  const maxAge = Number((/max-age\s*=\s*"?(\d+)/i.exec(hsts || "") || [])[1] || 0);
  tls.push(!httpsOk
    ? check("hsts", "HSTS (always use HTTPS)", 10, "fail", "Couldn't be checked because the site didn't load over HTTPS.", "Fix HTTPS first, then add Strict-Transport-Security.")
    : !hsts
      ? check("hsts", "HSTS (always use HTTPS)", 10, "fail",
          "Browsers aren't told to always use HTTPS, so a visitor on public Wi-Fi can be quietly downgraded to an insecure connection.",
          "Add the header Strict-Transport-Security: max-age=31536000; includeSubDomains.")
      : maxAge < 15552000
        ? check("hsts", "HSTS (always use HTTPS)", 10, "warn", `HSTS is on, but only for ${maxAge >= 86400 ? `${Math.round(maxAge / 86400)} day${Math.round(maxAge / 86400) === 1 ? "" : "s"}` : `${maxAge} seconds`}, which is shorter than recommended.`,
            "Raise it to at least six months: max-age=31536000.")
        : check("hsts", "HSTS (always use HTTPS)", 10, "pass", "Browsers remember to always use HTTPS for your site, even if someone types http://."));

  tls.push(certRes);

  const hdrs = headerChecks(headers, httpsOk ? null : "Couldn't be checked because the site didn't load over HTTPS.");

  /* Round 2: things that depend on round 1 (page contents, email provider, file probes). */
  const spfRecord = spfTxt?.find((t) => /^v=spf1(\s|$)/i.test(t.trim()));
  const selectors = DKIM_SELECTORS[emailProvider] || DKIM_SELECTORS.default;
  const [software, lookups, dkimFound, files, hasSecTxt, blocklist] = await Promise.all([
    softwareCheck(ctx, info, headers, htmlRead),
    spfRecord ? spfLookupCount(ctx, spfRecord, txt) : null,
    hasMx || spfRecord ? (async () => {
      for (const sel of selectors) {
        const r = await txt(`${sel}._domainkey.${emailDomain}`);
        if (r?.some((t) => /v=DKIM1|(^|;)\s*p=/i.test(t))) return sel;
      }
      return null;
    })() : null,
    origin
      ? Promise.all(EXPOSED_FILES.map((f) => probeFile(ctx, origin, f).then((hit) => (hit ? f : null)))).then((r) => r.filter(Boolean))
      : null,
    origin ? securityTxt(ctx, origin) : false,
    blocklistCheck(ctx, safeBrowsingKey, finalUrl || `https://${host}/`),
  ]);

  const content = [software, cookiesCheck(httpsOk ? getSetCookies(headers) : []), mixedCheck(info, httpsOk, htmlRead), formsCheck(info, htmlRead), thirdPartyCheck(info, htmlRead)];
  if (!httpsOk) content[1] = check("cookies", "Cookie security", 5, "skip", "Couldn't be checked because the site didn't load over HTTPS.");

  const email = [
    spfCheck(spfTxt, emailDomain, lookups, hasMx),
    dkimCheck(dkimFound, emailProvider),
    dmarcCheck(dmarcTxt, emailDomain),
    mtastsCheck(mtaTxt),
  ];
  if (!hasMx && !spfRecord) email[1] = check("dkim", "DKIM (email signatures)", 8, "skip", `${emailDomain} doesn't appear to send or receive email.`);

  const domain = [...domainRes, dnssecCheck(ds), caaCheck(caa, emailDomain)];
  if (blocklist) domain.unshift(blocklist);

  const exposedFiles = [];
  if (files) {
    exposedFiles.push(files.length
      ? check("exposed", "Sensitive files exposed", 15, "fail",
          `Anyone can download ${files.map((f) => `${f.path} (${f.risk})`).join("; ")}.`,
          "Remove these files from your web server or block access to them today. Then change any passwords or keys they contained, and assume they have already been copied.")
      : check("exposed", "Sensitive files exposed", 15, "pass",
          `None of the ${EXPOSED_FILES.length} files most often left exposed by mistake (like .env, .git and config backups) are publicly reachable.`));
    exposedFiles[0].found = files.map((f) => f.path);
    exposedFiles.push(hasSecTxt
      ? check("securitytxt", "security.txt contact", 0, "info", "You publish a security.txt file, so researchers know how to report problems to you.")
      : check("securitytxt", "security.txt contact", 0, "info", "Optional: you don't publish a security.txt file telling researchers how to report problems.",
          "Add /.well-known/security.txt with a Contact: line (see securitytxt.org)."));
  } else {
    exposedFiles.push(check("exposed", "Sensitive files exposed", 15, "skip", "Couldn't be checked because the site didn't load over HTTPS."));
  }

  const sections = [
    { id: "https", title: "HTTPS & encryption", checks: tls },
    { id: "headers", title: "Browser security headers", checks: hdrs },
    { id: "content", title: "Software & page content", checks: content },
    { id: "email", title: `Email protection for ${emailDomain}`, checks: email },
    { id: "domain", title: `Domain & DNS for ${emailDomain}`, checks: domain },
    { id: "files", title: "Exposed files", checks: exposedFiles },
  ];
  const all = sections.flatMap((s) => s.checks);
  enrich(all, platform, { emailProvider, emailDomain });

  /* Score */
  const max = all.reduce((s, c) => s + c.max, 0);
  let score = max ? Math.round((all.reduce((s, c) => s + c.points, 0) / max) * 100) : 0;
  const exposed = exposedFiles[0]?.status === "fail";
  const listed = blocklist?.status === "fail";
  if (exposed || listed) score = Math.min(score, 40); // these outweigh everything else
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  const count = (s) => all.filter((c) => c.status === s).length;
  const ind = Object.hasOwn(INDUSTRIES, industry) ? { id: industry, label: INDUSTRIES[industry].label, note: INDUSTRIES[industry].note } : null;

  return {
    version: 2,
    domain: host,
    checkedUrl: finalUrl,
    emailDomain,
    scannedAt: new Date().toISOString(),
    score,
    grade,
    summary: { pass: count("pass"), warn: count("warn"), fail: count("fail") },
    headline: listed ? "Urgent: your site is on a malware or phishing blocklist."
      : exposed ? "Urgent: sensitive files are publicly exposed."
      : grade === "A" ? "Strong public security setup." : grade === "B" ? "Good, with a few gaps to close." : "Several important protections are missing.",
    platform: { label: platform.label, cms: platform.cms, cdn: platform.cdn },
    emailProvider: { google: "Google Workspace", microsoft: "Microsoft 365", zoho: "Zoho Mail", proton: "Proton Mail", godaddy: "GoDaddy email" }[emailProvider] || null,
    industry: ind,
    priorities: priorities(all, industry),
    sections,
    requests: ctx.subrequests,
    disclaimer: "This free check only looks at public information, the same way a browser or email provider does, plus public records (domain registration, certificate logs and vulnerability databases). It can't see inside your site, logins, plugins or server, so it isn't a full security audit.",
  };
}
