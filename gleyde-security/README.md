# Gleyde Technologies — Cybersecurity & Software website

A static, fast, mobile-first site with one serverless function for the contact form, built for **Cloudflare Pages**. There's no framework and no build step, and every font and script is self-hosted. The only third party is Cloudflare Turnstile on the contact page.

```
public/                 The website (deployed as-is)
  index.html            Home
  services.html         Services & pricing      ← prices live here
  how-it-works.html     4-step process
  about.html            Story & team            ← story/bios live here
  contact.html          Contact form
  404.html
  _headers              Security headers for all pages
  .well-known/security.txt
  assets/css|js|fonts|img
functions/api/
  contact.js            POST /api/contact  (validation, spam, rate limit, email)
  config.js             GET  /api/config   (public Turnstile site key)
lib/http.js             Shared security headers for function responses
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
npm test                            # form validation + handler tests
```

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
  - Per-IP rate limit of 5 per hour in KV (IPs are salted and hashed). Back it with the WAF rule below.
  - The email is plain text with a fixed subject. User input never goes into email headers, and only a validated address is used for `reply_to`.
  - Errors are generic to the visitor; the details go to Cloudflare logs.
- **No third-party trackers, fonts or CDNs**, which keeps the attack surface small and the page fast. The whole site is about 130 KB before compression.

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
7. **WAF rate-limiting rule** (Security → WAF → Rate limiting rules; the free plan includes one):
   - If URI Path equals `/api/contact` and Method equals `POST`, then **Block** for 10 minutes when one IP makes more than 5 requests in 1 minute.
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
