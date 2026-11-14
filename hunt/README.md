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
5. On **both** phones, enter the **same room code** (for example `FRIENDS`), pick a brawler, and tap **PLAY**.
   - To test the first milestone without bots (phone vs phone 1v1), **untick "Fill empty slots with bots"** before pressing Play.
   - With no room code you go into quick play: anyone who presses Play within about 7 seconds lands in the same match, and bots fill the empty slots.
6. Turn the phones sideways. Left thumb moves. Right thumb drags to aim and fires on release. A quick tap auto-aims at the nearest enemy. The **SUPER** button charges as your hits land; drag it to aim, or tap it to auto-aim.

Tips:
- Android Chrome goes fullscreen and locks to landscape when you press Play. iOS Safari can't do that from a web page, so use **Share → Add to Home Screen** and launch from the icon to get fullscreen.
- To play over mobile data, or on networks that block LAN traffic, either deploy (below) or tunnel your dev server: `npx cloudflared tunnel --url http://localhost:8787`. That gives you an `https://….trycloudflare.com` URL, and WebSockets switch to `wss://` automatically.

## Deploy

```bash
npx wrangler login
npm run deploy         # → https://hunt.<your-subdomain>.workers.dev
```

Durable Objects are declared as SQLite-backed classes, so this works on the Workers free plan.

## Game content

**Twists (all modes)**
- **Bounty:** each kill gives +1 bounty plus everything the victim was carrying. Higher bounty means a stronger glow and more frequent pings on everyone's radar. The top bounty holder is shown on screen with a 👑.
- **Lay Low:** after 5s in a bush, your glow and radar pings fade out over the next 5s.
- **Shrink & Speed:** the lower your HP, the smaller your hitbox and the faster you move. Dropping under 25% HP gives you a short speed rush and +15% damage.

**Environment events** (every 30s, with a 5s warning) live in `public/events/`, one file each: walls, overgrowth, wildfire, lava, ice, blackout, supply drop, low gravity, wind. To add one, create a module there and list it in `public/events/index.js`. The comment at the top of that file documents the hooks.

**Quick Hunt modes** (`src/modes.js`): Showdown, Bounty Rush, Hunted, Crystal Grab, played on a random arena from the pool.

**Free Play:** a 4000×4000 world made of 4 zones, each its own Durable Object: Neon City (NW), Wildwood (NE), **Desert Mirage (SE)** and Frozen Lake (SW). A safe hub where the zones meet is where you change brawler and see who's online. When you walk across a zone border, your player is handed off to the next zone's Durable Object. Your client already has that zone's socket open as an observer, and it gets promoted, so there's no loading screen. Bullets that cross a border carry on in the next zone, and kill and bounty credit is sent back to the shooter's zone.

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
npm test                       # headless sims: every mode × every world, twists, zone handoff, cross-zone combat, Desert Mirage
npm run dev &                  # then, against the running worker:
BOTS=0 node test/ws.test.js    # two WebSocket clients; one hunts the other until eliminated
```
