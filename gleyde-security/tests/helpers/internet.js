/* A simulated internet for scanner tests: DNS-over-HTTPS answers, websites and the fixed
   public APIs come from tables, and every outgoing request is recorded. */
export const net = { dns: {}, sites: {}, apis: {}, requests: [] };

const API_HOSTS = new Set(["api.osv.dev", "api.wordpress.org", "rdap.org", "api.certspotter.com", "safebrowsing.googleapis.com"]);
const TYPES = { A: 1, AAAA: 28, TXT: 16, MX: 15, DS: 43, CAA: 257 };

export const GOOD_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=()",
  Server: "cloudflare",
};

export function installInternet() {
  net.dns = {};
  net.sites = {};
  net.apis = {};
  net.requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === "cloudflare-dns.com") {
      const name = url.searchParams.get("name");
      const type = url.searchParams.get("type");
      net.requests.push({ dns: `${type} ${name}` });
      const rec = net.dns[name];
      const Answer = (rec?.[type] || []).map((data) => ({ name, type: TYPES[type], data: type === "TXT" ? `"${data}"` : data }));
      return Response.json({ Status: rec ? 0 : 3, Answer });
    }
    if (API_HOSTS.has(url.hostname)) {
      net.requests.push({ api: url.hostname, url: null, method: init.method || "GET", body: init.body, href: url.href });
      const fake = net.apis[url.hostname];
      return typeof fake === "function" ? fake(url, init) : new Response("unavailable", { status: 503 });
    }
    net.requests.push({ method: init.method || "GET", url: url.href, redirect: init.redirect });
    const s = net.sites[url.origin + url.pathname];
    if (typeof s === "function") return s(init.signal);
    if (!s) return new Response("<!doctype html><title>Not found</title>", { status: 404, headers: { "Content-Type": "text/html" } });
    return new Response(s.body ?? "<!doctype html><html><body>ok</body></html>", { status: s.status ?? 200, headers: s.headers ?? { "Content-Type": "text/html" } });
  };
}

export function publicSite(host, o = {}) {
  const {
    headers = GOOD_HEADERS, body, ip = "93.184.216.34", spf = "v=spf1 include:_spf.google.com ~all", dmarc = "v=DMARC1; p=reject",
    mx = "1 aspmx.l.google.com.", dkim = true, ds = true,
  } = o;
  const apex = host.split(".").slice(-2).join(".");
  net.dns[host] = { ...(net.dns[host] || {}), A: [ip], AAAA: [] };
  net.dns[apex] = { A: [ip], ...(net.dns[apex] || {}), TXT: spf ? [spf] : [], MX: mx ? [mx] : [], DS: ds ? ["2371 13 2 ABCDEF"] : [] };
  net.dns[`_dmarc.${apex}`] = { TXT: dmarc ? [dmarc] : [] };
  if (dkim) net.dns[`google._domainkey.${apex}`] = { TXT: ["v=DKIM1; k=rsa; p=MIIBIjANBg"] };
  net.sites[`https://${host}/`] = { headers, body };
  net.sites[`http://${host}/`] = { status: 301, headers: { Location: `https://${host}/` } };
}

const iso = (days) => new Date(Date.now() + days * 864e5).toISOString();
export function healthyApis({ certDays = 60, domainDays = 300, locked = true } = {}) {
  net.apis["rdap.org"] = () => Response.json({
    objectClassName: "domain",
    events: [{ eventAction: "expiration", eventDate: iso(domainDays) }],
    status: locked ? ["client transfer prohibited"] : ["active"],
  });
  net.apis["api.certspotter.com"] = (url) => Response.json([
    { dns_names: [new URL(url).searchParams.get("domain")], not_after: iso(certDays) },
  ]);
  net.apis["api.wordpress.org"] = () => Response.json({ offers: [{ current: "6.8.1" }] });
  net.apis["api.osv.dev"] = (_u, init) => {
    const q = JSON.parse(init.body).queries;
    return Response.json({ results: q.map((x) => (x.package.name === "jquery" && x.version.startsWith("1.") ? { vulns: [{ id: "GHSA-1" }, { id: "GHSA-2" }] } : {})) });
  };
}

export const checksById = (r) => Object.fromEntries(r.sections.flatMap((s) => s.checks).map((c) => [c.id, c]));
export const targetUrls = () => net.requests.filter((r) => r.url).map((r) => r.url);
