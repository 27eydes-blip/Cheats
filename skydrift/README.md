# Skydrift Isles (working title)

A free daily "rare answer" game set in a floating sky archipelago. Everyone gets the same 7 playful prompts each day,
25 seconds each. Any valid answer counts, but **the fewer players who gave it, the more points it's worth** (0–100 per
prompt, 700 a day). Points lift your glider through Cloud Meadows → Storm Reefs → Aurora Peaks → Star Harbor.

- **Client:** vanilla JS ES modules + CSS, no build step (`public/`)
- **Server:** one Cloudflare Worker (`src/worker.js`) + a D1 (SQLite) database (`migrations/`)
- Same stack as `hunt/` in this repo, so it deploys the same way.

## Run it locally

```bash
cd skydrift
npm install
cp .dev.vars.example .dev.vars   # sets ADMIN_TOKEN=skydrift-dev for local admin
npm run dev                      # applies DB migrations, then serves http://localhost:8788
```

- Game: http://localhost:8788
- Admin: http://localhost:8788/admin.html (token: `skydrift-dev`)
- Tests: `npm test` (answer matching, scoring, and a lint of every prompt's answer list)

To try it on your phone, use your computer's LAN IP (`http://192.168.x.x:8788`; dev binds to `0.0.0.0`).

To reset your local game: clear site data in the browser (the profile lives in localStorage) and delete
`skydrift/.wrangler/state` to wipe the local database, then run `npm run dev` again.

## Deploy (Cloudflare Workers, free plan is fine)

```bash
cd skydrift
npx wrangler login
npx wrangler d1 create skydrift-db          # copy the database_id it prints into wrangler.jsonc
npx wrangler secret put ADMIN_TOKEN         # choose a long random admin password
npm run deploy                               # migrates the remote DB, then deploys
```

You get `https://skydrift-isles.<your-subdomain>.workers.dev`. Add a custom domain in the Cloudflare dashboard
(Workers → skydrift-isles → Settings → Domains). Then set `GLYDRIFT_URL` in `public/config.js` to Glydrift's real link.

## How it works

### Daily loop
1. `GET /api/day?date=YYYY-MM-DD&player=…` returns the 7 prompt texts (never the answers) and anything this
   player already answered, so a refresh resumes where they left off. The 25-second clock is wall-clock based and
   survives reloads, so refreshing can't buy extra time.
2. `POST /api/answer` validates on the server with fuzzy matching. Unrecognised answers let the player try again
   while time remains, and are logged as **misses** for the admin page. A recognised answer is scored, stored once
   per player per prompt, and its count is bumped.
3. After the 7th prompt the results screen shows the layer reached, the emoji card, each answer's score, and the
   most common answer for each prompt (`GET /api/stats`, only available once you've finished, so no spoilers).

Players use their **local** date (like Wordle). The server accepts dates within a day of UTC.

### Rarity and scoring (`public/shared/score.js`)
- Each listed answer has an estimated "% of players who'd say it". Until real data arrives, rarity is that estimate.
- Real answers blend in: `share = (100 × estimate + real count) / (100 + real players)`. So the estimates count as
  100 virtual players and real data takes over as the day fills up.
- Points: `100 − 17 × log2(1 + share%)`, min 5 for any valid answer. Roughly: 0.3% → 94, 1% → 83, 3% → 66,
  7% → 49, 15% → 32, 30% → 16.
- Points are locked in at the moment you answer.
- Tiers: Legendary 90+ 🌟, Rare 75+ 🟪, Uncommon 50+ 🟦, Common 🟩, timed out ☁️.

### Answer matching (`public/shared/match.js`)
Ignores case, accents, punctuation, plurals, and leading "a/the/my". It also handles spacing ("sea weed" =
"seaweed"), small typos (1 edit for 5–7 letters, 2 for 8–12, 3 for longer), and answers wrapped in a few extra
words ("a really spiky cactus" → Cactus). The admin page uses the same code to test answers live.

### Collection and retention
- **Rare answer (75+)** → a map fragment. There are 4 charts, one per sky layer, with 6 fragments each.
- **Legendary answer (90+)** → befriend a sky creature (12 to find).
- Streak creatures join at 3, 7, 14 and 30 days. Pip the Cloud Puff joins on your first flight.
- Daily streak counter, and a shareable emoji card (Web Share on phones, clipboard on desktop).

The profile lives in localStorage under an anonymous id and is mirrored to the `players` table (`/api/profile`).

### Admin (`/admin.html`)
Pick any date and write its 7 prompts and answer lists, one answer per line:

```
Canonical answer | alias, alias, common misspelling | 4.5
```

The side panel shows each answer's estimated %, real count, and the points it's worth right now. It also has a live
"test an answer" box and the list of misses (answers players typed that weren't recognised) with one-click **Add**.
Saved days override the seed days. A date with nothing saved replays one of the seed days, so the game never
goes dark.

### Monetization stubs
- **Ads:** `.ad-slot` placeholders on home (320×50) and results (300×250). They're hidden for Unlimited Skies owners.
  To go live, drop your ad network's tag into those elements.
- **Unlimited Skies ($4.99):** the checkout is a stub. `POST /api/purchase` sets `players.premium = 1` without
  charging anything. To make it real, replace that endpoint with Stripe Checkout plus a webhook that flips `premium`
  after payment, and add account sign-in or a restore code so the purchase follows the player across devices.
  It unlocks practice mode, 3 themed packs (`src/content/packs.js`), Past Skies replays, and removes ads.
- **Glydrift promo** card after every daily result (`public/config.js` → `GLYDRIFT_URL`).

## The sky level's look (variations)

The sky behind every screen is painted on two `<canvas>` layers by `public/js/sky.js`, from procedurally painted
sprites made by `public/js/paint.js`. There are no image files to supply: islands, clouds, ruins, moons and the
ringed planet are all generated in code, painted once into offscreen canvases and reused every frame.

**Three variations** live in `public/themes.js`. They share one art direction (mythic, painterly, one light source)
and differ in palette, light, sky feature and island culture:

| Variation | Light | Sky feature | Islands | Atmosphere |
|---|---|---|---|---|
| `golden` Golden Ruins | low sun, from the right | floating temple city with twin waterfalls | sandstone, marble ruins, arches, statues | pollen, falling leaves, a distant flock |
| `twilight` Twilight Mythic | twin moons, from the right | a sky whale drifting far away | slate, rune stones, lanterns, shrines | glowing spores, a starry sky |
| `ember` Ember Dusk | low red sun, from the right | a giant ringed planet, black spires | basalt, carved pillars, chains, braziers | embers and ash, winged drakes far off |

**Switching:**
- The one setting: `ACTIVE_THEME` at the top of `public/themes.js`.
- To compare live (temporary): add `?theme=twilight` to the URL (`#theme-twilight` in the artifact), press **T** /
  **Shift+T** to cycle, **P** or the 🎨 button for the picker panel, `?alt=500` to preview a point in the climb.

**Readability rules** (checked by `test/themes.test.js`): the glider keeps 3:1 contrast against sky, clouds and rock
in every variation at every altitude (two-tone outline, rim light, soft cast shadow); UI panels are opaque parchment
(text and the red "wrong answer" hint at 4.5:1 or better); text drawn on the sky carries a halo; particle counts are
capped and there are no flashing effects.

**Performance:** sprites are baked lazily in idle time; canvases are backed at devicePixelRatio (capped at 2) and
everything is blitted 1:1 at whole-device-pixel positions, so nothing blurs. The loop draws at 60 fps while the sky is
climbing and 30 fps when idle, and steps the resolution down (2x, then 1.5x, then 1.25x with half the particles) if
frames run long. `skyStats()` exported from `js/sky.js` reports draws and average draw time.

**After choosing a variation:** delete `public/js/theme-picker.js`, its two lines in `public/js/app.js`
(marked TEMPORARY) and the `THEME PICKER` block at the end of `public/style.css`, set `ACTIVE_THEME`, and either delete
the other entries in `THEMES` or keep them as unlockable backgrounds.

## Project layout

```
skydrift/
├─ wrangler.jsonc            Worker + D1 + static assets config
├─ migrations/0001_init.sql  days, submissions, answer_counts, misses, players
├─ src/
│  ├─ worker.js              API (player, practice, purchase stub, admin)
│  └─ content/
│     ├─ seed-days.js        Days 1–3 (Nov 15–17, 2026), 7 prompts each with answer lists
│     └─ packs.js            Unlimited Skies practice packs
├─ public/
│  ├─ index.html, style.css  the game
│  ├─ admin.html             prompt editor
│  ├─ config.js              Glydrift link, share URL, price
│  ├─ themes.js              sky variations + the ACTIVE_THEME setting
│  ├─ shared/                match.js + score.js, used by both browser and Worker
│  ├─ js/                    app.js (flow), sky.js (canvas sky renderer), paint.js (procedural painting),
│  │                         theme-picker.js (temporary), audio.js (synth SFX), collection.js, profile.js, admin.js
│  └─ art/                   SE III logo, glider, icon (all SVG)
└─ test/                     match.test.js, themes.test.js
```

## Credits
© 2026 Sam Eyde III. All rights reserved. A Gleyde Technologies, LLC game. Produced by Juwon Shon, COO.
