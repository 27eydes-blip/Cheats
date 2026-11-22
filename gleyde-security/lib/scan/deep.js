/* Owner-verified checks.

   Unlocked only after the visitor proves they control the site, by publishing a code we
   give them either as a DNS TXT record or as a file on the site. The code is an HMAC of
   the domain with a server secret, so no storage is needed and nobody can guess another
   site's code.

   These checks are still read-only GET requests (no logins, no form submissions, no
   payloads). They're reserved for owners because they look for things like login pages
   and user lists, which isn't appropriate to do to someone else's site. */
import { check } from "./checks.js";
import { Ctx, ascii, discard, readPrefix, resolvePublic, safeGet, txtRecords } from "./net.js";

export async function verificationCode(secret, host) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`gleyde-verify:v1:${host}`));
  return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function verificationInstructions(host, code) {
  return {
    dns: { type: "TXT", name: `_gleyde-verify.${host}`, value: `gleyde-verify=${code}` },
    file: { url: `https://${host}/.well-known/gleyde-verify.txt`, contents: code },
  };
}

const timingSafeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

/* Returns "dns", "file" or null. */
export async function checkOwnership(ctx, host, code) {
  const txt = await txtRecords(ctx, `_gleyde-verify.${host}`);
  if (txt?.some((t) => timingSafeEqual(t.trim(), `gleyde-verify=${code}`))) return "dns";
  const r = await safeGet(ctx, new URL(`https://${host}/.well-known/gleyde-verify.txt`));
  if (r.res) {
    try {
      if (r.res.status === 200 && timingSafeEqual(ascii(await readPrefix(r.res, 256)).trim(), code)) return "file";
      discard(r.res);
    } finally {
      r.done();
    }
  }
  return null;
}

async function get(ctx, origin, path, bytes = 4096) {
  const r = await safeGet(ctx, new URL(path, origin));
  if (!r.res) return null;
  try {
    const status = r.res.status;
    const location = r.res.headers.get("location") || "";
    const type = r.res.headers.get("content-type") || "";
    // Read the (capped) body for any non-redirect answer: some tells come with 4xx codes,
    // e.g. WordPress answers GET /xmlrpc.php with 405 and a recognizable message.
    const body = status < 300 || status >= 400 ? ascii(await readPrefix(r.res, bytes)) : (discard(r.res), "");
    return { status, location, type, body };
  } finally {
    r.done();
  }
}

