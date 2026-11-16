# Oblivion GP

**OBLIVION GP** (Grand Prix): a real-time top-down combat racer for phones (landscape) and desktop. Up to 10
racers drive, drift and fight on the same track: pick a driver, grab item boxes, fire your car's
own weapon, and wreck the leader to steal their bounty.

- **Client:** HTML5 canvas + vanilla JS ES modules, no build step (`public/`, racing in `public/race/`)
- **Server:** Cloudflare Worker + one Durable Object per race (`RaceRoom`) and a matchmaker (`RaceMatchmaker`), WebSockets (`src/race/`)
- **Netcode:** server-authoritative at 30 ticks/s. Clients send only inputs. Your own car is predicted with the same physics code the server runs (`public/race/physics.js`) and reconciled against the server. Other cars are interpolated about 100 ms behind. Details: `public/race/PROTOCOL.md`.

Created by Sam Eyde III.

The game used to be called Hunt (then Hunt Racers). Players only ever see **Oblivion GP**; the
internal names stay `hunt` on purpose: the Cloudflare Worker, the live link
https://hunt.27eydes.workers.dev/, the D1 database and bindings, localStorage keys, account
fields and URL parameters, so every save, account and link keeps working. The player-facing names
live in `public/brand/name.js`; the wordmark and app icon are drawn in code
(`public/brand/wordmark.js`, `scripts/brand-icon.mjs`, `scripts/brand-wordmark.mjs`).

## How to play

1. Open the game. The **PLAY** page is the lobby: pick a **mode**, a **track** (or Random), and whether to **FILL WITH BOTS**.
2. Tap your car to open **DRIVERS**: each driver has their own car (speed, acceleration, handling, armor) and a built-in weapon.
3. Tap **PLAY**. With bots on you are racing within a few seconds; with bots off the race waits for a second human.
4. Race! Three laps through every checkpoint in order. Your result pays out trophies, XP, coins, GP Pass XP and daily missions, and your best laps are saved on your **PROFILE**.

### Controls

| | Phone (landscape) | Desktop |
|---|---|---|
| Steer | left thumb, slide left / right | ←/→ or A/D |
| Accelerate | automatic | ↑ or W |
| Brake / reverse | **BRAKE** button | ↓ or S |
| Drift (hold) | **DRIFT** button | Shift or Space |
| Car weapon | **FIRE** button | J or left mouse |
| Use item | **ITEM** button | K or right mouse |
| Pause | ❚❚ button (top right) | Esc |

Keys are bound by position (`event.code`), so they work on AZERTY and other layouts. A gamepad works
too. Settings has a left-handed layout (buttons on the left, steering on the right).

