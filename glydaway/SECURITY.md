# glydaway.com security: headers, email DNS records, and how to check them

## How it's served
glydaway.com is a **Cloudflare Pages** project (`glydaway`). GitHub Actions builds `dist/` and deploys it with
`wrangler pages deploy` (`.github/workflows/glydaway.yml`). Cloudflare Pages sends the response headers listed in
`dist/_headers`. That file is generated at build time by `scripts/build-headers.mjs`, because the Content Security
Policy allows the page's one inline script and one inline style by their exact SHA-256 hashes. The hashes have to
be taken from the final page, after the deploy fills in the server address.

## The headers (sent on every response)
| Header | Value |
|---|---|
| Strict-Transport-Security | `max-age=31536000` (adds `; includeSubDomains` when `GLYDAWAY_HSTS_SUBDOMAINS=1`; never `preload`) |
| Content-Security-Policy (`-Report-Only` until `GLYDAWAY_CSP_ENFORCE=1`) | see below |
| X-Frame-Options | `DENY` (the game isn't embedded anywhere) |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` (the game uses none of them) |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |

**The CSP** allows only what the game really loads:

| Directive | Allows | Why |
|---|---|---|
| `default-src` | `'self'` | The base rule for everything not listed. |
| `script-src` | `'self'` and the hash of the page's one inline script | The game code. No `'unsafe-inline'`, no `eval`. |
| `style-src` | `'self'`, the hash of the inline `<style>`, and `https://fonts.googleapis.com` | The game's CSS and the Google Fonts stylesheet. The page has no inline `style=""` attributes; the build refuses them. |
| `font-src` | `https://fonts.gstatic.com` | Orbitron, Rajdhani and Silkscreen. |
| `img-src` | `'self' data:` | The icons, and the character previews drawn on a canvas. |
| `connect-src` | `'self'` and the Supabase project URL (only once it's set up) | The leaderboard and accounts server. |
| `media-src`, `worker-src` | `'none'` | All sound is synthesized with Web Audio; no workers. |
| `manifest-src`, `form-action` | `'self'` | |
| `frame-ancestors`, `object-src` | `'none'` | Nothing can embed the page; no plugins. |
| `base-uri` | `'self'` | |

`'unsafe-inline'` isn't needed anywhere. Styles that JavaScript sets on elements (`el.style`) aren't covered by CSP.

`tests/headers.test.cjs` builds the site like the deploy does. It serves the site with these headers and the
**enforcing** CSP, then plays through the game: name, a run, the glide level, the Locker Room and shop, the
leaderboard, Settings and sign-in. It fails on any CSP violation. CI runs it on every change. After every deploy,
the workflow fetches the live headers from glydaway.com and fails if any differs from `dist/_headers`.

### Rolling out the CSP
1. The first deploy sends **Content-Security-Policy-Report-Only**: violations are only reported, nothing is blocked.
2. Open https://glydaway.com in Chrome with DevTools → Console. Play a run, then open the Locker Room, the
   Leaderboard and Settings → Account. You should see **no** "Content Security Policy" messages.
   - If Cloudflare adds a script on its own (Web Analytics' `static.cloudflareinsights.com` beacon, Rocket Loader,
     Email Obfuscation), it will show up here. Turn that feature off in Cloudflare, or tell me and I'll allow it.
3. Then switch it on: GitHub → repository Settings → Secrets and variables → Actions → **Variables** → add
   `GLYDAWAY_CSP_ENFORCE` = `1`. Re-run the latest "Glydaway" workflow on `main` (or push any change). The header
   becomes **Content-Security-Policy**.

### HSTS includeSubDomains
It's off for now. Nothing here could check which subdomains exist (this environment can't reach the DNS or the site).
To turn it on:
1. In Cloudflare → glydaway.com → **DNS**, list every record. For each subdomain that serves a website (for example
   `www`), open `http://<subdomain>.glydaway.com` and check that it redirects to `https://`.
   - Cloudflare → SSL/TLS → Edge Certificates → **Always Use HTTPS** = On does that for every proxied (orange-cloud)
     hostname.
   - A grey-cloud (DNS only) hostname that serves plain HTTP must stay on HTTP: leave includeSubDomains off.
2. If every subdomain is HTTPS-only, add the repository variable `GLYDAWAY_HSTS_SUBDOMAINS` = `1` and re-run the
   deploy. Never add `preload`.

## Email DNS records (SPF, DMARC): add these at Cloudflare → glydaway.com → DNS → Records
**glydaway.com sends no email today.** There's no support mailbox, and no mail service is connected yet:
the leaderboard's sign-in emails need an email sender that isn't set up yet (see ONLINE_SETUP.md). So:

| Type | Name | Content | TTL |
|---|---|---|---|
| TXT | `@` (glydaway.com) | `v=spf1 -all` | Auto |
| TXT | `_dmarc` | `v=DMARC1; p=reject; rua=mailto:REPORT-ADDRESS` | Auto |

- Replace `REPORT-ADDRESS` with an inbox you actually check. If you don't want reports, use `v=DMARC1; p=reject;`.
- Optional: a "null MX" record says the domain receives no mail either: `MX` `@` `.` priority `0`. Only add it if
  nobody uses an @glydaway.com address. If you do receive mail (for example with Cloudflare Email Routing), skip it.
- If an SPF TXT record already exists at `@`, **edit** it rather than adding a second one: two SPF records break SPF.

### When you add an email sender (for the leaderboard's sign-in codes)
Example: Resend, sending as `no-reply@glydaway.com`. Use the exact values from the provider's dashboard.
1. Resend → Domains → Add `glydaway.com`. It shows the records to add:
   - **DKIM:** a TXT record `resend._domainkey` containing the public key Resend gives you.
   - **SPF for its bounce subdomain:** TXT `send` = `v=spf1 include:amazonses.com ~all`, plus MX `send` →
     `feedback-smtp.<region>.amazonses.com` priority 10.
   - The root `v=spf1 -all` can stay as it is: Resend sends from the `send.` subdomain, so DMARC passes through
     DKIM, which is aligned on glydaway.com.
2. When Resend says "Verified", set Supabase → Authentication → SMTP to Resend's SMTP details, with the sender
   `no-reply@glydaway.com`.
3. While the first real emails go out, relax DMARC to watch the reports: `v=DMARC1; p=none; rua=mailto:REPORT-ADDRESS`.
   - After 2–4 weeks of clean reports, change it to `p=quarantine`, then later back to `p=reject`.
4. Every service that sends as @glydaway.com needs its own **DKIM** (and SPF) records. That includes a mailbox
   provider (Google Workspace, Zoho…), a newsletter tool, or a support desk.

## Checking (from your own computer)
```sh
curl -sI https://glydaway.com | grep -iE 'strict-transport|content-security|x-frame|permissions-policy|x-content-type|referrer-policy'
dig +short TXT glydaway.com          # → "v=spf1 -all"
dig +short TXT _dmarc.glydaway.com   # → "v=DMARC1; p=reject; ..."
# Windows: nslookup -type=TXT glydaway.com   and   nslookup -type=TXT _dmarc.glydaway.com
```
DNS changes usually show within minutes on Cloudflare, but can take up to an hour elsewhere.

**Re-running the outside scan:** open the scanner you used, enter `glydaway.com` and start a new scan. If it offers
"clear cache" or "hide results", tick it so it doesn't show the old grade. After the deploy and the DNS records,
these should pass:
- HSTS
- Content Security Policy (once enforcing: a "Report-Only" CSP usually still counts as missing)
- Clickjacking (X-Frame-Options / frame-ancestors)
- Permissions Policy
- SPF
- DMARC

Two other public checkers are https://securityheaders.com and https://www.mail-tester.com (for the email records).
