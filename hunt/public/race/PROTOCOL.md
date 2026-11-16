# Hunt Racers: engine, server protocol and client API

Everything here is headless and tested (`test/race-*.test.js`). The renderer, HUD, touch controls
and lobby sit on top of `public/race/net.js` (`RaceClient`) and the shared data modules.

## Files

| File | What it is |
| --- | --- |
| `public/race/physics.js` | Car physics shared by server and client: `stepCar`, `DRIVERS` (6 drivers + vehicles), surfaces, drift tiers, boosts, wire packing of the own-car state. |
| `public/race/trackgeom.js` | Track geometry: `buildTrack(def)` -> runtime track with `probe()`, corridors, racing line, gates, grid. |
| `public/race/tracks.js` | Data: 4 tracks + 4 battle arenas. `getTrack(key, arena)`, `TRACK_IDS`, `trackName()`. |
| `public/race/trackcheck.js` | `validateTrack(T)`: proves a layout is raceable (use it while designing). |
| `public/race/items.js` | `ITEMS` (7 pickups), `ITEM_IDS` (wire ids), `ODDS` + `rollItem`, `WEAPONS` (one per driver). |
| `public/race/protocol.js` | Wire constants: `FLAG` bits, `ENT` kinds, `COUNTDOWN`, `RESPAWN_TIME`. |
| `public/race/net.js` | `RaceClient`: connection, lobby, inputs, prediction, interpolation, events, reconnect. |
| `src/race/sim.js` | `RaceSim`: the authoritative race (modes, laps, combat, items, bounty, snapshots). |
| `src/race/bots.js` | Bot drivers (racing line, drifting, shortcuts, items, weapons, 3 difficulty levels). |
| `src/race/room.js` | `/race` route, `RaceMatchmaker` and `RaceRoom` Durable Objects. |
| `src/race/results.js` | Race result -> `applyMatch` (trophies, XP, coins, pass, missions) + best times. |

## Tick rate: 30 Hz

The shooter runs at 20 Hz. Racing cars move 800-1100 px/s; at 20 Hz that is 40-55 px per tick,
which makes the server's view of a drift line coarse and makes reconciliation corrections at
corners visibly larger. 30 Hz halves the travel per tick, and the input -> physics step is one
to one, so the predicted car on the phone and the server car stay within a pixel (the room test
measures the corrections over a 100 ms laggy link: median under 1 px). A full 10-car tick costs
well under 2 ms in Node (asserted in `test/race-bots.test.js`), and snapshots are a few hundred
bytes, so the cost of the higher rate is small.

## Connecting

WebSocket: `wss://<host>/race?<params>`

| Param | Meaning |
| --- | --- |
| `name`, `driver` | display name, driver id (`volt brick wisp dune rook flicker`) |
| `token` | account session token (results are recorded server-side for that account) |
| `mode` | `grand` (default), `elim`, `battle`, `trial` |
| `track` | `desert frozen ashlands neon`, or omit / `any` for random |
| `bots` | `0` = FILL WITH BOTS off (no bot ever joins), anything else = on |
| `room` | friend room code (A-Z 0-9, up to 12). The FIRST player in creates the room and their `mode`, `track`, `bots` and `lobby` win; later joiners' choices are ignored. |
| `lobby` | rooms only: lobby countdown in seconds (1.5-30, default 12) |
| `rejoin`, `secret`, `match` | reconnect to the same car (values from `welcome`) |
| `skip` | public races: a match id not to be put back into |

Public races (no `room`) go through `RaceMatchmaker`: one filling race per (mode, track choice,
bots on/off), so a bots-off player never lands in a race with bots. Bots-off races wait for a
second human. `mode=trial` is always a private solo race (never bots).

Suggested page URLs for the lobby (client side only, the server does not read them):
`/?race=1&room=CODE` to open the race lobby with a friend code.

## Messages: server -> client

All JSON. `t` is the type.

- `welcome` `{id, secret, match, room, mode, track, arena, bots, tick, rejoin?}`. Keep `id`,
  `secret`, `match` for reconnecting.
- `lobby` `{mode, track, arena, players: [[name, driver]...], max, startIn (s or null = waiting), bots}`
  (every 0.5 s and on any change). `startIn` null with bots off means "waiting for another racer".
- `ro` roster `{add: {id: [name, driver, isBot]}, full: 1}`.
- `start` `{you, mode, track, arena, laps, seed, tick: 30, cd: 3, players, botLevel, tm, rejoin?}`.
  The race clock `tm` starts at `-cd`: negative = grid countdown (nothing moves), `GO` at 0.
