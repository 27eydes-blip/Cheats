# TownPass

Tourists scan a QR sticker → pay $3 (Apple Pay / Google Pay / card) → unlock a local guide for that town.
Launch city: **Montauk, NY**. Any US city can be added from `/admin` without code changes.

**Stack:** Next.js 16 (App Router) + Tailwind 4, deployed to **Cloudflare Workers** via
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), **D1** (SQLite) database, **Stripe Checkout**,
**Resend** for email.

---

## How it works

```
QR sticker ──► /city/montauk?src=MTK-7F3K2Q        (scan recorded for that sticker)
                 │  landing: blurred preview + "Unlock for $3"
                 ▼
            POST /api/checkout ──► Stripe Checkout (Apple Pay · Google Pay · card)
                 │                     │
                 │                     └─► webhook /api/webhooks/stripe  (checkout.session.completed)
                 │                            marks purchase PAID + emails magic link (Resend)
                 ▼
     /city/montauk/success?session_id=…   waits for PAID (or asks Stripe's API server-to-server)
                 ▼
     /access/<signed token>  ──► sets HttpOnly cookie tp_montauk ──► guide unlocked
```

* **Access token** = HMAC-signed purchase ID. The purchase row in D1 is the source of truth, so a refund or dispute
  (webhook `charge.refunded` / `charge.dispute.created`) revokes access immediately, including old emailed links.
* **Lifetime vs timed access** is per city (`/admin → Cities`): lifetime, or N hours (e.g. 24).
* **Restore access:** `/city/<slug>/restore`. The user enters their receipt email and we email a fresh magic link.
  The page never reveals whether an email has bought, and it is rate-limited.
* **Open now / Closes soon / Closed** is computed from the city's timezone. "Closes soon" means ≤ 60 min.
  **Summer vs off-season hours** switch automatically using the city's summer date range.
* **Last verified:** every listing shows its verification date, or **UNVERIFIED**. `/admin/verify` lists everything
  unverified or older than 30 days.
* **Report wrong info** on every listing goes to `/admin/reports`, which also shows a badge in the admin nav.
* **QR stickers:** `/admin/stickers` generates unique IDs (`MTK-XXXXXX`), with PNG/SVG downloads and a printable sheet.
  The dashboard shows scans, sales, conversion and revenue **per sticker**, **per city** and **per day**.
* **Refunds:** Terms say *all sales final*. To make an exception (e.g. a double charge), refund in the Stripe Dashboard
  and access is revoked automatically. `/admin/purchases` links each sale to Stripe.

### Hours format (admin)

```
mon-fri 08:00-21:00; sat 09:00-22:00; sun closed
daily 11:30-15:00, 17:00-22:00          # two services
thu-sat 22:00-04:00                     # past midnight is fine
daily 24h
daily 09:00-17:00; sun closed           # later rules override earlier ones
```
Each listing has **Default**, **Summer** and **Off-season** hours. The seasonal field wins when filled in.

---

## Run it locally

```bash
cd townpass
npm install
cp .dev.vars.example .dev.vars          # fill in Stripe TEST keys, a secret, an admin password
npm run db:migrate:local
npm run db:seed:local                   # Montauk placeholder data (UNVERIFIED, city hidden)
npm run preview                         # builds for Workers and serves http://localhost:8787
```

* Admin: http://localhost:8787/admin (password = `ADMIN_PASSWORD` in `.dev.vars`).
* Montauk is seeded **unpublished**. As admin you can preview the guide at `/city/montauk`.
  Tick "Published" in `/admin/cities` to test the paywall.
