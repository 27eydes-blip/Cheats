# Morning report: overnight queue

Everything below is merged into the **`nightly`** branch. Each task also has its own branch.
Nothing went to a live site.

## TL;DR

| # | Task | Status | Branch |
|---|------|--------|--------|
| 0 | Finish Desert Mirage (+ e2e suite, settings, credit) | ✅ done | `world/desert-mirage` |
| 1 | Three new brawlers + balance | ✅ done | `task/new-brawlers` |
| 2 | Squad Hunt 3v3 | ✅ done | `task/squad-hunt` |
| 3 | Accounts + progression (D1) | ✅ done | `task/accounts` |
| 4 | Skins, effects, titles, Hunt Pass (test currency) | ✅ done | `task/cosmetics` |
| 5 | Smarter bots | ✅ done | `task/smarter-bots` |
| 6 | Game feel polish | ✅ done | `task/game-feel` |
| + | Map art system (walls, cover, materials) | ✅ done | `map/art-system` |
| + | Performance pass + this report | ✅ done | `task/perf-report` |
| 7 | **Preview deploy** | ⚠️ **blocked**: see below | n/a |

Test suite: **29 Playwright tests pass on Chromium**. They include the headless simulation suites: sim, mirage, brawlers + balance, squad, progression, cosmetics, bots and map art.
- **Firefox and WebKit could not run.** Only Chromium is installed in this environment, and its rules forbid `playwright install`. `playwright.config.js` defines all three browser projects and runs any browser that is installed. **Please run `npm run e2e` on a machine with all three before trusting cross-browser behaviour.**

## What got finished

**Desert Mirage.**
- An e2e lane with a smoke test, Quick Hunt (two clients, one eliminates the other), Free Play handoff (no snap), and Mirage display-order and old-save tests.
- Settings for **Reduce Flashing** (no shake or strobe, steady glows, CSS animations off; it also respects the OS reduced-motion preference) and **Low Graphics** (1× resolution, no shadows, ambient particles, slime animation or ground clutter).
- The **"Created by Sam Eyde III"** credit didn't exist in Hunt, so I added it to the lobby and in-game. A test guards it.

**Task 1: brawlers.**
- **Dune:** a slow sand wave that slows enemies to 60% speed for 1.5s. Super: a sand-worm bursts up under the target after a 0.7s ripple warning.
- **Rook:** thrown mines that arm after 1s, at most 3 out. Armed mines are hidden from enemies until they're within 90 px, which is what makes trapping work. Super: a cage that traps one enemy for 2s.
- **Flicker:** 3000 HP, the fastest brawler (310 speed), a short double slash. Super: teleports behind the nearest visible enemy.

**Task 2: Squad Hunt.**
- Two teams of 3. Kills add `1 + victim bounty` to the team pot, and the stolen bounty leaves the victim's pot.
- The highest pot at 3:00 wins.
- Blue/red rings and health bars, teammates always visible and on the radar, no friendly fire.
- Bots fill the teams. It's in the Quick Hunt pool.

**Task 3: accounts.**
- Every player gets a server-side D1 account; guests just have no credentials. "Save progress" upgrades the same row, so nothing is lost.
- Passwords use PBKDF2-SHA256 (100k iterations, per-user salt). Session tokens are stored only as SHA-256 hashes.
- **Match results are applied on the server** by the match Durable Object: per-brawler trophies (+8 / +4 / −2 / never below 0) and XP and levels.
- Trophy road with a free reward every 100 trophies; claims are checked on the server.
- Cloud sync: progress lives in D1 and refreshes when the app comes back to the foreground. A test covers "log in on a second device".

**Task 4: cosmetics.**
- 12 skins (2 per brawler), 5 kill effects, and 10 titles shown under the player's name.
- A Locker screen, and a 30-tier Hunt Pass with free and premium tracks. Premium costs 950 **Hunt Coins (test)**; the UI says "test currency only, no real money" everywhere.
- Equipped cosmetics are read from your account on the server, so they can't be spoofed through the URL.
- A test proves identical hitboxes, stats and movement with and without skins.