const LOGIN_PAGES = [
  { path: "/wp-login.php", name: "WordPress login", is: (r) => r.status === 200 && /user_login|wp-submit/i.test(r.body) },
  { path: "/wp-admin/", name: "WordPress admin", is: (r) => r.status >= 300 && r.status < 400 && /wp-login\.php/i.test(r.location) },
  { path: "/administrator/", name: "Joomla admin", is: (r) => r.status === 200 && /joomla|mod-login/i.test(r.body) },
  { path: "/user/login", name: "Drupal login", is: (r) => r.status === 200 && /user-login-form|drupal/i.test(r.body) },
  { path: "/admin/", name: "Admin page", is: (r) => r.status === 200 && /type\s*=\s*["']?password/i.test(r.body) },
  { path: "/login", name: "Login page", is: (r) => r.status === 200 && /type\s*=\s*["']?password/i.test(r.body) },
];

const notHtml = (t) => !/<html|<!doctype/i.test(t);
const DEEP_FILES = [
  { path: "/wp-content/debug.log", risk: "the WordPress debug log (often shows file paths, errors and sometimes data)", match: (t) => notHtml(t) && /PHP (Notice|Warning|Fatal|Deprecated)|Stack trace/i.test(t) },
  { path: "/debug.log", risk: "a debug log", match: (t) => notHtml(t) && /PHP (Notice|Warning|Fatal)|Stack trace|\bERROR\b/.test(t) },
  { path: "/error_log", risk: "a PHP error log", match: (t) => notHtml(t) && /PHP (Notice|Warning|Fatal|Parse error)/i.test(t) },
  { path: "/.env.local", risk: "a local environment file (passwords and keys)", match: (t) => notHtml(t) && /^\s*[A-Z][A-Z0-9_]{2,}\s*=/m.test(t) },
  { path: "/.env.production", risk: "a production environment file (passwords and keys)", match: (t) => notHtml(t) && /^\s*[A-Z][A-Z0-9_]{2,}\s*=/m.test(t) },
  { path: "/.env.backup", risk: "an environment file backup (passwords and keys)", match: (t) => notHtml(t) && /^\s*[A-Z][A-Z0-9_]{2,}\s*=/m.test(t) },
  { path: "/config.php.bak", risk: "a configuration backup", match: (t) => /<\?php|password|DB_/i.test(t) && notHtml(t) },
  { path: "/database.sql", risk: "a database dump", match: (t) => notHtml(t) && /\b(CREATE TABLE|INSERT INTO)\b/i.test(t) },
  { path: "/dump.sql", risk: "a database dump", match: (t) => notHtml(t) && /\b(CREATE TABLE|INSERT INTO)\b/i.test(t) },
  { path: "/.vscode/sftp.json", risk: "editor upload settings that can contain your server password", match: (t) => /"host"\s*:/.test(t) && /"(password|username)"\s*:/.test(t) },
];

export async function runDeepScan(host, { userAgent }) {
  const ctx = new Ctx(userAgent);
  const r0 = await resolvePublic(ctx, host);
  if (!r0.ok) return null;
  const origin = `https://${host}`;

  const [logins, users, xmlrpc, listings, files, readme] = await Promise.all([
    Promise.all(LOGIN_PAGES.map(async (p) => ((r) => (r && p.is(r) ? p : null))(await get(ctx, origin, p.path)))).then((x) => x.filter(Boolean)),
    get(ctx, origin, "/wp-json/wp/v2/users", 16384),
    get(ctx, origin, "/xmlrpc.php", 512),
    Promise.all(["/wp-content/uploads/", "/uploads/", "/images/"].map(async (p) => {
      const r = await get(ctx, origin, p);
      return r && /<title>\s*Index of\s*\//i.test(r.body) ? p : null;
    })).then((x) => x.filter(Boolean)),
    Promise.all(DEEP_FILES.map(async (f) => {
      const r = await get(ctx, origin, f.path);
      return r && r.status === 200 && f.match(r.body) ? f : null;
    })).then((x) => x.filter(Boolean)),
    get(ctx, origin, "/readme.html", 2048),
  ]);

  const checks = [];
  checks.push(logins.length
    ? check("login", "Login pages", 6, "warn",
        `Anyone can reach your ${logins.map((l) => `${l.name} (${l.path})`).join(", ")}. That's normal, but it means bots will try passwords against it all day.`,
        "Make sure every account uses a strong unique password and two-factor login, limit failed attempts (a security plugin or Cloudflare can do this), and if only your team logs in, restrict the page by IP or put it behind Cloudflare Access.")
    : check("login", "Login pages", 6, "pass", "We didn't find a publicly reachable login page at the usual addresses."));

  let userCount = 0;
  try {
    const arr = users?.status === 200 && /json/i.test(users.type) ? JSON.parse(users.body) : null;
    if (Array.isArray(arr)) userCount = arr.filter((u) => u && typeof u.slug === "string").length;
  } catch {
    userCount = 0; // truncated or not JSON
  }
  if (users?.status === 200 && !userCount && /"slug"\s*:/.test(users.body)) userCount = 1;
  checks.push(userCount
    ? check("userenum", "WordPress user list", 8, "fail",
        `Your site publishes a list of ${userCount === 1 ? "at least one" : userCount} user account name(s) at /wp-json/wp/v2/users. Attackers use these names for password-guessing. (We don't show or store the names.)`,
        "Block the users endpoint for visitors who aren't logged in (most security plugins have a switch for this), and make sure no admin's login name matches their public display name.")
    : check("userenum", "WordPress user list", 8, "pass", "Your site doesn't publish a list of user account names."));

  const xmlOn = xmlrpc && (xmlrpc.status === 405 || xmlrpc.status === 200) && /XML-RPC server accepts POST requests only/i.test(xmlrpc.body);
  checks.push(xmlOn
    ? check("xmlrpc", "XML-RPC", 4, "warn",
        "WordPress XML-RPC is switched on. It's rarely needed today, and attackers use it to try thousands of passwords in a single request.",
        "Turn off XML-RPC with a security plugin, or block /xmlrpc.php at your host or in Cloudflare, unless you use the WordPress mobile app or Jetpack.")
    : check("xmlrpc", "XML-RPC", 4, "pass", "WordPress XML-RPC isn't publicly reachable."));

  checks.push(listings.length
    ? check("dirlisting", "Folder listings", 8, "fail",
        `Anyone can browse the file list of ${listings.join(", ")}, which can expose private uploads like contracts or invoices.`,
        "Turn off directory listing (Apache: add \"Options -Indexes\" to .htaccess; nginx: autoindex off;), or add an empty index.html to those folders.")
    : check("dirlisting", "Folder listings", 8, "pass", "We couldn't browse the contents of common upload folders."));

  checks.push(files.length
    ? check("deepfiles", "More exposed files", 12, "fail",
        `Anyone can download ${files.map((f) => `${f.path} (${f.risk})`).join("; ")}. (We only report the file name, never its contents.)`,
        "Delete these files from the web server today, change any passwords or keys they contained, and turn off debug logging on the live site.")
    : check("deepfiles", "More exposed files", 12, "pass", `None of ${DEEP_FILES.length} more sensitive files (logs, environment backups, database dumps, editor settings) are reachable.`));
  checks[checks.length - 1].found = files.map((f) => f.path);

  const readmeOn = readme?.status === 200 && /WordPress/i.test(readme.body);
  checks.push(readmeOn
    ? check("readme", "WordPress readme", 0, "info", "Your WordPress readme.html is public, which tells visitors which software you run.", "Delete readme.html from your site's main folder (it comes back after updates, so a security plugin that blocks it is easier).")
    : check("readme", "WordPress readme", 0, "info", "No public WordPress readme.html found."));

  return { id: "verified", title: "Owner-verified checks", checks, requests: ctx.subrequests };
}