* Webhooks locally: install the [Stripe CLI](https://docs.stripe.com/stripe-cli), then
  `stripe listen --forward-to localhost:8787/api/webhooks/stripe` and put the printed `whsec_…` in `.dev.vars`.
  Pay with test card `4242 4242 4242 4242`.
* `npm test` runs unit tests (hours logic, tokens). `npm run typecheck` runs the TypeScript checks.
* `npm run dev` (plain `next dev`) also works for UI work, using the local D1 via `initOpenNextCloudflareForDev`.

---

## Deploy to Cloudflare (step by step)

1. **Log in:** `npx wrangler login`
2. **Create the database:** `npx wrangler d1 create townpass` → copy the `database_id` into `wrangler.jsonc`.
3. **Schema + seed:** `npm run db:migrate:remote && npm run db:seed:remote`
4. **Secrets** (each command prompts for the value):
   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY        # sk_live_… (or sk_test_… first)
   npx wrangler secret put STRIPE_WEBHOOK_SECRET    # whsec_… from step "Stripe → Webhook" below
   npx wrangler secret put ACCESS_TOKEN_SECRET      # openssl rand -base64 48   (never change after launch)
   npx wrangler secret put ADMIN_PASSWORD           # long and unique; changing it logs out all admin sessions
   npx wrangler secret put RESEND_API_KEY
   ```
5. **Vars** in `wrangler.jsonc`: `PUBLIC_BASE_URL`, `BRAND_NAME`, `SUPPORT_EMAIL`, `FROM_EMAIL`.
6. **Deploy:** `npm run deploy`
7. **Custom domain** (when you have one): Cloudflare Dashboard → Workers & Pages → `townpass` → Settings →
   Domains & Routes → *Add custom domain*. Then set `PUBLIC_BASE_URL` to it, redeploy, and update the Stripe
   webhook URL.

> ⚠️ **QR codes encode `PUBLIC_BASE_URL`.** Don't print stickers until it's your final domain.
> Sticker IDs don't change, so you can always re-download.

---

## Stripe setup

1. **Create and activate** a Stripe account (business details + bank account). Build everything in **Test mode** first.
2. **API keys:** Developers → API keys → copy the **Secret key** into `STRIPE_SECRET_KEY`.
   *(Tip: a [restricted key](https://docs.stripe.com/keys#limit-access) with write access to Checkout Sessions and
   read access to Charges/Payment Intents is enough.)*
3. **Payment methods:** Settings → Payments → **Payment methods**. Make sure **Cards**, **Apple Pay** and
   **Google Pay** are on (wallets are on by default with cards). The app does *not* hard-code payment methods, so
   anything you enable here appears in Checkout automatically.
4. **Webhook:** Developers → Webhooks → *Add endpoint*
   * URL: `https://YOUR-DOMAIN/api/webhooks/stripe`
   * Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`
   * Copy the **Signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.
   * Test and live mode have **separate** webhooks and secrets. Recreate it when you go live.
5. **Receipts:** Settings → Business → **Customer emails** → turn on *Successful payments* (and *Refunds*).
   Stripe only sends these in live mode. That email is the "receipt link" customers search for when restoring access.
6. **Branding:** Settings → Business → **Branding**: upload an icon and set brand color `#0b0b0d` and accent `#d4af37`,
   so Checkout matches the dark/gold site.
7. **Public details:** Settings → Business → **Public details**: set the statement descriptor (e.g. `TOWNPASS`) and
   support email. Clear descriptors reduce "I don't recognize this charge" disputes, which cost about $15 each.

### Apple Pay & domain verification: do I need it?

**With this build: no.** Stripe Checkout is a Stripe-hosted page (`checkout.stripe.com`), and Stripe has already
verified that domain with Apple. Apple Pay appears automatically on Checkout when:
* the visitor uses **Safari on iPhone/iPad/Mac**, or another browser on iOS 16+ that supports it, and
* they have a card in **Apple Wallet**, and
* Apple Pay is enabled in your Stripe payment methods (step 3).

Google Pay works the same way in Chrome/Android with a saved card. In test mode Apple Pay still appears on a real
device and Stripe swaps in a test card, so nothing is charged.

**You'd only need domain verification if** you later replace the "Unlock for $3" button with an *in-page* Apple Pay
button (Stripe's **Express Checkout Element**), so the Apple Pay sheet opens directly on your landing page and skips
the Checkout page. That saves one screen. The steps are:

1. Stripe Dashboard → Settings → Payments → **Payment method domains** → *Add a new domain* → enter
   `yourdomain.com` (and `www.` if used). Add the test-mode domain too.
2. Stripe registers the domain with Apple. If it asks you to host Apple's association file, download it and save it
   to `townpass/public/.well-known/apple-developer-merchantid-domain-association` (no file extension). Deploy, and
   check that `https://yourdomain.com/.well-known/apple-developer-merchantid-domain-association` serves it.
3. Click *Verify* in Stripe. Every domain and subdomain that shows the button must be registered separately,
   and the site must be HTTPS (Cloudflare handles that).

I kept hosted Checkout for launch: no domain dependency, nothing to break, and Stripe keeps Apple Pay, SCA and
fraud tools up to date. The in-page button is a good v2 upgrade once the domain is final.

---

## Email (Resend)

1. Create an account at resend.com → **Domains** → add a sending domain such as `mail.yourdomain.com`.
2. Add the DNS records it shows (SPF/DKIM, optionally DMARC) in Cloudflare DNS, then click *Verify*.
3. **API Keys** → create a key with "Sending access" → `npx wrangler secret put RESEND_API_KEY`.
4. Set `FROM_EMAIL` (e.g. `TownPass <access@mail.yourdomain.com>`) and `SUPPORT_EMAIL` in `wrangler.jsonc`.

Without `RESEND_API_KEY`, emails are only logged (`npx wrangler tail`). Purchases still work through the cookie,
but restore-by-email won't send anything.

---

## Content workflow (Montauk launch checklist)

1. `/admin/verify`: every seeded Montauk entry is **UNVERIFIED** (30 listings). For each one: call or visit, fix
   name/address/phone/hours/prices/rules, then **Save & mark verified today**. Phone numbers were intentionally left
   blank in the seed. Delete anything that doesn't exist.
2. Check the **summer date range** on the city (default 05-22 → 09-08), and fill in summer and off-season hours.
3. Edit the Terms/Privacy templates in `src/app/terms` and `src/app/privacy` (business name, state). Have a lawyer
   look before launch.
4. Tick **Published**, do one real $3 live purchase on your own phone, then refund it in Stripe and confirm access is revoked.
5. Generate stickers (batch per placement round), print the sheet (US Letter, 100% scale, "Background graphics" on),
   put them up, and label each sticker's location in `/admin/stickers` so the dashboard shows what sells.
6. Re-verify anything that turns stale (30 days). The admin nav badge shows how many.

### Adding a city

`/admin/cities` → *Add a city* (slug, sticker code, state, timezone, price, lifetime or N-hour pass, summer
dates). It's created **hidden** with the six standard sections. Add listings, verify, publish, generate stickers.

---

## Project layout

```
townpass/
  migrations/0001_init.sql      D1 schema (cities, sections, listings, stickers, scans, purchases, reports…)
  seed/montauk.sql              Montauk placeholder content, all UNVERIFIED
  src/app/city/[slug]/          landing + guide, success, restore
  src/app/api/checkout          creates the Stripe Checkout Session
  src/app/api/webhooks/stripe   payment confirmation, refunds/disputes → revoke
  src/app/access/[token]        magic-link target → sets access cookie
  src/app/admin/                password-protected admin (server actions in actions.ts)
  src/lib/hours.ts              hours parser, open-now logic, seasons
  src/lib/token.ts              HMAC tokens (WebCrypto)
  src/lib/qr.ts                 QR → SVG / PNG (pure JS, runs on Workers)
  src/lib/sections.ts           section types + their fields (add new types here)
```

### Performance notes (beach cell signal)

All pages are server-rendered HTML with plain `<form>` posts: the paywall, guide, report and restore all work
**before any JavaScript loads**. There are no web fonts, no images and no client components on public pages.
The landing page is about 150 KB uncompressed locally, and Cloudflare compresses it to roughly 70 KB in production,
mostly the Next.js runtime, which is cached after the first visit.