**Task 5: bots.**
- **Fair vision.** Bots only use what a human sees: `canSee` (bushes, cloak, blackout fog) plus public radar pings, remembered as last-known positions. I removed an older leak where mode goals read hidden players' live positions.
- They take cover while reloading, hide in bushes when low, chase high bounties, dodge telegraphed lava, wildfire and worm warnings, avoid visible mines and spiked borders, and use Supers situationally.
- **Easy / normal / hard** levels, chosen from the human players' trophies: under 150 is easy, under 500 normal, otherwise hard. Hard bots beat easy ones 45 of 60 in mirror duels.

**Task 6: game feel.**
- **Original synthesized sound** (Web Audio, no sample files): six weapon voices, hits, hurt, Supers, slam, mine boom, worm, blink, eliminations, a bounty-steal coin arpeggio, pickups, world-event warnings, and victory/defeat jingles.
- Bullet trails, popping damage numbers, a "KO!" pop plus "+★N BOUNTY STOLEN".
- A victory pose (or a sulk) on the end screen, and a **Top Bounty Hunter** MVP banner.
- Shake and flashes are off under Reduce Flashing (tested).

**Map art system.**
- Maps are now built from cover **pieces** (1×1, 2×1, 3×1, 2×2, L3, L4). The drawn cells are exactly the collision cells; a test checks there are no invisible edges.
- One themes file, `public/art/themes.js`: Meadow and Hub use stone (Hub in warm gold and ivory, no spikes), City metal (neon cyan spikes), Wildwood wood (deep red spikes, plus a temple-roof strip along the north edge), Dust Flats and **Desert Mirage** sandstone (deep teal and purple spikes; Mirage adds a shimmer overlay), Frozen Lake ice (white-blue spikes).
- Each material has three looks, painted once into offscreen canvases at 16 art-pixels per cell and drawn nearest-neighbour. The cache holds at most 4 worlds (LRU) and **rebuilds after `contextlost`/`contextrestored`** (tested).
- **Spiked borders** around every map and between Free Play zones (with gaps to walk through) deal 5% max HP with a 1s cooldown. About 1 in 6 cover pieces has a decorative spiked, slimy side.
- Slime drips animate slowly: a steady glow under Reduce Flashing, off in Low Graphics.
- Arenas: 4-fold mirrored, with open middle lanes, **28–38 cover pieces**, 8 bush patches, and **cover near every spawn** (checked on 1,200 generated maps).
- `?mapview=1` (add `&world=<key>` or `&free=1`) shows the whole map with collision boxes and each spawn's cover radius.

**Performance.**
- Fixed the lobby portraits redrawing during matches, which was the biggest waste the profiler found.
- Static ground is now cached in 8×8-tile chunks.
- Added **adaptive resolution**: render resolution steps from 2× down to 1× when frames run long and back up when there's headroom.

## What got skipped or blocked, and why

1. **Preview deploy: blocked.** The Cloudflare credential connected to this session can create and migrate D1 databases, but gets **HTTP 403 on every Worker script endpoint**, so `wrangler deploy` fails at its first request. What's ready:
   - A separate preview Worker config, `wrangler.preview.jsonc` (Worker `hunt-preview`, so it can never collide with a live `hunt` Worker).
   - A real D1 database, `hunt-preview-db` (`cd603982-d837-4ab0-a694-8c027afd9904`), already migrated.
   - **To deploy:** `cd hunt && npx wrangler deploy -c wrangler.preview.jsonc` with a token that has *Workers Scripts: Edit*. It will print `https://hunt-preview.<your-subdomain>.workers.dev`.
2. **Firefox and WebKit:** not installed here (see the top of this report).
3. **"60 fps on iPhone SE": not verifiable from this machine.** There's no GPU and no device, so all numbers below come from software rendering. Please check on a real SE.
4. **Glydrift reference files** (`glydrift/src/pixel/biomeArt.js`, `themes.js`) are not in this repository or anywhere this session can reach. I built the art system from your written spec instead.
5. **Free Play zones are not literally hand-placed.** They're laid out by a fixed-seed generator, identical on every server and client, with designed rules: border gaps, a hub ring and no cover near the hub. Hand-authoring four 40×40 zones is better done with you in the loop.
6. **64 px grid:** the arena stays 2000×2000 as originally specified, so collision stays on the 50-unit grid. The art is authored at 64 px per cell (16 art-pixels at 4×) and drawn into each 50-unit cell.

