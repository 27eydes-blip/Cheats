# Private deployment: Cloudflare Pages + Cloudflare Access

Goal: the studio lives at an HTTPS address that asks for a login, and only
your email can get in (one-time codes sent by email). Every step works in
Safari on a phone. Dashboard labels move around; if one below doesn't match
what you see, stop and ask rather than guess.

## What the code already does

- Installable PWA: name "Sam Eyde Studios", short name "SE Studios", SES icon,
  full-screen standalone mode, works offline after the first visit.
- The manifest is fetched with the login cookie (`crossorigin="use-credentials"`),
  which a site behind a login wall needs in order to be installable.
- `public/_headers` tells Cloudflare Pages: no search indexing, microphone
  allowed for this site only, and always re-check `index.html` / `sw.js` so
  new versions reach the phone.

## 1. Put the code in a private GitHub repository

The app must live in its own **private** repository (a fork of a public
repository cannot be made private).

1. Go to **github.com/new**.
2. **Repository name:** `sam-eyde-studios`.
3. Choose **Private**.
4. Leave "Add a README", ".gitignore" and "license" off.
5. Tap **Create repository**.

## 2. Create the Cloudflare Pages project

1. Go to **dash.cloudflare.com** and log in.
2. Open the menu (☰) → **Workers & Pages** (under "Compute").
3. Tap **Create**, choose the **Pages** tab, then **Connect to Git** /
   **Import an existing Git repository**.
4. Choose **GitHub**. When GitHub asks which repositories Cloudflare may see,
   pick **Only select repositories** → `sam-eyde-studios` → **Install & Authorize**.
5. Select the `sam-eyde-studios` repository → **Begin setup**.
6. Fill in:
   - **Project name:** anything you like; it becomes `<name>.pages.dev`.
   - **Production branch:** `main`
   - **Framework preset:** `None` (or `Vite`)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
7. Tap **Save and Deploy** and wait for "Success". Note the address
   `https://<name>.pages.dev`.

Do step 3 straight away: until Access is on, anyone with the address can open
the (empty) app.

## 3. Lock it with Cloudflare Access (Zero Trust)

1. At **dash.cloudflare.com**, open the menu (☰) → **Zero Trust**.
   First time only: pick a team name (any), choose the **Free** plan and finish
   the checkout (it is $0; Cloudflare may still ask for a payment method).
2. **Settings → Authentication → Login methods**: make sure **One-time PIN** is
   listed. If not: **Add new → One-time PIN**.
3. **Access → Applications → Add an application → Self-hosted**.
4. **Application name:** `Sam Eyde Studios`. **Session duration:** `1 month`
   (how often you'll be asked to log in again).
5. **Add public hostname** twice:
   - Subdomain `<name>`, domain `pages.dev` (the live site)
   - Subdomain `*.<name>`, domain `pages.dev` (preview builds)
6. Under identity providers / login methods, leave **only One-time PIN** ticked.
7. Add a policy:
   - **Policy name:** `Only me` — **Action:** `Allow`
   - **Include → Selector:** `Emails` — **Value:** your email address
   - Add nothing else. In particular no "Everyone" and no "Emails ending in".
8. **Save**.

## 4. Check it

1. Open `https://<name>.pages.dev` in a **private** Safari tab. You should see a
   Cloudflare login page, not the studio.
2. Enter your email → get the 6-digit code by email → enter it → the studio opens.
3. Try a different email address: the page looks the same but no code arrives.
4. In normal Safari: open the address, log in, then **Share → Add to Home
   Screen**. The icon should say **SE Studios** with the SES monogram.
5. Open it from the Home Screen (it may ask for the email code once more:
   Home Screen apps keep their own login). It should open full screen.
6. New project → tap the red record button → allow the microphone → record a
   few seconds → stop. A take should appear.

Recordings are stored on the phone itself, per address. If the address ever
changes, back projects up first (project list → ⋯ → Back up).
