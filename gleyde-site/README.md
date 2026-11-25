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
- **Motion:** the hero entrance is pure CSS, so it starts before JavaScript loads. Scroll reveals, parallax, hairline dividers and magnetic buttons use Framer Motion (loaded lazily). All motion respects `prefers-reduced-motion`.
- **Easter egg:** Sam Eyde III's gold SE III monogram (kept in its own gold, as his personal mark) hides in the bottom-right corner of the footer at 12% opacity. Hover over it (or tab to it) and it glows.

### Quality checks (local Lighthouse 12, production build)

| | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| Desktop | 100 | 100 | 100 | 100 |
| Mobile  | 92–99 (varies by run) | 100 | 100 | 100 |

Measured LCP is about 0.26 s, even with 4× CPU throttling. Lighthouse's simulated mobile LCP (~2.9 s) is mostly the React/Next.js runtime that every Next.js app loads. Scores on Vercel's CDN are usually a little higher than on a local server.

---

© 2026 Gleyde Technologies, LLC. All rights reserved. Gleyde Technologies, LLC is owned by Sam Eyde III.