## Preview URL

None yet: see blocked item 1. It's one command once a token with Workers permission is used.

## Bot balance numbers

Method: 1v1 bot duels between different brawlers, cycling every ordered pair, on random arenas and spawns, with normal bots (`test/balance.js`). Damage was auto-tuned toward 50% (`test/tune.js`) and re-tuned after the new bots and again after the new maps.

**Final, 3,000 duels (about 1,000 per brawler):**

| Brawler | Win rate |
|---|---|
| Volt | 51.7% |
| Brick | 46.6% |
| Wisp | 50.3% |
| Dune | 50.4% |
| Rook | 50.9% |
| Flicker | 50.1% |

All six are inside 45–55%. The `brawlers.test.js` gate (1,800 duels) asserts 45–55% for every brawler.

**About "300 bot matches".** Three separate 300-duel runs (about 100 games per brawler) landed between **39% and 60%**. With only about 100 games each, sampling noise alone is ±5 points, so at that sample size even perfectly balanced brawlers don't reliably stay inside 45–55%. I used the larger samples to decide balance.

**Classic brawlers were changed to reach this balance. Please review:**

| | Before | After |
|---|---|---|
| Volt bolt | 420 | 330 |
| Volt dash | 700 | 550 |
| Brick pellet | 330 | 280 |
| Brick slam | 900 | 770 |
| Wisp shot | 1450 | 1620 |

New brawlers: Dune wave 1010 / worm 1880; Rook mine 1720 / cage 520; Flicker slash 490 ×2.

**Caveat:** this measures bot-vs-bot duels. Human players and 10-player brawls will play out differently.

## Performance (software rendering, no GPU)

Emulated an iPhone SE in landscape (667×375 at 2×) with Chromium's CPU throttled 4×, in a 10-player Bounty Rush match:

| | Before the perf pass | After |
|---|---|---|
| Desert Mirage | 13 fps (79 ms) | **47 fps** (21 ms, p95 33 ms) |
| Wildwood | 20 fps | **55 fps** |
| Low Graphics | 27 fps | **51 fps** |

Adaptive resolution had dropped to 1× in all three runs. A real iPhone draws canvas on the GPU, so it should do better than this, but it still needs checking on a device.

## Screenshots (`hunt/docs/morning/`)

iPhone 13 (landscape) and iPad Pro 11 for each feature:
- Lobby with 6 brawlers and the profile bar: [iPhone](docs/morning/iphone-01-lobby.jpg) · [iPad](docs/morning/ipad-01-lobby.jpg)
- Account / save progress: [iPhone](docs/morning/iphone-02-account.jpg) · [iPad](docs/morning/ipad-02-account.jpg)
- Trophy road: [iPhone](docs/morning/iphone-03-trophy-road.jpg) · [iPad](docs/morning/ipad-03-trophy-road.jpg)
- Locker: [iPhone](docs/morning/iphone-04-locker.jpg) · [iPad](docs/morning/ipad-04-locker.jpg)
- Hunt Pass: [iPhone](docs/morning/iphone-05-hunt-pass.jpg) · [iPad](docs/morning/ipad-05-hunt-pass.jpg)
- New brawlers:
  - Flicker on Mirage: [iPhone](docs/morning/iphone-06-brawler-flicker-mirage.jpg) · [iPad](docs/morning/ipad-06-brawler-flicker-mirage.jpg)
  - Rook on City: [iPhone](docs/morning/iphone-06-brawler-rook-city.jpg) · [iPad](docs/morning/ipad-06-brawler-rook-city.jpg)
  - Dune on Wildwood, with Lava Flow: [iPhone](docs/morning/iphone-06-brawler-dune-forest.jpg) · [iPad](docs/morning/ipad-06-brawler-dune-forest.jpg)
