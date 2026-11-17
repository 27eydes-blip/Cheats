# Gleyde Technologies — Cybersecurity & Software website

A static, fast, mobile-first site with one serverless function for the contact form, built for **Cloudflare Pages**. There's no framework and no build step, and every font and script is self-hosted. The only third party is Cloudflare Turnstile on the contact page.

```
public/                 The website (deployed as-is)
  index.html            Home
  services.html         Services & pricing      ← prices live here
  how-it-works.html     4-step process
  about.html            Story & team            ← story/bios live here
  contact.html          Contact form
  security-check.html   Free Website Security Check tool
  404.html
  _headers              Security headers for all pages
  .well-known/security.txt
  assets/css|js|fonts|img
functions/api/
  contact.js            POST /api/contact  (validation, spam, rate limit, email)
  scan.js               POST /api/scan     (free passive security check)
  config.js             GET  /api/config   (public Turnstile site key)
lib/
  http.js               Security headers, origin check, capped body reading
  ip.js                 Public/private IP classification (SSRF guard), rate-limit keys
  ratelimit.js          In-memory + KV rate limiter
  turnstile.js          Server-side Turnstile verification
  scanner.js            The passive checks, scoring and plain-English fixes
tests/                  `npm test`
docs/                   Pricing one-pager, authorization template, launch checklist
```

## Editing content

Search the project for **`TODO-EDIT`** to find every placeholder:

| What | Where |
|---|---|
| Starting prices | `public/services.html` (4 places) and `docs/services-pricing-summary.html` |
| Company story, team bios | `public/about.html` |
| Fallback email in the no-JavaScript notice | `public/contact.html` |
| Domain | `public/robots.txt`, `public/sitemap.xml`, `public/.well-known/security.txt` |

Header and footer are repeated in each page. If you change the menu, change it in all six HTML files.

## Run locally

```bash
npm install
cp .dev.vars.example .dev.vars     # test keys: Turnstile always passes
npm run dev                         # http://localhost:8788
npm test                            # validation, attack suites, scanner/SSRF, advice, verification, secret scan
npm run test:e2e                    # with dev running: headers, exposed files, browser XSS (needs Playwright)
```

See `docs/pentest-report.md` for what the attack suite covers and the results.

Add `--kv RATE_LIMIT_KV` to the dev command to exercise rate limiting locally.

## Environment variables (all secrets stay here, never in code)

Set these in **Cloudflare dashboard → Workers & Pages → your project → Settings → Variables and Secrets** (Production *and* Preview). Use the **Secret** type for everything with "KEY" in the name.

