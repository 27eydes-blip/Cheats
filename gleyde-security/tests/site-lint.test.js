/* Fast, offline checks of the published files (no server, no browser).
   They guard the security rules and basic quality of every page so a design change
   can't quietly loosen them. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(SITE, "public");
const read = (p) => readFileSync(p, "utf8");
const pages = readdirSync(PUB).filter((f) => f.endsWith(".html"));
const html = Object.fromEntries(pages.map((f) => [f, read(path.join(PUB, f))]));
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

describe("Source files are well-formed", () => {
  const sources = [...walk(PUB), ...walk(path.join(SITE, "functions")), ...walk(path.join(SITE, "lib"))]
    .filter((f) => /\.(html|css|js|mjs|txt|xml)$|_headers$/.test(f));

  test("no leftover merge-conflict markers anywhere", () => {
    for (const f of sources) assert.ok(!/^(<{7}|>{7}|={7})( |$)/m.test(read(f)), path.relative(SITE, f));
  });

  test("every stylesheet has balanced braces (one missing brace silently drops all later rules)", () => {
    for (const f of sources.filter((x) => x.endsWith(".css"))) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "");
      let depth = 0;
      for (const ch of css) {
        if (ch === "{") depth++;
        if (ch === "}") depth--;
        assert.ok(depth >= 0, `${path.relative(SITE, f)}: extra closing brace`);
      }
      assert.equal(depth, 0, `${path.relative(SITE, f)}: ${depth} unclosed block(s)`);
    }
  });
});

describe("Security rules in the markup (what the CSP relies on)", () => {
  for (const [f, src] of Object.entries(html)) {
    test(`${f}: no inline scripts, inline styles or inline event handlers`, () => {
      const scripts = [...src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
      for (const [, attrs, body] of scripts) {
        assert.match(attrs, /\bsrc=/, "every <script> must load a file");
        assert.equal(body.trim(), "", "no code inside <script> tags");
      }
      assert.ok(!/\sstyle\s*=/i.test(src), "no style= attributes");
      assert.ok(!/<[a-z][^>]*\son[a-z]+\s*=/i.test(src), "no onclick=/onload= style handlers");
    });

    test(`${f}: CSS/JS links carry an up-to-date content fingerprint (cache busting)`, () => {
      // /assets is cached for a day; without a fresh ?v= a returning visitor can get new
      // HTML with an old stylesheet. Re-run the page generator after editing CSS or JS.
      const links = [...src.matchAll(/(?:href|src)="(\/assets\/(?:css|js)\/[^"]+)"/g)].map((m) => m[1]);
      assert.ok(links.length > 0);
      for (const link of links) {
        const [file, v] = link.split("?v=");
        const want = createHash("sha256").update(readFileSync(path.join(PUB, file))).digest("hex").slice(0, 10);
        assert.equal(v, want, `${link} should be ${file}?v=${want}`);
      }
    });

    test(`${f}: canonical address is on gleyde.com (none on the 404 page)`, () => {
      const canon = [...src.matchAll(/<link rel="canonical" href="([^"]+)">/g)].map((m) => m[1]);
      if (f === "404.html") return assert.equal(canon.length, 0);
      const pagePath = f === "index.html" ? "/" : `/${f.replace(/\.html$/, "")}`;
      assert.deepEqual(canon, [`https://gleyde.com${pagePath}`]);
    });

    test(`${f}: only allowed outside resources are loaded`, () => {
      const loads = [
        ...[...src.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]),
        // rel="canonical" only names the page's official address; the browser loads nothing from it.
        ...[...src.matchAll(/<link(?![^>]*rel="canonical")[^>]+href="([^"]+)"/gi)].map((m) => m[1]),
        ...[...src.matchAll(/<(?:img|source|iframe|video|audio|embed|object)[^>]+(?:src|srcset|data)="([^"]+)"/gi)].map((m) => m[1]),
      ];
      for (const u of loads) {
        if (/^https?:\/\//i.test(u)) assert.match(u, /^https:\/\/challenges\.cloudflare\.com\//, `outside resource: ${u}`);
        else assert.ok(u.startsWith("/"), `relative or local only: ${u}`);
      }
    });
  }

  test("stylesheets and scripts load nothing from outside the site", () => {
    for (const f of walk(path.join(PUB, "assets")).filter((x) => /\.(css|js)$/.test(x))) {
      const src = read(f);
      for (const m of src.matchAll(/url\(\s*['"]?([^'")]+)/g)) assert.ok(!/^https?:/i.test(m[1]) || m[1].startsWith("data:"), `${path.relative(PUB, f)}: ${m[1]}`);
      const fetches = [...src.matchAll(/fetch\(\s*["'`]([^"'`]+)/g)].map((m) => m[1]);
      for (const u of fetches) assert.ok(u.startsWith("/"), `${path.relative(PUB, f)} fetches ${u}`);
    }
  });

  test("_headers keeps every required security header, with no weakening", () => {
    const h = read(path.join(PUB, "_headers"));
    const csp = (h.match(/Content-Security-Policy: (.+)/) || [])[1] || "";
    for (const d of ["default-src 'self'", "script-src 'self' https://challenges.cloudflare.com", "style-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
      assert.ok(csp.includes(d), `CSP missing: ${d}`);
    }
    assert.ok(!/unsafe-inline|unsafe-eval|\*/.test(csp), "CSP must not allow inline/eval/wildcards");
    assert.match(h, /Strict-Transport-Security: max-age=(\d{8,})/);
    assert.match(h, /X-Frame-Options: DENY/);
    assert.match(h, /X-Content-Type-Options: nosniff/);
    assert.match(h, /Referrer-Policy: strict-origin-when-cross-origin/);
    assert.match(h, /Permissions-Policy: .*camera=\(\)/);
  });
});

