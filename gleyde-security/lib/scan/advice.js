/* Turns raw check results into advice a business owner can act on:
   impact / effort / who, platform-specific fixes with copy-paste snippets,
   a top-3 priority list, and industry context. Pure functions (no network). */

export const META = {
  exposed: { impact: "critical", effort: "Today", who: "Your web host or developer" },
  https: { impact: "high", effort: "30 minutes", who: "Your web host" },
  software: { impact: "high", effort: "30 minutes", who: "You or your developer" },
  forms: { impact: "high", effort: "1–2 hours", who: "Your developer" },
  certexpiry: { impact: "high", effort: "15 minutes", who: "Your web host" },
  domainexpiry: { impact: "high", effort: "5 minutes", who: "You (at your domain registrar)" },
  blocklist: { impact: "high", effort: "1–2 hours", who: "Your developer" },
  spf: { impact: "high", effort: "15 minutes", who: "Whoever manages your email" },
  dmarc: { impact: "high", effort: "15 minutes", who: "Whoever manages your email" },
  dkim: { impact: "high", effort: "30 minutes", who: "Whoever manages your email" },
  redirect: { impact: "medium", effort: "5 minutes", who: "You or your web host" },
  hsts: { impact: "medium", effort: "5 minutes", who: "Your web host or developer" },
  csp: { impact: "medium", effort: "1–2 hours", who: "Your developer" },
  clickjacking: { impact: "medium", effort: "5 minutes", who: "Your web host or developer" },
  cookies: { impact: "medium", effort: "30 minutes", who: "Your developer" },
  mixed: { impact: "medium", effort: "30 minutes", who: "You or your developer" },
  dnssec: { impact: "medium", effort: "15 minutes", who: "You (at your DNS provider)" },
  registrarlock: { impact: "medium", effort: "5 minutes", who: "You (at your domain registrar)" },
  nosniff: { impact: "low", effort: "5 minutes", who: "Your web host or developer" },
  referrer: { impact: "low", effort: "5 minutes", who: "Your web host or developer" },
  permissions: { impact: "low", effort: "5 minutes", who: "Your web host or developer" },
  disclosure: { impact: "low", effort: "15 minutes", who: "Your web host" },
  thirdparty: { impact: "low", effort: "1 hour", who: "Your developer" },
  caa: { impact: "low", effort: "10 minutes", who: "You (at your DNS provider)" },
  mtasts: { impact: "low", effort: "1 hour", who: "Whoever manages your email" },
  securitytxt: { impact: "low", effort: "10 minutes", who: "You or your developer" },
  // owner-verified checks
  deepfiles: { impact: "critical", effort: "Today", who: "Your web host or developer" },
  dirlisting: { impact: "high", effort: "15 minutes", who: "Your web host or developer" },
  userenum: { impact: "medium", effort: "15 minutes", who: "You or your developer" },
  login: { impact: "medium", effort: "30 minutes", who: "You or your developer" },
  xmlrpc: { impact: "medium", effort: "10 minutes", who: "You or your developer" },
  readme: { impact: "low", effort: "5 minutes", who: "You or your developer" },
};