| Name | Secret? | Purpose |
|---|---|---|
| `TURNSTILE_SITE_KEY` | no (public) | Turnstile widget key |
| `TURNSTILE_SECRET_KEY` | **yes** | Server-side Turnstile verification |
| `RESEND_API_KEY` | **yes** | Sends form emails via [Resend](https://resend.com) |
| `CONTACT_TO_EMAIL` | no | Where inquiries go (comma-separate several) |
| `CONTACT_FROM_EMAIL` | no | e.g. `Gleyde Website <website@yourdomain.com>` (domain must be verified in Resend) |
| `RATE_LIMIT_SALT` | **yes** | Long random string; IPs are hashed with it, never stored raw |
| `ALLOWED_ORIGINS` | no | Optional extra origins, e.g. `https://yourdomain.com` if `www` is primary |

`.dev.vars` is git-ignored. If a key is ever committed, **rotate it immediately**. Deleting the commit is not enough.

## How the site practises what we sell

- **Security headers** (`public/_headers`, `lib/http.js`): strict CSP with no inline scripts or styles, so any injected script is blocked. Also HSTS (2 years + preload), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP.
- **Contact form** (`functions/api/contact.js`):
  - The same-origin check blocks cross-site posts. The size limit is 16 KB. Only JSON and form-encoded bodies are accepted.
  - Server-side validation and normalization of every field, with control and bidi characters stripped.
  - A honeypot field and a minimum fill time quietly drop simple bots.
  - Cloudflare Turnstile is verified on the server with the secret key.
  - Every post counts toward a limit of 5 per hour per IP, or per /64 network for IPv6 (IPs are salted and hashed). An in-memory counter catches parallel bursts, and KV covers the rest. Back it with the WAF rule below.
  - The body is read as a stream and cut off at 16 KB. Fields must be plain strings.
  - Turnstile tokens are checked against this site's hostname and the form's action.
  - The email is plain text with a fixed subject. User input never goes into email headers, and only a validated address is used for `reply_to`.
  - Errors are generic to the visitor; the details go to Cloudflare logs.
- **No third-party trackers, fonts or CDNs**, which keeps the attack surface small and the page fast. The whole site is about 130 KB before compression.

## Free Website Security Check (`/security-check`)

A visitor enters their domain and gets:
- a score (A–F, out of 100) and their **top 3 fixes**, each with impact, effort and who should do it
- **step-by-step fixes for their platform**, with copy-paste snippets: Cloudflare Transform Rules, nginx, Apache/.htaccess, WordPress, and Wix/Squarespace/Shopify/Webflow/GoDaddy. Email fixes are tailored to Google Workspace or Microsoft 365.
- **industry context** if they pick one: real estate (wire fraud), lending (FTC Safeguards Rule), legal, healthcare (HIPAA), home services, retail (PCI)
- **Save as PDF** (a print layout), **Check again**, and progress since their last check (remembered in their browser)
- **Email me this report** (optional): they get a plain-text report and **you get a lead notification** with their email, site, score, industry and top issues
- **Book a security audit**, which pre-fills the contact form

### Passive checks (anyone)

| Area | Checks |
|---|---|
| HTTPS | HTTPS, http→https redirect, HSTS, certificate expiry (from public Certificate Transparency logs) |
| Headers | CSP, clickjacking, nosniff, Referrer-Policy, Permissions-Policy, software version leaks |
| Software & content | Outdated WordPress (vs wordpress.org), end-of-life PHP, JavaScript libraries with known vulnerabilities (OSV database), cookie flags, mixed content, insecure forms, third-party scripts |
| Email | SPF (including the 10-lookup limit), DKIM, DMARC, MTA-STS |
| Domain & DNS | Domain expiry and transfer lock (RDAP), DNSSEC, CAA, and Google Safe Browsing if `GOOGLE_SAFE_BROWSING_KEY` is set |
| Files | 10 commonly exposed files (`.env`, `.git`, config backups, …), plus security.txt |

### Owner-verified checks (site owners only)

The owner adds a DNS TXT record or a file containing a code we generate. The code is an HMAC of the domain with `VERIFY_SECRET` (falling back to `RATE_LIMIT_SALT`), so no database is needed. That unlocks:
- login page exposure
- the WordPress user list (`/wp-json/wp/v2/users`); only the count is reported, never the names
- XML-RPC
- open folder listings
- 10 more sensitive files (debug logs, `.env` variants, database dumps, editor SFTP settings)
- `readme.html`

These are still read-only GET requests.

### What it never does

- log in, submit forms or send attack payloads
- add query strings on the target site
- scan ports
- read more than 300 KB of the home page or 4 KB of any file
- return the contents of exposed files

Every request is a plain `GET` that identifies itself as `GleydeSecurityCheck/1.0 (passive; …)`.

### Abuse and SSRF protection

- Only public domain names are accepted. IP addresses, ports, credentials and reserved names are refused.
- Every host on the target side, including every redirect hop, is resolved first, and refused if *any* address is private, loopback, link-local, cloud-metadata, carrier-grade NAT, documentation, multicast, or an IPv6 form wrapping one of those.
- Rate limits:
  - checks: 10 per hour per visitor; at most 3 fresh checks of one domain per 15 minutes; results cached for 15 minutes (needs KV)
  - verified checks: 6 per hour per visitor and 4 per domain per 15 minutes
  - report emails: 3 per address per day
- Turnstile is required for checks and verified checks.
- Each check stays within 48 outbound requests, under the Workers free plan's 50. A typical check uses about 25. If the budget runs out, checks are marked "not checked" instead of failing.

### Settings

| Name | Needed for |
|---|---|
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Running checks at all |
| `RATE_LIMIT_SALT` | Rate limits; also the default verification secret |
| `RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL` | Report emails, lead notifications and the contact form |
| `VERIFY_SECRET` *(optional)* | A separate secret for ownership codes. If you change it, every issued code changes. |
| `GOOGLE_SAFE_BROWSING_KEY` *(optional)* | The malware/phishing blocklist check (free key from Google Cloud) |
| KV binding `RATE_LIMIT_KV` *(recommended)* | The 15-minute result cache and stronger rate limits |

**Firewall:** the WAF rate-limiting rule in the Cloudflare setup notes below covers both `/api/contact` and `/api/scan`. Consider adding `/api/deep-scan` and `/api/verify` too.

**Not built yet:** automatic weekly re-checks. They need a scheduled Worker plus storage, so the "Ongoing Monitoring" service covers that for now.

## Cloudflare setup notes

1. **Create the Pages project**
   - Workers & Pages → Create → Pages → connect the Git repo.
   - Root directory: `gleyde-security`. Build command: *(none)*. Output directory: `public`.
   - Or deploy from your machine: `npx wrangler pages deploy`.
2. **Custom domain**: Pages project → Custom domains → add `yourdomain.com` and `www.yourdomain.com`. Pick one as primary and redirect the other (Rules → Redirect Rules).
3. **KV for rate limiting**
   - Run `npx wrangler kv namespace create RATE_LIMIT_KV`.
   - Paste the id into `wrangler.toml` (uncomment the block). If you configure from the dashboard instead: Settings → Bindings → KV → `RATE_LIMIT_KV`.
4. **Turnstile**: Dashboard → Turnstile → Add widget. Add your domain and use the *Managed* mode. Put the site key and secret key into the environment variables.
5. **Resend**: create an account, verify your domain (it adds DNS records in Cloudflare), and create an API key with *sending access only*.
6. **SSL/TLS**
   - Set the mode to **Full (strict)**.
   - Edge Certificates: turn on **Always Use HTTPS**, set **Minimum TLS 1.2**, and turn on **TLS 1.3**.
   - Leave **HSTS** to `_headers`, which already sends it. Submit to hstspreload.org only once you're sure every subdomain is HTTPS.
7. **WAF rate-limiting rule** (Security → WAF → Rate limiting rules; the free plan includes one rule):
   - If URI Path is in `/api/contact` and `/api/scan` and Method equals `POST`, then **Block** for 10 minutes when one IP makes more than 10 requests in 1 minute.
8. **Bot Fight Mode**: turn it on (Security → Bots).
9. **Turn OFF features that inject inline scripts**, or the CSP will block them:
   - Rocket Loader
   - Email Address Obfuscation (Scrape Shield)
   - Automatic Web Analytics injection. If you want analytics, add `https://static.cloudflareinsights.com` to `script-src` and `https://cloudflareinsights.com` to `connect-src`.
10. **DNSSEC**: DNS → Settings → enable, and add the DS record at your registrar.
11. **Email security DNS**: add SPF, DKIM (from Resend and from your mailbox provider) and a DMARC record, starting with `v=DMARC1; p=quarantine; rua=mailto:you@yourdomain.com`.
12. **Verify after launch**:
    - Check that https://securityheaders.com and https://observatory.mozilla.org grade the site **A or better**.
    - Check that https://www.ssllabs.com/ssltest/ grades it **A or A+**.
    - Submit the contact form once with a real email.