describe("Page quality", () => {
  const titles = new Map();
  const descs = new Map();
  for (const [f, src] of Object.entries(html)) {
    test(`${f}: one h1, language, viewport, title and description`, () => {
      assert.equal((src.match(/<h1\b/gi) || []).length, 1, "exactly one <h1>");
      assert.match(src, /<html lang="en"/);
      assert.match(src, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
      const title = (src.match(/<title>([^<]+)<\/title>/) || [])[1];
      assert.ok(title && title.length <= 75, `title: ${title}`);
      const desc = (src.match(/<meta name="description" content="([^"]+)"/) || [])[1];
      assert.ok(desc && desc.length >= 15 && desc.length <= 170, `description length ${desc?.length}`);
      if (f !== "404.html") {
        assert.ok(!titles.has(title), `title duplicates ${titles.get(title)}`);
        assert.ok(!descs.has(desc), `description duplicates ${descs.get(desc)}`);
        titles.set(title, f);
        descs.set(desc, f);
      }
    });

    test(`${f}: images have alt text and fixed dimensions`, () => {
      for (const m of src.matchAll(/<img\b[^>]*>/gi)) {
        assert.match(m[0], /\salt="/, `missing alt: ${m[0]}`);
        assert.match(m[0], /\swidth="\d+"/, `missing width: ${m[0]}`);
        assert.match(m[0], /\sheight="\d+"/, `missing height: ${m[0]}`);
      }
    });

    test(`${f}: every form field has a label`, () => {
      for (const m of src.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
        const attrs = m[2];
        if (/type="(hidden|submit)"/.test(attrs)) continue;
        if (/aria-hidden|tabindex="-1"/.test(attrs) && /company_fax/.test(attrs)) continue; // honeypot
        const id = (attrs.match(/\sid="([^"]+)"/) || [])[1];
        assert.ok(id && new RegExp(`<label[^>]+for="${id}"`).test(src), `no <label for> for ${m[0]}`);
      }
    });
  }

  test("internal links all point to real pages and real anchors", () => {
    const exists = (p) => {
      const clean = p.split("?")[0];
      if (clean === "/") return "index.html";
      for (const cand of [clean, `${clean}.html`, `${clean}/index.html`]) {
        const fp = path.join(PUB, cand);
        if (existsSync(fp) && statSync(fp).isFile()) return path.relative(PUB, fp);
      }
      return null;
    };
    for (const [f, src] of Object.entries(html)) {
      for (const [, href] of src.matchAll(/<a\b[^>]*href="([^"]+)"/gi)) {
        if (/^(https?:|mailto:|tel:)/.test(href)) continue;
        const [p, anchor] = href.split("#");
        const target = p ? exists(p) : f;
        assert.ok(target, `${f}: broken link ${href}`);
        if (anchor && target.endsWith(".html")) {
          assert.ok(new RegExp(`id="${anchor}"`).test(html[target] || read(path.join(PUB, target))), `${f}: missing #${anchor} on ${target}`);
        }
      }
    }
  });

  test("navigation menu is identical on every page", () => {
    const nav = (src) => [...(src.match(/<ul class="nav-menu"[\s\S]*?<\/ul>/) || [""])[0].matchAll(/href="([^"]+)"[^>]*>([^<]+)/g)].map((m) => `${m[1]} ${m[2].trim()}`);
    const ref = nav(html["index.html"]);
    assert.ok(ref.length >= 5);
    for (const [f, src] of Object.entries(html)) assert.deepEqual(nav(src), ref, f);
  });

  test("sitemap lists every public page, and nothing that doesn't exist", () => {
    const sm = read(path.join(PUB, "sitemap.xml"));
    const listed = new Set([...sm.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]));
    const pagesPaths = pages.filter((f) => f !== "404.html").map((f) => (f === "index.html" ? "/" : `/${f.replace(/\.html$/, "")}`));
    for (const p of pagesPaths) assert.ok(listed.has(p), `sitemap missing ${p}`);
    for (const p of listed) assert.ok(pagesPaths.includes(p), `sitemap lists ${p}, which doesn't exist`);
  });

  test("page weight budget: each page's own files stay under 300 KB", () => {
    for (const [f, src] of Object.entries(html)) {
      const assets = [...src.matchAll(/(?:src|href)="(\/assets\/[^"#?]+)"/g)].map((m) => m[1]);
      const css = read(path.join(PUB, "assets/css/site.css"));
      const fonts = [...css.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)].map((m) => `/assets/fonts/${m[1]}`);
      const files = new Set([...assets, ...fonts]);
      let bytes = Buffer.byteLength(src);
      for (const a of files) bytes += statSync(path.join(PUB, a)).size;
      assert.ok(bytes < 300 * 1024, `${f}: ${Math.round(bytes / 1024)} KB`);
    }
  });
});
