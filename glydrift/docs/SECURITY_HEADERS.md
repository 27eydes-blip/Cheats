# Security headers (glydrift.com)

They live in `public/_headers`, which Vite copies into the build as `dist/_headers`. Cloudflare Pages
reads that file and adds the headers to every response. The test server (`tests/serve.mjs`) applies
the same file, so every automated test runs under exactly the headers the live site sends.
`tests/e2e/security-headers.spec.js` fails if one is missing or the policy blocks anything.

## The headers (every page and file: `/*`)

| Header | Value | Why |
| --- | --- | --- |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | Browsers use HTTPS only, for a year, on subdomains too. No `preload`: getting off that list takes months. |
| X-Frame-Options | `DENY` | No other site can show glydrift.com inside a frame (clickjacking). |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` | Turns off what the game never uses. Sound, vibration, fullscreen and screen orientation are left alone. |
| Content-Security-Policy | see below | Only the game's own code and its own server can run or be reached. |

Cloudflare already adds `X-Content-Type-Options: nosniff` and
`Referrer-Policy: strict-origin-when-cross-origin`.

## What the Content Security Policy allows, and why

| Directive | Allows | Because |
| --- | --- | --- |
| `default-src` | `'self'` | Anything not listed below: glydrift.com only. |
| `script-src` | `'self'`, one `sha256-…` hash | The game's own files, plus the one small inline script in `index.html` (the "Couldn't load the game, tap to retry" splash), by its exact hash. No other inline script and no `eval`. If that script changes, update the hash; the test fails until you do. |
| `style-src` | `'self' 'unsafe-inline'` | The splash, the privacy and support pages' `<style>` blocks, and styles the game sets from code. Inline styles can't run code. |
| `img-src` | `'self' data: blob:` | Textures the game draws for itself, and the share card picture. |
| `font-src` | `'self' data:` | The game's bundled fonts. |
| `media-src` | `'self' data: blob:` | The soundtrack and sound effects. |
| `connect-src` | `'self'`, `https://cdjcvhywrbsdryagqxqg.supabase.co`, `wss://` of the same, `data:` | Leaderboard, accounts, cloud save and crash reports (Supabase), over https and its realtime socket; the share card reads its own picture back from a `data:` address. |
| `worker-src` | `'self' blob:` | The offline service worker (`sw.js`) and Supabase's realtime helper worker, made from a `blob:`. |
| `manifest-src` | `'self'` | The home-screen app manifest. |
| `frame-ancestors` | `'none'` | Same as X-Frame-Options, the modern way. |
| `object-src` | `'none'` | No plug-ins. |
| `base-uri` | `'self'` | A page can't change where its relative links point. |
| `form-action` | `'self'` | Forms only submit to glydrift.com. |

Not needed on the website:
- **Sign in with Apple** runs inside the iPhone app with Apple's own sign-in screen. The app's pages
  come from the app itself, not glydrift.com, and the web game never shows the button.
- **Google Fonts.** Only the separate links page on GitHub Pages uses them.
- **Phaser and Tone.js.** They need nothing extra.

## Doing the same for another Cloudflare Pages site (Glydaway, …)

1. **Find the folder copied into the build as-is.** For Vite that's `public/`. For Next.js static
   export it's `public/`; for Astro, `public/`; for a plain site, the folder you upload. Create a file
   named `_headers` there (no extension).
2. **Start from this file.** Copy the three headers word for word. Copy the CSP, but as
   `Content-Security-Policy-Report-Only:` with `default-src 'self'; frame-ancestors 'none';
   object-src 'none'; base-uri 'self'; form-action 'self'`.
3. **Find what the site really loads.** Open it with DevTools → Console and use every screen.
   Report-only mode prints a "[Report Only] Refused to …" line for everything the policy would
   block.
   - Another domain (an API, a font CDN, Supabase): add it to the matching directive (`connect-src`,
     `font-src`, `img-src`, …). For a websocket, add its `wss://` address to `connect-src` as well.
   - Its own Supabase project: `connect-src https://<ref>.supabase.co wss://<ref>.supabase.co`.
   - An inline `<script>`: move it into a file (best), or allow its exact hash. Chrome prints the
     hash in the "Refused to execute inline script" message.
   - Pictures from `data:` or `blob:`: add those to `img-src`.
4. **Deploy in report-only mode and use the live site for a few days.** Nothing is blocked yet.
   Check the console on phone and desktop.
5. **Enforce it.** When there are no more reports, rename the header to `Content-Security-Policy:`
   and deploy.
6. **Check it.** Run `curl -sI https://<site>/ | grep -iE "strict|frame|permissions|content-security"`
   or use securityheaders.com.

To undo a header, delete its line from `_headers` and deploy again: Cloudflare stops sending it at
once. HSTS is the exception, because browsers remember it for the max-age. Only enable it once the
whole site, with its subdomains, works on HTTPS.
