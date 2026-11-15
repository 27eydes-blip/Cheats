# Hunt

A real-time multiplayer top-down brawler for phones (landscape) and desktop.
Free-for-all showdown for up to 10 players: last one standing wins.

- **Client:** HTML5 canvas + vanilla JS ES modules, no build step (`public/`)
- **Server:** Cloudflare Worker + one Durable Object per match, WebSockets (`src/`)
- **Netcode:** server-authoritative at 20 ticks/s. Clients send only inputs. Your own player is predicted locally and reconciled against the server. Everyone else is interpolated about 110 ms behind. Your own bullets are drawn the moment you fire.

## Run it locally

```bash
cd hunt
npm install
npm run dev            # wrangler dev --ip 0.0.0.0 --port 8787
```

Open http://localhost:8787 on desktop. Controls: **WASD** to move, **mouse** to aim, **click or Space** to fire, **E or right-click** for super.

## Test on your phone(s) with `wrangler dev`

1. Put your computer and phone(s) on the **same Wi-Fi**.
2. Run `npm run dev`. It binds to `0.0.0.0`, so other devices on your network can reach it.
3. Find your computer's LAN IP:
   - macOS: `ipconfig getifaddr en0`
   - Windows: `ipconfig` (look for the IPv4 address)
   - Linux: `hostname -I`
4. On each phone, open `http://<that-ip>:8787`, for example `http://192.168.1.23:8787`.
   - If it doesn't load, allow incoming connections for `node`/`workerd` in your computer's firewall. macOS asks the first time.
5. On **both** phones open **FRIENDS**, enter the **same room code** (for example `FRIENDS`), and tap **PLAY**. The first one in is the host: the room plays the mode they picked, and they press **START** when everyone is there. In Squad Hunt the friends play on the same team.
   - To test phone vs phone without bots, the host switches **Fill with bots** off in the room before pressing START (the room starts with the host's **FILL WITH BOTS** choice from the PLAY page).
   - A friend who enters the code while the room is mid-match waits and joins the room's next match.
   - Without a room code, **FILL WITH BOTS** on the PLAY page works for public matches too: with it off, quick play puts you in a humans-only queue and the match waits until a second hunter joins (or you CANCEL).
   - With no room code and bots on you go into quick play: anyone who presses Play within about 7 seconds lands in the same match, and bots fill the empty slots.
6. Turn the phones sideways. Left thumb moves. Right thumb drags to aim and fires on release. A quick tap auto-aims at the nearest enemy. The **SUPER** button charges as your hits land; drag it to aim, or tap it to auto-aim.

Tips:
- Android Chrome goes fullscreen and locks to landscape when you press Play. iOS Safari can't do that from a web page, so use **Share → Add to Home Screen** and launch from the icon to get fullscreen.
- To play over mobile data, or on networks that block LAN traffic, either deploy (below) or tunnel your dev server: `npx cloudflared tunnel --url http://localhost:8787`. That gives you an `https://….trycloudflare.com` URL, and WebSockets switch to `wss://` automatically.

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

Durable Objects are declared as SQLite-backed classes, so this works on the Workers free plan.

## Game content

**Twists (all modes)**
- **Bounty:** each kill gives +1 bounty plus everything the victim was carrying. Higher bounty means a stronger glow and more frequent pings on everyone's radar. The top bounty holder is shown on screen with a 👑.
- **Lay Low:** after 5s in a bush, your glow and radar pings fade out over the next 5s.
- **Shrink & Speed:** the lower your HP, the smaller your hitbox and the faster you move. Dropping under 25% HP gives you a short speed rush and +15% damage.

**Environment events** (every 30s, with a 5s warning) live in `public/events/`, one file each: walls, overgrowth, wildfire, lava, ice, blackout, supply drop, low gravity, wind. To add one, create a module there and list it in `public/events/index.js`. The comment at the top of that file documents the hooks.

**Quick Hunt modes** (`src/modes.js`): Showdown, Bounty Rush, Hunted, Crystal Grab, played on a random arena from the pool. Squad Hunt (3v3) and Big Hunt (20 players) are played only when you pick them.

**Rewards** (`public/progression.js` `PAY`): match XP and coins are mostly paid per minute played, so every mode earns about the same per minute. Trophy Road, Hunt Pass and level rewards are earned, never sold; claiming one you already own gives coins instead.

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

### Test flags
- `?world=mirage` drops you straight into a Desert Mirage arena with bots. Add `&mode=showdown|bounty|hunted|crystals` to pick the mode, and `&ev=lava|wildfire|wind|…` to force that event every cycle, starting at 8s.
- `?free=1` puts you straight into Free Play.

## Tests

```bash
npm test                       # every test/*.test.js: sims for every mode and world, balance gates, accounts, deploy config
npm run e2e                    # Playwright browser suite (starts its own wrangler dev on :8788) plus the same node suites
npm run dev &                  # then, against the running worker:
BOTS=0 node test/ws.test.js    # two WebSocket clients; one hunts the other until eliminated
```

The browser suite runs on every Playwright browser that is installed (Chromium, Firefox, WebKit). WebKit is the closest stand-in for iPhone Safari: `npx playwright test --project=webkit`. CI (`.github/workflows/hunt.yml`) runs `npm test` and the suite on Chromium and WebKit for every push or pull request that touches `hunt/`.