**Drifting:** hold DRIFT through a bend. Sparks turn blue, then orange, then purple; let go for a
mini-turbo that gets stronger with each colour. **Boost pads** give a burst of speed, **ramps** throw
you into the air (you can't steer, and nothing on the ground can hit you), and every track has a
**shortcut** (narrow, risky, some only make it with a boost).

**Wrecked?** You are back on the track 2 seconds later at your last checkpoint, laps kept, with a
moment of protection.

**Bounty:** the race leader glows gold and shows on everyone's minimap. Wreck them to steal half
their match coins and get a boost.

### Modes

| Mode | Rules |
|---|---|
| **Grand Race** | 3 laps, finish order. |
| **Elimination Race** | Last place is knocked out every 18 seconds (from 30 s) until one is left. |
| **Battle Arena** | A closed arena: most takedowns in 2 minutes wins. Items, weapons and respawns. |
| **Time Trial** | Just you and the clock (never bots). Your best time per track is saved to your account. |

### Tracks

| Track | Twist | Battle arena |
|---|---|---|
| **Desert Mirage Canyon** | sand traps, canyon jumps, the Canyon Cut shortcut | Mirage Bowl |
| **Frozen Lake Circuit** | low-grip ice sections, the Thin Ice shortcut | Icebreak Rink |
| **Ashlands Inferno** | lava edges and geysers, the Lava Leap (needs a boost) | Cinder Pit |
| **Neon City Night** | tight neon corners, the Back Alley shortcut | Rooftop Grid |

### Drivers and items

| Driver | Car | Role | Weapon |
|---|---|---|---|
| Volt | Static Comet | All-rounder | Tesla Arc: zaps the nearest racer ahead and slows them |
| Brick | Iron Mule | Heavy | Shock Bumper: a shockwave that shoves everyone close |
| Wisp | Ghostline | Speed | Rail Lance: a long beam straight ahead |
| Dune | Dust Strider | Off-road | Sand Mines: drops mines behind you |
| Rook | Bastion | Defender | Sentry Turret: a turret that fires at racers near it |
| Flicker | Quickstitch | Handling | Blink Slash: blinks forward, slicing anyone in the way |

Item boxes (they come back a few seconds after you take one) give one of: Homing Missile, Oil
Slick, Shield, Rocket Volley, EMP Blast, Turbo, Spike Strip. The further back you are, the better
the odds of a catch-up item.

## Run it locally

```bash
cd hunt
npm install
npm run dev            # wrangler dev --ip 0.0.0.0 --port 8787
```

Open http://localhost:8787 on desktop.

## Race your friends (phones) with `wrangler dev`

1. Put your computer and phone(s) on the **same Wi-Fi**.
2. Run `npm run dev`. It binds to `0.0.0.0`, so other devices on your network can reach it.
3. Find your computer's LAN IP:
   - macOS: `ipconfig getifaddr en0`
   - Windows: `ipconfig` (look for the IPv4 address)
   - Linux: `hostname -I`
4. On each phone, open `http://<that-ip>:8787`, for example `http://192.168.1.23:8787`.
   - If it doesn't load, allow incoming connections for `node`/`workerd` in your computer's firewall. macOS asks the first time.
5. On **both** phones open **FRIENDS**, enter the **same room code** and tap **GO**. The first one in is the **host**: the room races the mode and track they picked, with their **FILL WITH BOTS** choice, and they press **START** on the room card when everyone is there. The room code and **COPY** (an invite link, `/?room=CODE`) stay on the card the whole time.
   - The host can switch FILL WITH BOTS on or off on the room card before pressing START. Off = just the friends in the room.
   - A friend who joins while the room is mid-race waits on the room card and joins the next race.
   - **RACE AGAIN** on the finish screen goes back into the same room; the last race's host is host again.
   - Without a room code, PLAY puts you in a public race for your mode and track. With FILL WITH BOTS off you only ever meet humans (the race waits for a second one).
6. Turn the phones sideways and race.

Tips:
- Android Chrome goes fullscreen and locks to landscape when you press PLAY. iOS Safari can't do that from a web page, so use **Share → Add to Home Screen** and launch from the icon to get fullscreen.
- To play over mobile data, or on networks that block LAN traffic, either deploy (below) or tunnel your dev server: `npx cloudflared tunnel --url http://localhost:8787`. That gives you an `https://….trycloudflare.com` URL, and WebSockets switch to `wss://` automatically.

### Links

- `/?room=CODE`: a friend's invite, straight into that race room.
- `/?race=1&mode=grand|elim|battle|trial&track=desert|frozen|ashlands|neon&bots=0|1&room=CODE&driver=volt`: straight into a race with those options (back to the lobby when you leave).
- Local dev only (`HUNT_DEV`): `&laps=1` for short races (works on `/?laps=1` too), `&lobby=<s>` for a fixed room countdown instead of the host's START.

## Deploy

Production is the Cloudflare Worker named `hunt`. Its config is `wrangler.preview.jsonc` (real D1 database, Workers Logs on, no dev flags). Cloudflare Workers Builds deploys it on every push to `main` with `npx wrangler deploy -c wrangler.preview.jsonc`. To deploy by hand, run the same thing:

```bash
npx wrangler login
npm run deploy                              # wrangler deploy -c wrangler.preview.jsonc
npm run deploy -- --dry-run                 # build and check the config without uploading
```

- `wrangler.jsonc` is for **local dev and tests only**. It sets `HUNT_DEV=1`, which turns on test-only URL flags (any weapon, power, gadget or spawn point), and points at a local placeholder database. Never deploy it: `test/deploy.test.js` fails if the dev flag ever reaches the production config or if the two configs drift apart.
- A hand deploy does not stamp a build id (only Workers Builds sets `WORKERS_CI`). Run `node scripts/stamp-version.mjs --force` first so open tabs notice the new version, and do not commit the stamped `public/version.js`.
- Server errors are logged as one line each, starting with `hunt-error` (what failed, where, mode or zone, build id; never names or tokens). Find them in the Cloudflare dashboard under the Worker's **Logs**, or live with `npx wrangler tail hunt`.

Durable Objects are declared as SQLite-backed classes, so this works on the Workers free plan. Racing adds `RaceRoom` (binding `RACE`) and `RaceMatchmaker` (binding `RACEMM`) in migration `v3`, in both configs. Migrations are append-only: add a new tag, never edit an old one.

## Classic mode (the shooter)

The game started (as Hunt) as a top-down brawler (Showdown, Bounty Rush, Hunted, Crystal Grab, Squad Hunt, Big
Hunt, Free Play, Test Range). Its code is still here (`src/sim.js`, `src/modes.js`, `public/game.js`
and friends) and fully tested, but the lobby no longer offers it. It is reachable only by link:
`/?shooter=1` opens the classic lobby, and the test flags below drop you straight into a match.
Classic controls: **WASD** to move, **mouse** to aim, **click or Space** to fire, **E or right-click** for super.

**Twists (all modes)**
- **Bounty:** each kill gives +1 bounty plus everything the victim was carrying. Higher bounty means a stronger glow and more frequent pings on everyone's radar. The top bounty holder is shown on screen with a 👑.
- **Lay Low:** after 5s in a bush, your glow and radar pings fade out over the next 5s.
- **Shrink & Speed:** the lower your HP, the smaller your hitbox and the faster you move. Dropping under 25% HP gives you a short speed rush and +15% damage.

**Environment events** (every 30s, with a 5s warning) live in `public/events/`, one file each: walls, overgrowth, wildfire, lava, ice, blackout, supply drop, low gravity, wind. To add one, create a module there and list it in `public/events/index.js`. The comment at the top of that file documents the hooks.

**Quick Hunt modes** (`src/modes.js`): Showdown, Bounty Rush, Hunted, Crystal Grab, played on a random arena from the pool. Squad Hunt (3v3) and Big Hunt (20 players) are played only when you pick them.

**Rewards** (`public/progression.js` `PAY`): match XP and coins are mostly paid per minute played, so every mode earns about the same per minute. Trophy Road, GP Pass and level rewards are earned, never sold; claiming one you already own gives coins instead.

**Free Play:** a 20000×20000 world made of 9 zones in a 3×3 grid (`ZONES` in `public/shared.js`), each its own Durable Object: Neon City, Ruined Citadel, Wildwood, The Hollow, The Hub, Ashlands, Frozen Lake, Dead Marsh and **Desert Mirage**. The safe hub in the middle is where you change brawler and see who's online. When you walk across a zone border, your player is handed off to the next zone's Durable Object. Your client already has that zone's socket open as an observer, and it gets promoted, so there's no loading screen. Bullets that cross a border carry on in the next zone, and kill and bounty credit is sent back to the shooter's zone.

**Worlds** (`WORLDS` in `public/shared.js`): a world's ID is its index in that list, and per-world stats are saved by ID. **Only ever append** to the list. `order` controls display order.

| id | world | display order |
|----|-------|---------------|
| 0 | Meadow | 1 |
| 1 | Neon City | 2 |
| 2 | Wildwood | 3 |
| 5 | **Desert Mirage** | 4 |
| 3 | Dust Flats | 5 |
| 4 | Frozen Lake | 6 |

### Classic test flags
- `?world=mirage` drops you straight into a Desert Mirage arena with bots. Add `&mode=showdown|bounty|hunted|crystals` to pick the mode, and `&ev=lava|wildfire|wind|…` to force that event every cycle, starting at 8s.
- `?free=1` puts you straight into Free Play.

## Tests

```bash
npm test                       # every test/*.test.js: race physics, tracks, sim, modes, bots, rooms, results; shooter sims and balance gates; accounts; deploy config
npm run e2e                    # Playwright browser suite (starts its own wrangler dev on :8788) plus the same node suites
npm run dev &                  # then, against the running worker:
BOTS=0 node test/ws.test.js    # two WebSocket clients; one hunts the other until eliminated
```

The browser suite runs on every Playwright browser that is installed (Chromium, Firefox, WebKit). WebKit is the closest stand-in for iPhone Safari: `npx playwright test --project=webkit`. CI (`.github/workflows/hunt.yml`) runs `npm test` and the suite on Chromium and WebKit for every push or pull request that touches `hunt/`.

Racing browser specs: `tests/e2e/race-phones.spec.js` (two phones join one room through the lobby and race by touch, bots on and off), `race-perf.spec.js` (frame rate at 667×375 with 4× CPU throttle), `race-desktop.spec.js` (keys), `race-credit.spec.js`, and the phone layout audit `overnight-lobby-audit.spec.js` (every racing and classic lobby screen). Specs for the classic lobby open it with `/?shooter=1`.