/* ------------------------------------------------------------ header snippets */
const HEADERS = {
  hsts: ["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
  csp: ["Content-Security-Policy-Report-Only", "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"],
  clickjacking: ["X-Frame-Options", "DENY"],
  nosniff: ["X-Content-Type-Options", "nosniff"],
  referrer: ["Referrer-Policy", "strict-origin-when-cross-origin"],
  permissions: ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
};
const HOSTED_BUILDERS = new Set(["wix", "squarespace", "shopify", "webflow", "godaddy"]);
const BUILDER_NAME = { wix: "Wix", squarespace: "Squarespace", shopify: "Shopify", webflow: "Webflow", godaddy: "GoDaddy's builder" };

function headerSnippets(id, platform) {
  const [name, value] = HEADERS[id];
  const nginx = { label: "nginx (server block)", code: `add_header ${name} "${value}" always;` };
  const apache = { label: "Apache / LiteSpeed (.htaccess)", code: `<IfModule mod_headers.c>\n  Header always set ${name} "${value}"\n</IfModule>` };
  const cf = {
    label: "Cloudflare (Rules → Transform Rules → Modify Response Header)",
    code: `Operation: Set static\nHeader name: ${name}\nValue: ${value}`,
  };
  if (platform.cdn === "cloudflare") return [cf];
  if (platform.web === "nginx") return [nginx];
  if (platform.web === "apache" || platform.web === "litespeed" || platform.cms === "wordpress") return [apache];
  return [cf, nginx, apache];
}

function headerFix(id, platform, base) {
  if (HOSTED_BUILDERS.has(platform.cms)) {
    return {
      fix: `${BUILDER_NAME[platform.cms]} doesn't let you add security headers yourself. The usual fix is to put your domain behind Cloudflare (free) and add the header there with a Transform Rule. We can set this up for you.`,
      snippets: platform.cdn === "cloudflare" ? headerSnippets(id, platform) : [],
    };
  }
  let fix = base;
  if (id === "csp") {
    fix = "Add a Content Security Policy. Start in report-only mode (below) so nothing breaks, check your browser console for a week, then rename the header to Content-Security-Policy.";
    if (platform.cms === "wordpress") fix += " On WordPress, plugins often need extra sources added; a developer should tune it.";
  }
  if (platform.cms === "wordpress" && id !== "csp") {
    fix = `${base} On WordPress you can add it to the .htaccess file in your site's main folder (ask your host if you're unsure), or use a headers plugin.`;
  }
  return { fix, snippets: headerSnippets(id, platform) };
}

/* ------------------------------------------------------------ other fixes */
function otherFix(c, platform, ctx) {
  const builder = HOSTED_BUILDERS.has(platform.cms) ? BUILDER_NAME[platform.cms] : null;
  const cf = platform.cdn === "cloudflare";
  switch (c.id) {
    case "https":
      if (builder) return { fix: `HTTPS is included with ${builder}. Turn on SSL/HTTPS in your site's domain or security settings, and make sure your domain is connected through ${builder}.` };
      if (cf) return { fix: "In Cloudflare, go to SSL/TLS and set the mode to Full (strict). Make sure your web host also has a valid certificate (most offer a free one)." };
      if (platform.cms === "wordpress") return { fix: "Ask your host to turn on their free SSL certificate (often under cPanel → SSL/TLS Status or \"Let's Encrypt\"). Then update the WordPress Address and Site Address under Settings → General to start with https://." };
      return {};
    case "redirect":
      if (cf) return { fix: "In Cloudflare, go to SSL/TLS → Edge Certificates and turn on \"Always Use HTTPS\"." };
      if (builder) return { fix: `In ${builder}, turn on the setting that forces HTTPS / secure connections for your domain.` };
      if (platform.web === "nginx") return { snippets: [{ label: "nginx", code: "server {\n  listen 80;\n  server_name example.com www.example.com;\n  return 301 https://$host$request_uri;\n}" }] };
      return { snippets: [{ label: "Apache / LiteSpeed (.htaccess)", code: "RewriteEngine On\nRewriteCond %{HTTPS} off\nRewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]" }] };
    case "disclosure":
      if (platform.web === "nginx") return { snippets: [{ label: "nginx (http block)", code: "server_tokens off;" }] };
      return {
        fix: `${c.fix} Many shared hosts control this; ask them to hide the Server version and set expose_php = Off.`,
        snippets: [{ label: "php.ini", code: "expose_php = Off" }, { label: "Apache (main config, not .htaccess)", code: "ServerTokens Prod\nServerSignature Off" }],
      };
    case "software":
      if (platform.cms === "wordpress") {
        return { fix: "In WordPress, go to Dashboard → Updates and update WordPress, then all plugins and themes. Turn on automatic updates for plugins you trust, and delete plugins and themes you don't use. Take a backup first." };
      }
      return {};
    case "cookies":
      return {
        snippets: [
          { label: "Cookie attributes to use", code: "Set-Cookie: <name>=<value>; Path=/; Secure; HttpOnly; SameSite=Lax" },
          { label: "PHP (php.ini)", code: "session.cookie_secure = 1\nsession.cookie_httponly = 1\nsession.cookie_samesite = \"Lax\"" },
        ],
      };
    case "mixed":
      if (platform.cms === "wordpress") return { fix: "Update the old http:// links to https://. On WordPress, a search-and-replace plugin (back up first) or an SSL plugin can do this across your whole site." };
      return {};
    case "spf":
    case "dmarc":
    case "dkim":
      return emailFix(c, ctx.emailProvider, ctx.emailDomain);
    case "dnssec":
      if (cf) return { fix: "If your DNS is on Cloudflare: DNS → Settings → Enable DNSSEC, then add the DS record it shows you at your domain registrar (Cloudflare does this automatically if it's also your registrar)." };
      return {};
    case "caa":
      return { snippets: [{ label: "DNS record (adjust to the certificate authority your host uses)", code: `${ctx.emailDomain}.  CAA  0 issue "letsencrypt.org"` }] };
    case "securitytxt":
      return { snippets: [{ label: "/.well-known/security.txt", code: `Contact: mailto:security@${ctx.emailDomain}\nExpires: ${new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)}T00:00:00.000Z` }] };
    default:
      return {};
  }
}

function emailFix(c, provider, domain) {
  const g = provider === "google";
  const m = provider === "microsoft";
  if (c.id === "spf" && (g || m)) {
    const inc = g ? "include:_spf.google.com" : "include:spf.protection.outlook.com";
    return {
      fix: `${c.fix} Your email is hosted by ${g ? "Google Workspace" : "Microsoft 365"}, so the record should include ${inc} (plus any other services that send email as you, like your CRM or newsletter).`,
      snippets: [{ label: `TXT record at ${domain}`, code: `v=spf1 ${inc} ~all` }],
    };
  }
  if (c.id === "dkim" && g) return { fix: "In the Google Admin console: Apps → Google Workspace → Gmail → Authenticate email. Generate a DKIM key, add the TXT record it gives you, then click Start authentication." };
  if (c.id === "dkim" && m) return { fix: "In Microsoft Defender (security.microsoft.com): Email & collaboration → Policies → Email authentication settings → DKIM. Select your domain, add the two CNAME records it shows, then enable signing." };
  if (c.id === "dmarc") {
    return { snippets: [{ label: `TXT record at _dmarc.${domain}`, code: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; adkim=s; aspf=s` }] };
  }
  return {};
}

/* Adds impact/effort/who and platform-specific fixes to every check. */
export function enrich(checks, platform, ctx) {
  for (const c of checks) {
    Object.assign(c, META[c.id] || { impact: "low", effort: "", who: "" });
    if (c.status === "pass" || c.status === "skip") continue;
    const extra = HEADERS[c.id] ? headerFix(c.id, platform, c.fix) : otherFix(c, platform, ctx);
    if (extra.fix) c.fix = extra.fix;
    if (extra.snippets?.length) c.snippets = extra.snippets;
  }
  return checks;
}

/* ------------------------------------------------------------ industry */
export const INDUSTRIES = {
  realestate: {
    label: "Real estate",
    boost: ["dmarc", "spf", "dkim"],
    note: "Real estate is a top target for wire-fraud email scams: criminals pose as an agent or title company to redirect closing funds. Strong SPF, DKIM and DMARC (set to p=reject) make it much harder for anyone to send convincing fake emails in your name, which protects your clients and your reputation.",
  },
  lending: {
    label: "Lending / mortgage / finance",
    boost: ["forms", "https", "cookies", "software"],
    note: "Lenders, mortgage brokers and many other financial businesses are likely covered by the FTC Safeguards Rule (Gramm-Leach-Bliley Act). It requires a written security program, encryption of customer information, multi-factor authentication and regular testing. This free check covers only a small public slice of that; confirm your obligations with your compliance advisor.",
  },
  legal: {
    label: "Legal",
    boost: ["dmarc", "spf", "dkim", "forms"],
    note: "Law firms hold confidential client information, and professional rules generally expect reasonable efforts to protect it. Spoofed emails and leaky intake forms are the most common public weak spots.",
  },
  healthcare: {
    label: "Healthcare",
    boost: ["forms", "https", "thirdparty"],
    note: "If your website collects health information (even through a contact or booking form), HIPAA may apply. Make sure forms are encrypted and that tracking or form vendors will sign a Business Associate Agreement. Confirm with your compliance advisor.",
  },
  homeservices: {
    label: "Home & local services",
    boost: ["dmarc", "spf", "forms"],
    note: "Service businesses are often impersonated with fake invoices and payment requests. Email protection (SPF, DKIM, DMARC) and secure booking forms are the most valuable fixes for you.",
  },
  retail: {
    label: "Retail / e-commerce",
    boost: ["software", "thirdparty", "forms"],
    note: "If you take card payments, PCI DSS applies. Outdated software and third-party scripts are how card-skimming code usually gets onto small online stores.",
  },
};

const IMPACT_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };

/* Picks the three fixes that matter most for this business. */
export function priorities(checks, industry) {
  const boost = new Set((Object.hasOwn(INDUSTRIES, industry) && INDUSTRIES[industry].boost) || []);
  return checks
    .filter((c) => c.status === "fail" || c.status === "warn")
    .map((c) => ({
      c,
      rank: (IMPACT_WEIGHT[c.impact] || 1) + (boost.has(c.id) ? 1 : 0) + (c.status === "fail" ? 0.5 : 0) + (c.id === "exposed" || c.id === "deepfiles" ? 10 : 0),
    }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 3)
    .map(({ c }) => ({ id: c.id, title: c.title, why: c.detail, effort: c.effort, who: c.who, impact: c.impact }));
}

/* Applies (or re-applies) industry context to a finished report, e.g. one served from cache. */
export function applyIndustry(report, industry) {
  const all = report.sections.flatMap((s) => s.checks);
  report.industry = Object.hasOwn(INDUSTRIES, industry) ? { id: industry, label: INDUSTRIES[industry].label, note: INDUSTRIES[industry].note } : null;
  report.priorities = priorities(all, industry);
  return report;
}
