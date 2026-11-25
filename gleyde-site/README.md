# Gleyde Technologies, LLC: website

The single-page company site for **gleydetechnologies.com**.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS 4 and Framer Motion. It is ready to deploy on Vercel.

---

## Run it locally

You need Node.js 20 or newer.

```bash
cd gleyde-site
npm install
npm run dev          # http://localhost:3000
```

Other scripts:

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run build`     | Production build (also type-checks)            |
| `npm start`         | Serve the production build                     |
| `npm run lint`      | ESLint (Next.js Core Web Vitals + TypeScript)  |
| `npm run typecheck` | TypeScript only                                |

---

## Editing content (no design work needed)

Almost everything you will want to change is in **one file: `src/data/portfolio.ts`**.

### Divisions and products

Each division is one object in the `divisions` array. Each product inside it is one object in that division's `projects` array:

```ts
{
  name: "Glydaway",
  description: "An endless side-scrolling runner spin-off of Glydrift.",
  status: "Beta",                                   // see allowed values below
  url: "https://glydaway.gleydetechnologies.com",   // optional; omit for no link
},
```

- **Add a product:** copy an existing product object and change its fields.
- **Remove a product:** delete its object.
- **Hide a link:** delete the `url` line.
- **Statuses:** `"Live"`, `"Beta"`, `"In Development"`, `"Coming Soon"`, `"Concept"`. To add a new one, add it to the `Status` type in the same file and give it a colour in `src/components/StatusBadge.tsx`. TypeScript flags any spot you miss.
- URLs marked `// placeholder` are guesses. Replace them once the real domains are live.

A division also has a `numeral` (I, II, III…), a `description`, its own `status` and `url`, an optional `lead` (shown as "Led by …"; change the wording with `leadLabel`), and an optional `footnote` such as "and more in the works".

### Portfolio page

`/portfolio` lists every product from every division in one grid, with a filter per division. It reads the same `divisions` data, so there is nothing extra to edit: add a product to a division and it appears there too. The "Portfolio" menu link comes from `navLinks` in `src/lib/site.ts`.

### Roadmap

The `roadmap` array holds the Now / Next / Later phases. Each phase has a `phase` label, an optional `when`, a `title` and a list of `items`. Add or remove phases freely; the timeline adapts.

### Leadership

The `leadership` array holds one object per person: `name`, `title`, `initials` (shown in the gold diamond) and an optional `note`.

### Company details

`src/lib/site.ts` holds the company name, tagline, founder, the contact email (currently a placeholder, **hello@gleydetechnologies.com**) and the navigation links.

---

## Contact form

The form posts JSON to `/api/contact` (`src/app/api/contact/route.ts`). The route validates the input, ignores bots through a hidden honeypot field, and returns `{ ok: true }`.

