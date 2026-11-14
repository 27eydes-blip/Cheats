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

## Tests

```bash
npm test                       # headless 10-player match in Node (sim only)
npm run dev &                  # then, against the running worker:
BOTS=0 node test/ws.test.js    # two WebSocket clients; one hunts the other until eliminated
```

## How it works

```
public/
  shared.js   constants, brawler stats, seeded mirrored map generator, circle-vs-tile collision.
              Imported by BOTH server and client so prediction matches the server exactly.
  game.js     lobby UI, socket protocol, prediction/reconciliation, interpolation, effects, HUD
  input.js    floating twin-stick touch controls, super button, keyboard/mouse
  render.js   all canvas drawing (characters are drawn in code, so there are no image assets)
src/
  worker.js   routes /ws → Matchmaker DO (quick play) or room:<CODE> → MatchRoom DO
  match.js    the authoritative simulation (movement, bullets, hits, supers, poison, cubes, placement)
  bots.js     bot brains: target, strafe, lead shots, loot crates/cubes, flee poison, use supers
```

**Protocol (JSON over WebSocket).**
- Client to server: `{t:'in', s:seq, mx,my (move), ax,ay (facing), f:angle|null (fire), u:angle|null (super)}`, sent 20 times a second.
- Server to client: `welcome`, `lobby` (countdown and player list), `start` (map seed and roster), `s` (per-player snapshot: your state plus the last acknowledged input seq, visible enemies, bullets, cubes, crate changes, poison inset, effects), `kill`, `dead` (your placement), `end` (full results).

**Visibility is enforced on the server.** Enemies hidden in bushes, or cloaked Wisps, are never sent to your client unless you're close (170 px for bushes, 110 px for cloak). The server also throttles inputs per tick, so a modified client can't speed-hack.

## Tuning knobs

Most balance values live at the top of `public/shared.js`: brawler HP, speed, damage, range, reload and super cost; poison start (60 s) and close time; crate HP; power-cube bonus; and regen. Bot aggression is set in `src/bots.js` (`sight`, `fireCd`, `skill`).