- `s` snapshot, every tick (30/s):
  - `n` server tick, `tm` race time (s), `ld` leader id (bounty target, 0 = none)
  - `c` cars: `[id, x, y, angle*1000, flags, hp% (0-100), lap, speed]` for every car still in the race
  - `rk` all ids in race order (position 1 first)
  - `e` entities: `[id, kind (ENT index), x, y, angle*1000, ownerId, armed]`
    kinds: `missile rocket oil spikes mine turret bolt`
  - `bx` indices into `track.boxes` that are currently taken (respawn after 3 s)
  - `hz` bitmask of active hazards (bit i = `track.hazards[i]`)
  - `md` mode HUD: grand / trial `{laps, ft: seconds left after the winner finished | null}`,
    elim `{nx: seconds to the next knock-out, left}`, battle `{tl: time left}`
  - `ev` events this tick (only present when there are any), see below
  - `me` your own state:
    `s` packed car state (`STATE_KEYS` order: x y a vx vy drift dc boostT boostP airT spinT spinDir slowT),
    `ack` last input seq applied, `ep` teleport epoch (changes on respawn / blink / rejoin: snap, don't smooth),
    `hp`, `mh` max hp, `it` item (ITEM_IDS index, -1 none), `wc` weapon cooldown left (s),
    `sh` shield left, `em` EMP left, `gh` ghost (respawn protection) left, `lap`, `cp` last checkpoint,
    `rk` position, `rt` respawn countdown (s, 0 = alive), `mc` match coins, `k` takedowns, `d` wrecks,
    `lt` current lap time, `bl` best lap, `fin` finishing place (0 = racing), `out` knocked-out place (elim),
    `auto` 1 = the autopilot drives your car (after you finish)
- `end` `{mode, track, rank, you, n, time, bestLap, mc, k, results}`;
  results rows: `[id, name, driver, rank, finishTime|null, takedowns, matchCoins, isBot, bestLap, finished, wrecks]`, in final order.
- `progress` (after `end`, accounts only) `{delta (trophies), xp, coins, mcoins (match coin payout), levels, progress, best (time trial best for this track), improved}`.
- `retry` `{reason}` (race already started / full), `rejoinfail`, `pong {c}`.

### Events (`ev` rows)

| Row | Meaning |
| --- | --- |
| `['ko', victim, attacker (0 = none), cause]` | wrecked (cause: `missile rocket arc pulse rail mine bolt blink spikes lava geyser arc fall`) |
| `['rs', id]` | back on track after the 2 s wreck |
| `['hit', target, src, kind, dmg]` | damage taken |
| `['shield', id]` | a shield blocked a hit and popped |
| `['steal', attacker, leader, coins]` | BOUNTY: the leader was wrecked, coins stolen, attacker boosted |
| `['lap', id, lapNumberNow, lapTime]`, `['fin', id, place, time]`, `['elim', id, place]` | race progress |
| `['box', id, boxIndex, itemIdx]` | picked up a box (itemIdx -1 = already holding one) |
| `['use', id, itemIdx]` | used an item; `['emp', id]` EMP burst; `['spin', victim, oilOwner]` |
| `['arc', id, targetId]` Volt, `['pulse', id]` Brick, `['rail', id, x0, y0, x1, y1, hitId]` Wisp, `['blink', id, x0, y0, x1, y1]` Flicker | weapon visuals (Dune / Rook show up as `mine` / `turret` entities) |
| `['boom', x, y, entKind]` | projectile / mine explosion |
| `['jump', id]`, `['mt', id, tier]`, `['bump', a, b, speed]` | ramp launch, mini-turbo fired (1 blue, 2 orange, 3 purple), hard car bump |

### Car flags (`FLAG` in protocol.js)

`DRIFT 1, BOOST 2, AIR 4, SHIELD 8, LEADER 16, DEAD 32, SPIN 64, EMP 128, FINISHED 256, OUT 512,
GHOST 1024, SLOW 2048, REVERSE 16384`; drift spark tier = `(f >> 12) & 3` (`driftTierOf(f)`).

## Messages: client -> server

- `{t:'in', s: seq, st: steer -1..1, th: throttle -1..1 (negative = brake, then reverse), dr: 0|1 drift held, f: 1 fire pressed, i: 1 item pressed}`
  one per tick (30/s). `f` / `i` are one-shot presses (send 1 once). The server applies one
  physics step per input, in order, and acknowledges with `me.ack`.
- `{t:'pick', driver}` change driver in the lobby.
- `{t:'ping', c}` -> `pong`. `{t:'bye'}` quit for good (the result is recorded as last place now).

## Client API (`public/race/net.js`)

```js
import { RaceClient } from './race/net.js';
const rc = new RaceClient({ base: location.origin.replace(/^http/, 'ws'),
  params: { name, driver, token, mode, track, bots: botsOn ? 1 : 0, room } });
await rc.connect();
rc.on('lobby', (m) => ...); rc.on('start', ...); rc.on('end', (m) => ...); rc.on('progress', ...); rc.on('failed', ...);

// every animation frame:
rc.setInput({ st, th, dr });          // held controls (th defaults to 1: auto-accelerate)
if (firePressed) rc.fire();           // one-shot
if (itemPressed) rc.useItem();
rc.frame(now);                        // sends inputs at 30 Hz and predicts your car
const v = rc.view(now);               // what to draw
for (const e of rc.drainEvents()) ...  // effects, sounds, kill feed
```

`view()` returns `{tick, time, countdown, cars, ents, boxesOff, hazardsOn, leader, ranks, hud, me}`:

- `cars`: `{id, x, y, a, f, hp, lap, spd, me}`. Other cars are interpolated 100 ms in the past
  (`INTERP_TICKS = 3`); your own car is predicted (`predicted: true`, plus `drift`, `boost`, `air`)
  with corrections eased out over ~150 ms. While wrecked, finished (autopilot) or knocked out, your
  car is shown from the server like the others.
- `ents`: `{id, kind, x, y, a, owner, armed}`.
- `me`: the server `me` fields plus `item` (id string or null) and `leader` (you have the bounty).
- `rc.roster` (Map id -> `{name, driver, bot}`), `rc.T` (the built track), `rc.lobby`, `rc.start`,
  `rc.results` (`end` message), `rc.progress`, `rc.phase` (`connecting lobby race end failed idle`).
- `rc.pick(driver)` in the lobby, `rc.leave()` to quit.
- A dropped socket mid-race reconnects automatically (3 tries) to the same car.

Controls the spec asks for (map them to `setInput` / `fire` / `useItem`):
touch (landscape) left-thumb horizontal stick -> `st`; accelerate is automatic (`th: 1`), the
BRAKE/REVERSE button sets `th: -1`; DRIFT (hold) -> `dr: 1`; FIRE -> `fire()`; ITEM -> `useItem()`.
Desktop by `event.code`: ArrowLeft/KeyA, ArrowRight/KeyD steer; ArrowUp/KeyW throttle;
ArrowDown/KeyS brake/reverse; ShiftLeft/ShiftRight/Space drift; KeyJ / mouse 0 fire; KeyK / mouse 2 item.

## Drawing a track (`rc.T`, or `getTrack(key, arena)`)

- Track (`T.kind === 'track'`): `T.corridors[0]` is the closed main loop, the rest are shortcuts
  (open, `name`, `needsBoost`). Each corridor has typed arrays `px, py` (centre line samples, 32 px
  apart), `hw` (road half-width), `ww` (wall half-width: road + shoulder), `tx, ty` (tangent), `s`
  (arc length), `n`, `surf` (road surface), `shoulder` (shoulder surface), `zones` and `line`
  (racing line `x, y`, for a ghost / debug).
  Painter's order draws the union correctly: 1) every corridor as a thick stroke of width `2*ww + wall`
  in the wall colour, 2) every corridor at `2*ww` in its shoulder colour, 3) every corridor at `2*hw`
  in its surface colour, 4) zones on top. Pre-render this into chunked offscreen canvases once.