- Squad Hunt: [iPhone](docs/morning/iphone-07-squad-hunt.jpg) · [iPad](docs/morning/ipad-07-squad-hunt.jpg)
- End screen (victory pose, MVP banner, trophy and XP gain): [iPhone](docs/morning/iphone-08-end-screen.jpg) · [iPad](docs/morning/ipad-08-end-screen.jpg)
- Wall art per world:
  - Meadow: [iPhone](docs/morning/iphone-09-art-meadow.jpg) · [iPad](docs/morning/ipad-09-art-meadow.jpg)
  - City: [iPhone](docs/morning/iphone-09-art-city.jpg) · [iPad](docs/morning/ipad-09-art-city.jpg)
  - Wildwood: [iPhone](docs/morning/iphone-09-art-forest.jpg) · [iPad](docs/morning/ipad-09-art-forest.jpg)
  - Dust Flats: [iPhone](docs/morning/iphone-09-art-desert.jpg) · [iPad](docs/morning/ipad-09-art-desert.jpg)
  - Desert Mirage: [iPhone](docs/morning/iphone-09-art-mirage.jpg) · [iPad](docs/morning/ipad-09-art-mirage.jpg)
  - Frozen Lake: [iPhone](docs/morning/iphone-09-art-frozen.jpg) · [iPad](docs/morning/ipad-09-art-frozen.jpg)
- Free Play hub: [iPhone](docs/morning/iphone-10-freeplay-hub.jpg) · [iPad](docs/morning/ipad-10-freeplay-hub.jpg)
- `?mapview=1` for each world: [Meadow](docs/morning/mapview-meadow.jpg) · [City](docs/morning/mapview-city.jpg) · [Wildwood](docs/morning/mapview-forest.jpg) · [Dust Flats](docs/morning/mapview-desert.jpg) · [Desert Mirage](docs/morning/mapview-mirage.jpg) · [Frozen Lake](docs/morning/mapview-frozen.jpg) · [Free Play world](docs/morning/mapview-freeplay-world.jpg)

The screenshots were taken before the final perf pass, which didn't change any visuals.

## Top 5 things to fix or decide next

1. **Deploy the preview and play it on a real iPhone SE and iPad.** Check fps, touch feel and the adaptive-resolution steps. Nothing about real-device performance or touch is proven yet.
2. **Decide on the classic-brawler damage changes.** They were made to balance bot duels, not human play. Also decide whether you want trophy matchmaking (right now trophies only set bot difficulty), and whether rebalancing should eventually come from real match data.
3. **Harden accounts before any public link.**
   - Rate-limit or add bot protection to `/api/register`, `/api/login` and `/api/guest`.
   - Add a cleanup policy for abandoned guest rows; every new browser creates one.
   - Account recovery: there's no email, so a forgotten password means a lost account.
   - Before real Apple payments: move coin grants to server-validated receipts.
4. **Free Play trust and persistence.**
   - Watching a neighbouring zone uses a client-reported position, so a modified client could see players hiding in bushes there.
   - Zones reset when empty.
   - Decide whether the zone layouts should be hand-authored.
5. **CI coverage.** Run the e2e suite on Firefox and WebKit plus a device lab. The free-play border-crossing test needed a sidestep fix tonight because of the new hub pillars; it passed 15/15 afterwards, but keep an eye on it.

## How to run everything

```bash
cd hunt
npm install
npm test                 # headless sims: modes, worlds, brawlers + balance gate, squad, progression, cosmetics, bots
npm run e2e              # Playwright suite (starts wrangler dev on :8788 itself)
node test/balance.js 3000 99    # balance table
node test/tune.js 6             # auto-tune damage toward 50% (prints values, doesn't write them)
npm run dev              # play locally / on your phone (see README)
```

Debug flags:
- `?world=<key>&mode=<mode>&ev=<event>` puts you straight into a match with bots.
- `?mapview=1` shows the whole map with collision boxes.
- `?free=1` goes straight to Free Play.