**It does not send email yet.** To deliver messages, add an email provider where the `TODO` is. For example, with [Resend](https://resend.com):

1. `npm install resend`
2. Add `RESEND_API_KEY` in Vercel → Project → Settings → Environment Variables.
3. Replace the TODO with a `resend.emails.send({ … })` call.

---

## Deploy to Vercel

1. Push this repository to GitHub (already done if you are reading this there).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. **Important:** set **Root Directory** to `gleyde-site`. Vercel detects Next.js automatically; leave the build settings at their defaults.
4. Optional: add the environment variable `NEXT_PUBLIC_SITE_URL=https://gleydetechnologies.com` (this is already the default).
5. Click **Deploy**.

Every push to the production branch redeploys the site. Every other branch gets a preview URL.

## Or deploy to Cloudflare Pages

A preview is live at **https://gleyde-technologies.pages.dev** (Cloudflare Pages project `gleyde-technologies`, marked `noindex` so search engines wait for the real domain).

The site can also be built as plain static files:

```bash
npm run build:static                 # writes out/ (+ out/_headers)
PREVIEW=1 NEXT_PUBLIC_SITE_URL=https://gleyde-technologies.pages.dev npm run build:static   # preview build, noindex
npx wrangler pages deploy out --project-name gleyde-technologies --branch main
```

Run the deploy from this folder so Wrangler also picks up `functions/api/contact.ts`, which handles the contact form on Pages. To use the real domain there instead of Vercel: Cloudflare dashboard → Workers & Pages → `gleyde-technologies` → Custom domains → add `gleydetechnologies.com`, and drop `PREVIEW=1` from the build.

## Connect gleydetechnologies.com

1. In Vercel, open the project → **Settings → Domains**.
2. Add `gleydetechnologies.com`, then add `www.gleydetechnologies.com` and choose to redirect it to the apex domain.
3. Vercel shows the DNS records to create. At your domain registrar:
   - **Apex** (`gleydetechnologies.com`): an `A` record pointing to the IP Vercel shows (currently `76.76.21.21`).
   - **www**: a `CNAME` record pointing to `cname.vercel-dns.com`.

   Alternatively, switch the domain's nameservers to Vercel's (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`) and Vercel manages everything.
4. Wait for DNS to propagate (minutes to a few hours). Vercel issues the HTTPS certificate automatically.

Always copy the exact values from the Vercel dashboard, as they can change.

---

## What's in the box

```
src/
  app/
    layout.tsx           fonts (next/font: Cinzel + Inter), metadata, motion setup
    page.tsx             section order + JSON-LD Organization schema
    globals.css          design tokens, grain texture, hairlines, reduced motion
    api/contact/         contact form endpoint (stub)
    icon.svg             favicon
    apple-icon.tsx       iOS home-screen icon (generated PNG)
    opengraph-image.tsx  1200×630 social share image (generated PNG)
    twitter-image.tsx    same image for X/Twitter
    sitemap.ts, robots.ts, manifest.ts
  components/            one file per section, plus small motion helpers
  data/portfolio.ts      ← edit content here
  lib/site.ts            company constants
  lib/brand.ts           logo geometry + brand colours
```

### Design notes

- **Palette (Champagne):** ink `#0B0B0C`, ivory `#F2EFEA`, champagne `#D8C8A0` → `#EFE3C4`. Defined as Tailwind tokens in `globals.css` (`bg-ink`, `text-ivory`, `text-gold`, `text-gold-light`; the `gold` names now hold the champagne values) and mirrored in `src/lib/brand.ts` for the logo and generated images. To recolour the site, change both.
- **Logo:** a sharp Art Deco diamond around a medallion Cinzel "G" with a fine Gatsby sunburst. The geometry is in `src/lib/brand.ts`, shared by the on-page logo (`src/components/GleydeMark.tsx`), the favicon, the Apple icon and the share image. Pass `animated` to draw it in (diamond, ring, rays, then the G fades up), or `compact` for small sizes (drops the rays). If you change the geometry, regenerate `src/app/icon.svg` to match.
- **Style:** editorial and minimal. Every section shares one frame (`src/components/Section.tsx`): a hairline rule, a small index label ("01 About") on the left, content on the right. Rules are 1px, and a true 0.5px on Retina/4K screens (the `rule-t`, `rule-b` and `hairline` utilities in `globals.css`). No boxes, gradients, glows or grain. Champagne is reserved for the logo and a few small accents.
- **One idea per scroll:** every section is a full-screen panel and the page snaps from one to the next (`scroll-snap` in `globals.css`). Each division gets its own panel, so adding a division in the data file adds a panel. Snapping is strict on desktop-sized screens and gentle on phones and short windows, so longer panels still scroll naturally. A small indicator on the right edge (`src/components/PanelIndicator.tsx`, desktop only) shows where you are; its list of panels is in `src/app/page.tsx`.
- **Smooth paging (desktop):** `src/components/PageScroller.tsx` takes over the wheel, trackpad, arrow / Page / Space keys and in-page links so each gesture glides one panel with a long eased motion (about 1.15 s; tweak `DURATION` and `ease()` there). Trackpad momentum is ignored, so one swipe never skips two panels. It only runs with a mouse/trackpad on screens at least 768×700 and without reduced motion; elsewhere the native snapping applies.
- **Large screens:** the whole layout scales up in steps from 1800px wide, so it fills 2K/4K monitors instead of sitting small in the middle.
- **Motion:** the hero entrance is pure CSS, so it starts before JavaScript loads. Scroll reveals, parallax and the magnetic button use Framer Motion (loaded lazily). All motion respects `prefers-reduced-motion`.
- **Easter egg:** Sam Eyde III's gold SE III monogram (kept in its own gold, as his personal mark) hides in the bottom-right corner of the footer at 12% opacity. Hover over it (or tab to it) and it glows.

### Quality checks (local Lighthouse 12, production build)

| | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| Desktop | 100 | 100 | 100 | 100 |
| Mobile  | 92–99 (varies by run) | 100 | 100 | 100 |

Measured LCP is about 0.26 s, even with 4× CPU throttling. Lighthouse's simulated mobile LCP (~2.9 s) is mostly the React/Next.js runtime that every Next.js app loads. Scores on Vercel's CDN are usually a little higher than on a local server.

---

© 2026 Gleyde Technologies, LLC. All rights reserved. Gleyde Technologies, LLC is owned by Sam Eyde III.