- `zones`: `{kind: 'surf' | 'pad' | 'ramp', surf, s0, s1, d0, d1, x, y, a, c}`: a span along the
  corridor (`s0..s1` px) and across it (`d0..d1` px, + is right of the driving direction; full width
  when huge). Use `pointAt(corridor, s, d)` from trackgeom.js to outline them. `pit` = a gap
  (falling in wrecks you), `lava` hurts fast, `ice` slides, `sand`/`snow`/`offroad` slow.
- `T.gates` checkpoints `{k, x0, y0, x1, y1, s, a}` (k = 0 is the start/finish line), `T.grid` (10 start
  slots `{x, y, a}`), `T.boxes` item boxes `{x, y}`, `T.hazards` timed dangers
  `{kind: 'geyser' | 'arc', x, y, r, period, on, phase}` (active per `hz`), `T.obstacles` pillars
  `{x, y, r}`, `T.bounds`, `T.L` lap length (px).
- Arena (`T.kind === 'arena'`): `T.box` `{x0, y0, x1, y1}` walls, `T.surf`, `T.circles` round zones
  `{x, y, r, kind, surf}`, `T.obstacles`, `T.boxes`, `T.grid` spawns, `T.hazards`.
- Minimap: main loop `px/py`, cars from `view().cars`, the leader (`view().leader`) highlighted
  for everyone (bounty).
