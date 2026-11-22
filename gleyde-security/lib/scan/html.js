/* Reads the home page's HTML (already downloaded, capped) and extracts facts.
   Pure string analysis: nothing here makes network requests or runs page code. */

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
};

/* JavaScript libraries we can map to the OSV vulnerability database (npm ecosystem). */
const LIB_PATTERNS = [
  // CDN layouts: cdnjs /ajax/libs/<name>/<ver>/, jsdelivr/unpkg <name>@<ver>
  { re: /\/ajax\/libs\/(jquery|jqueryui|twitter-bootstrap|bootstrap|lodash\.js|moment\.js|angular\.js|vue|handlebars\.js|dompurify)\/(\d+\.\d+\.\d+)\//i, nameGroup: 1, verGroup: 2 },
  { re: /\/(?:npm\/)?(jquery|jquery-ui|bootstrap|lodash|moment|angular|vue|handlebars|dompurify)@(\d+\.\d+\.\d+)/i, nameGroup: 1, verGroup: 2 },
  // Versioned file names: jquery-3.5.1.min.js, jquery.min.js?ver=3.7.1 (WordPress)
  { re: /\/(jquery-ui|jquery)[.-](\d+\.\d+\.\d+)(?:\.min)?\.js/i, nameGroup: 1, verGroup: 2 },
  { re: /\/(jquery|jquery-migrate)(?:\.min)?\.js\?ver=(\d+\.\d+\.\d+)/i, nameGroup: 1, verGroup: 2 },
  { re: /\/(bootstrap)(?:\.bundle)?(?:\.min)?\.js\?ver=(\d+\.\d+\.\d+)/i, nameGroup: 1, verGroup: 2 },
  { re: /\/(angular)[.-](1\.\d+\.\d+)(?:\.min)?\.js/i, nameGroup: 1, verGroup: 2 },
];
const NPM_NAME = {
  jqueryui: "jquery-ui", "twitter-bootstrap": "bootstrap", "lodash.js": "lodash", "moment.js": "moment",
  "angular.js": "angular", "handlebars.js": "handlebars",
};

export function analyzeHtml(html, pageUrl) {
  const page = new URL(pageUrl);
  const out = {
    generator: null,
    wpVersion: null,
    hints: new Set(),
    libs: [],
    mixed: [],
    insecureForms: 0,
    passwordField: false,
    externalScripts: [],
  };
  if (!html) return out;
  const text = html.slice(0, 300_000);

  const gen = /<meta[^>]+name\s*=\s*["']generator["'][^>]*>/i.exec(text);
  if (gen) out.generator = (attr(gen[0], "content") || "").slice(0, 80);
  const wp = /WordPress\s+(\d+\.\d+(?:\.\d+)?)/i.exec(out.generator || "") ||
    /\/wp-includes\/[^"'?]+\?ver=(\d+\.\d+(?:\.\d+)?)/i.exec(text);
  if (wp) out.wpVersion = wp[1];

  if (/\/wp-content\/|\/wp-includes\//i.test(text) || /wordpress/i.test(out.generator || "")) out.hints.add("wordpress");
  if (/static\.wixstatic\.com|wix-bolt|_wixCssImports|X-Wix/i.test(text)) out.hints.add("wix");
  if (/static1\.squarespace\.com|squarespace-cdn\.com|Static\.SQUARESPACE_CONTEXT/i.test(text)) out.hints.add("squarespace");
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(text)) out.hints.add("shopify");
  if (/data-wf-site|webflow\.js|assets\.website-files\.com/i.test(text)) out.hints.add("webflow");
  if (/img1\.wsimg\.com|godaddy/i.test(text)) out.hints.add("godaddy");
  if (/Joomla/i.test(out.generator || "") || /\/media\/jui\//i.test(text)) out.hints.add("joomla");
  if (/Drupal/i.test(out.generator || "") || /\/sites\/default\/files\//i.test(text)) out.hints.add("drupal");
  if (/Ghost\s\d/i.test(out.generator || "")) out.hints.add("ghost");

  const seenLib = new Set();
  const seenHost = new Map();
  for (const m of text.matchAll(/<(script|img|iframe|link|source|video|audio|embed)\b[^>]*>/gi)) {
    const tag = m[0];
    const kind = m[1].toLowerCase();
    let src = attr(tag, kind === "link" ? "href" : "src");
    if (!src) continue;
    if (kind === "link" && !/stylesheet|preload|modulepreload/i.test(attr(tag, "rel") || "")) continue;
    let u;
    try {
      u = new URL(src, page);
    } catch {
      continue;
    }
    if (page.protocol === "https:" && u.protocol === "http:" && out.mixed.length < 5) out.mixed.push(u.href.slice(0, 120));

    if (kind === "script") {
      for (const p of LIB_PATTERNS) {
        const lm = p.re.exec(u.pathname + u.search);
        if (!lm) continue;
        const raw = lm[p.nameGroup].toLowerCase();
        const name = NPM_NAME[raw] || raw;
        const version = lm[p.verGroup];
        const key = `${name}@${version}`;
        if (!seenLib.has(key) && out.libs.length < 8) {
          seenLib.add(key);
          out.libs.push({ name, version });
        }
        break;
      }
      if (u.host !== page.host && (u.protocol === "https:" || u.protocol === "http:")) {
        const prev = seenHost.get(u.host) || { host: u.host, count: 0, withoutSri: 0 };
        prev.count++;
        if (!attr(tag, "integrity")) prev.withoutSri++;
        seenHost.set(u.host, prev);
      }
    }
  }
  out.externalScripts = [...seenHost.values()].slice(0, 12);

  for (const m of text.matchAll(/<form\b[^>]*>/gi)) {
    const action = attr(m[0], "action");
    if (action && /^http:\/\//i.test(action.trim())) out.insecureForms++;
  }
  out.passwordField = /<input\b[^>]*type\s*=\s*["']?password/i.test(text);
  return out;
}

/* Combines headers and HTML hints into one platform description. */
export function detectPlatform(headers, info) {
  const h = (n) => (headers?.get(n) || "").toLowerCase();
  const server = h("server");
  let cms = null;
  const order = ["wix", "squarespace", "shopify", "webflow", "godaddy", "wordpress", "joomla", "drupal", "ghost"];
  if (h("x-wix-request-id") || server.includes("pepyaka")) cms = "wix";
  else if (server.includes("squarespace")) cms = "squarespace";
  else if (h("x-shopid") || h("x-shopify-stage")) cms = "shopify";
  else if (/drupal/.test(h("x-generator")) || h("x-drupal-cache")) cms = "drupal";
  else cms = order.find((c) => info.hints.has(c)) || null;

  const cdn = h("cf-ray") || server === "cloudflare" ? "cloudflare"
    : h("x-vercel-id") ? "vercel" : h("x-nf-request-id") ? "netlify" : null;
  const web = /nginx/.test(server) ? "nginx" : /apache/.test(server) ? "apache" : /litespeed/.test(server) ? "litespeed"
    : /microsoft-iis/.test(server) ? "iis" : null;

  const NAMES = {
    wordpress: "WordPress", wix: "Wix", squarespace: "Squarespace", shopify: "Shopify", webflow: "Webflow",
    godaddy: "GoDaddy Website Builder", joomla: "Joomla", drupal: "Drupal", ghost: "Ghost",
    cloudflare: "Cloudflare", vercel: "Vercel", netlify: "Netlify", nginx: "nginx", apache: "Apache", litespeed: "LiteSpeed", iis: "IIS",
  };
  const parts = [cms && NAMES[cms], cdn && `on ${NAMES[cdn]}`].filter(Boolean);
  if (!cms && web) parts.unshift(`${NAMES[web]} server`);
  return { cms, cdn, web, label: parts.join(" ") || null };
}