- Drift sparks: tier 1 blue, 2 orange, 3 purple (from `driftTierOf(flags)` / own `car.dc`).

## Lobby data

- Modes: `RACE_MODES` / `RACE_MODE_IDS` in `protocol.js` (`name`, `desc`, rules):
  Grand Race (3 laps, finish order), Elimination Race (last place out every 18 s from 30 s),
  Battle Arena (most takedowns in 2 minutes, respawns), Time Trial (solo, best time saved).
- Tracks: `TRACK_IDS`, `TRACK_DEFS[k].name`, `ARENA_DEFS[k].name` (`trackName(k, arena)`).
- Drivers: `DRIVERS[id]` (`name, car, role, top, accel, handling, armor, color, accent`) and
  `WEAPONS[id]` (`name, desc, cd`). Items: `ITEMS[id]` (`name, desc`).
- Account: `progress.race.best[track]` (best Time Trial time, s), `progress.race.bestLap[track]`,
  `progress.race.races / wins / trials`; per-mode stats in `progress.modes.race_<mode>`.
- The FILL WITH BOTS toggle maps to `bots=0|1`; the friend room code to `room=CODE`.

## Rules worth knowing (server-enforced)

- Laps count only through the checkpoints in order; driving back over the last gate takes it back.
- A wrecked car is back exactly 2 s (60 ticks) later just past its last checkpoint, lap kept,
  with 1.5 s of ghosting (no hits, no bumps).
- Bounty: the leader (race position 1; in Battle the top scorer with a takedown) is flagged
  `LEADER`. Wrecking them steals half their match coins and gives you a boost.
- Match coins: +1 item box, +2 lap, +3 takedown, + steals. Paid into the account at the end (capped at 40).
- Items roll by position: leaders get defensive items, the back of the pack the catch-up ones.
- Grand Race ends 30 s after the winner crosses the line (5 s if only bots are still racing), or
  when everyone is in, or at 5 minutes.
- Remember the credit: "Created by Sam Eyde III" must stay visible in the race screens too.

## Tests

`node test/race-physics.test.js` (determinism, drift tiers, surfaces, walls, ramps, bumps),
`race-tracks` (validator on every track and arena), `race-sim` (laps, anti-cut, respawn, items,
weapons, bounty), `race-modes` (all 4 modes, bots on/off), `race-bots` (every driver laps every
track, 10-bot races finish, 2 ms tick budget), `race-results` (progression), `race-room` (the
Durable Objects end to end with two `RaceClient`s over a laggy link; harness in
`test/race-harness.js`).

## Race client (what the player sees): `public/race/app.js`

```js
import { startRace } from './race/app.js';
const race = startRace({ mode, track, driver, room, bots, token, name, lobby, best, onExit: ({ left }) => showLobby() });
```

One call opens a full-screen race layer (its own canvas, the pre-race card, pause menu, finish
screen and the "Created by Sam Eyde III" credit on top of everything) and calls `onExit` when the
player picks LOBBY / LEAVE RACE / CANCEL. RACE AGAIN restarts with the same options. `best` (optional)
is the Time Trial best for the HUD. Files: `render.js` (camera, world), `trackart.js` (chunked track
art, 4 themes), `cars.js` (6 vehicles, sprite cache), `fx.js` (particles, tire marks, effects),
`hud.js`, `controls.js` (touch by identifier, keys by event.code, mouse, gamepad; left-handed
mirror from the existing setting), `sound.js`, `race.css`.

Temporary entry until the new lobby lands: `/?race=1[&mode=&track=&room=&bots=0|1&driver=]`.
Local dev only (HUNT_DEV): `laps=1..3` for short room races, and `window.__race.dev('wreck' | 'item', id)`.
`window.__race` also exposes `perf()`, `layout()`, `hint()` and `auto()` for the browser tests.
