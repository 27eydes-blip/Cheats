# Hunt Racers: engine, server protocol and client API

Everything here is headless and tested (`test/race-*.test.js`). The renderer, HUD, touch controls
and lobby sit on top of `public/race/net.js` (`RaceClient`) and the shared data modules.

## Files

| File | What it is |
| --- | --- |
| `public/race/physics.js` | Car physics shared by server and client: `stepCar`, `DRIVERS` (6 drivers + vehicles), surfaces, drift tiers, boosts, wire packing of the own-car state. |
| `public/race/trackgeom.js` | Track geometry: `buildTrack(def)` -> runtime track with `probe()`, corridors, racing line, gates, grid. |
| `public/race/tracks.js` | Data: 4 clear tracks + 4 open battle arenas. `getTrack(key, arena)`, `TRACK_IDS`, `trackName()`. |
| `public/race/trackcheck.js` | `validateTrack(T)`: proves a layout is raceable (use it while designing). |
| `public/race/items.js` | `ITEMS` (12 pickups, levels 1-3: `itemStat(id, lvl)`), `ITEM_IDS` (wire ids), `ODDS` + `rollItem`, `WEAPONS` (one per driver), `COMBAT` (protection, combos, dodge). |
| `public/race/elim.js` | Client: Elimination's black hole (cached sprites), the racer in danger (outline, ring, DANGER tag), dark edges + warning near the hole, spectator header. |
| `public/race/weapons-fx.js` | Client: `combatBus` (hit / explode / pickup / lockon / dodge / takedown / hitstop hooks), item art, arming pulse. |
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
| `name`, `driver` | display name, driver id (starters `volt brick wisp dune rook flicker`; unlockable `void fang frost grav vx redline helix prime`: the server checks the account's unlocks, see **Unlockable cars**) |
| `token` | account session token (results are recorded server-side for that account) |
| `mode` | `grand` (default), `elim`, `battle`, `trial`, `tutorial` (the first-race tutorial: see below) |
| `track` | `desert frozen ashlands neon`, or omit / `any` for random |
| `bots` | `0` = FILL WITH BOTS off (no bot ever joins), anything else = on |
| `room` | friend room code (A-Z 0-9, up to 12). The FIRST player in creates the room and is its host: their `mode`, `track`, `bots` win (later joiners' choices are ignored) and they press START. The room keeps these between races; the last race's host (matched by `token`, else by name) gets the room back. A friend who joins mid-race gets `roomwait` and is seated in the next race. |
| `lobby` | rooms only: a fixed lobby countdown in seconds (1.5-30) instead of the host's START (tests, scripts) |
| `rejoin`, `secret`, `match` | reconnect to the same car (values from `welcome`) |
| `skip` | public races: a match id not to be put back into |
| `sens` | steering sensitivity 0.5..1.5 (default 1, the `raceSens` setting): scales the joystick heading turn rate on the server; the prediction uses the same value (`params.sens`) |

Public races (no `room`) go through `RaceMatchmaker`: one filling race per (mode, track choice,
bots on/off), so a bots-off player never lands in a race with bots. Bots-off races wait for a
second human. `mode=trial` is always a private solo race (never bots). `mode=tutorial` is always a
private solo run on the training track (`track` and `room` are ignored), see **Tutorial**.

Page URLs (client side only, the server does not read them): `/?room=CODE` is a friend's invite
(straight into that race room); `/?race=1&mode=&track=&room=&bots=0|1&driver=` opens a race with those options.

## Messages: server -> client

All JSON. `t` is the type.

- `welcome` `{id, secret, match, room, mode, track, arena, bots, tick, rejoin?}`. Keep `id`,
  `secret`, `match` for reconnecting.
- `lobby` `{mode, track, arena, players: [[name, driver]...], max, startIn (s or null = waiting), bots}`
  (every 0.5 s and on any change). `startIn` null with bots off means "waiting for another racer".
  Host-run rooms add `host` (the host's id), `ids` (player ids, same order as `players`) and `can`
  (START would work now); their `startIn` stays null until the last minute of the 5-minute idle safety net.
- `roomwait` `{room, mode, track, left (s, battle only), players}`: a friend room is mid-race; this
  socket is seated in its next race (a `welcome` + `lobby` follow). Every 2 s while waiting.
- `ro` roster `{add: {id: [name, driver, isBot, cos]}, full: 1}`. `cos` = the racer's equipped store
  cosmetics for that car (`public/race/garage.js` `SLOTS` order: skin glow wheel flame trail horn; `0` = the
  car's default; the whole field is `0` for guests and bots). Draw-only: resolve with `resolveCos(cos, driver)`
  and `makeLook(driver, opts)` (looks.js). A row without `full` updates single racers (an account that loaded
  after the start).
- `start` `{you, mode, track, arena, laps, seed, tick: 30, cd: 3, players, botLevel, tm, rejoin?}`.
  The race clock `tm` starts at `-cd`: negative = grid countdown (nothing moves), `GO` at 0.
- `s` snapshot, every tick (30/s):
  - `n` server tick, `tm` race time (s), `ld` leader id (bounty target, 0 = none)
  - `c` cars: `[id, x, y, angle*1000, flags, hp% (0-100), lap, speed, stuck]` for every car still in the race
    (`stuck`: seconds this car has been stuck, 1 decimal, 0 when free: show RESET pulsing from ~1 s)
  - `rk` all ids in race order (position 1 first)
  - `e` entities: `[id, kind (ENT index), x, y, angle*1000, ownerId, armed, level (1-3), target]`
    kinds: `missile rocket oil spikes mine turret bolt well sticky drone trap`. `armed`: mine / oil /
    spikes / trap done arming (draw them blinking until then), well landed, sticky bomb stuck on a car.
    `target`: who a missile / drone is locked on to (LOCK-ON warning when it is you), or who carries a
    sticky bomb (draw it on that car); 0 = none
  - `bx` indices into `track.boxes` that are currently taken (respawn after 3 s)
  - `hz` bitmask of active hazards (bit i = `track.hazards[i]`)
  - `md` mode HUD: grand / trial `{laps, ft: seconds left after the winner finished | null}`,
    elim `{nx: seconds to the next cut, left, iv: the running timer's length (s), dg: the racer in danger (last place, 0 = none), bh: the black hole's race distance (px, the scale of race progress; draw it at that arc length mod `T.L` on the main loop), bv: its speed (px/s), duel: 1 = the final two}`, battle `{tl: time left}`,
    tutorial `{tut: the step to do now ('steer' 'drift' 'item' 'fire', 'done' at the end), tl: time left}`
  - `ev` events this tick (only present when there are any), see below
  - `me` your own state:
    `s` packed car state (`STATE_KEYS` order: x y a vx vy drift dc boostT boostP airT spinT spinDir slowT),
    `ack` last input seq applied, `ep` teleport epoch (changes on respawn / blink / rejoin: snap, don't smooth),
    `hp`, `mh` max hp, `it` item (ITEM_IDS index, -1 none), `il` its level (1-3, 0 none), `pr` hit protection left (s), `ph` Ghost Mode left (s), `wc` weapon cooldown left (s),
    `sh` shield left, `em` EMP left, `gh` ghost (respawn protection) left, `lap`, `cp` last checkpoint,
    `rk` position, `rt` respawn countdown (s, 0 = alive), `mc` match coins, `k` takedowns, `d` wrecks,
    `lt` current lap time, `bl` best lap, `fin` finishing place (0 = racing), `out` knocked-out place (elim),
    `auto` 1 = the autopilot drives your car (after you finish), `stuck` seconds stuck (as in `c`),
    `rcd` RESET cooldown left (s, 0 = RESET works now), `bg` (Elimination) your lead on the black hole (px; the warning starts at 900)
- `end` `{mode, track, rank, you, n, time, bestLap, mc, k, results, tut? (tutorial: 1 = completed)}`;
  results rows: `[id, name, driver, rank, finishTime|null, takedowns, matchCoins, isBot, bestLap, finished, wrecks]`, in final order.
- `progress` (after `end`, accounts only) `{delta (trophies), xp, coins, mcoins (match coin payout), levels, progress, best (time trial best for this track), improved, tut? (tutorial: the account's flag, 1 = done)}`.
- `retry` `{reason}` (race already started / full), `rejoinfail`, `pong {c}`.
- `car` `{driver, want, reason: 'locked'}`: the car asked for (at the join or with `pick`) is locked on this account (or the account had not loaded when the race started): you race in `driver` (the account's default car).
- `progress` also carries `unlocked: [car ids]` (cars this race unlocked) and `pieces: {pieces, to, coins}` (car pieces won).

### Events (`ev` rows)

| Row | Meaning |
| --- | --- |
| `['ko', victim, attacker (0 = none), cause]` | wrecked (cause: `missile rocket arc pulse rail mine bolt blink spikes lava geyser arc fall`) |
| `['rs', id]` | back on track after the 2 s wreck |
| `['hit', target, src, kind, dmg, big]` | damage taken (`big` 1 = a big hit: the car spins out; show an explosion, hit-stop) |
| `['shield', id]` | a shield blocked a hit and popped |
| `['steal', attacker, leader, coins]` | BOUNTY: the leader was wrecked, coins stolen, attacker boosted |
| `['lap', id, lapNumberNow, lapTime]`, `['fin', id, place, time]`, `['elim', id, place, cause, x, y]` | race progress (`elim` cause: `cut` `hole` `left`; x, y: where the car was, it leaves the snapshots now) |
| `['duel', id1, id2]` | Elimination: two racers left, the FINAL DUEL (once) |
| `['burst', id, 'ko' \| 'danger']` | Elimination: the 2 s takedown boost (a knock-out, or a hit on the racer in danger) |
| `['emo', id, k]` | a spectator's emote (`EMOTES[k]` in protocol.js: GG, WOW, GO GO, SO CLOSE) |
| `['box', id, boxIndex, itemIdx, level, up]` | picked up a box (itemIdx -1 = nothing new; `up` 1 = the held item levelled up to `level`) |
| `['use', id, itemIdx, level]` | used an item; `['emp', id, level]` EMP burst; `['spin', victim, oilOwner]` |
| `['lock', target, owner, entId, 'missile' \| 'drone']` | a homing missile / drone locked on (warn the target) |
| `['dodge', id, entId]` | `id` pressed DRIFT in time and shook the missile |
| `['chain', owner, id1, id2, ...]` | Chain Lightning, hop by hop (no ids = nobody in reach) |
| `['combo', owner, 'emp', victim]`, `['combo', owner, 'trap', x, y]` | EMP + missile bonus damage; oil + spikes merged into a trap |
| `['stick', carrier, owner, entId]`, `['pass', from, to, entId]`, `['fizzle', entId, carrierId]` | sticky bomb stuck, passed on by a bump, shaken off / gone |
| `['swat', id, entId]` | `id` fired their weapon and swatted the drone chasing them |
| `['unghost', id]` | an EMP knocked `id` out of Ghost Mode |
| `['arc', id, targetId]` Volt, `['pulse', id]` Brick, `['rail', id, x0, y0, x1, y1, hitId]` Wisp, `['blink', id, x0, y0, x1, y1]` Flicker | weapon visuals (Dune / Rook show up as `mine` / `turret` entities) |
| `['boom', x, y, entKind]` | projectile / mine explosion |
| `['jump', id]`, `['mt', id, tier]`, `['bump', a, b, speed]` | ramp launch, mini-turbo fired (1 blue, 2 orange, 3 purple), hard car bump |
| `['horn', id]` | a racer sounded their horn (play their equipped horn, quieter with distance) |
| `['perk', id, 'magnet', boxIndex]`, `['perk', id, 'phase']`, `['perk', id, 'grip']` | unlockable car perks: GRAVITON pulled a box in, PHANTOM VX phased through a hit, FROSTBYTE rolled over oil |
| `{k: 'reset', id, auto}` | the car was put back on the racing line (RESET button: `auto` 0; stuck 3 s: `auto` 1). Flash / sound it. |
| `{k: 'nudge', id}` | the car was pinned against a wall for 1.5 s and got pushed back toward the racing line |
| `{k: 'tut', id, step}` | tutorial: `step` (`steer` `drift` `item` `fire`) was just done; `done` follows the last one |

The rows above are arrays (`e[0]` is the kind); the `reset`, `nudge` and `tut` events are objects with
`k` (as agreed for the controls work), so test `Array.isArray(e) ? e[0] : e.k`.

### Car flags (`FLAG` in protocol.js)

`DRIFT 1, BOOST 2, AIR 4, SHIELD 8, LEADER 16, DEAD 32, SPIN 64, EMP 128, FINISHED 256, OUT 512,
GHOST 1024, SLOW 2048, REVERSE 16384, BRAKE 32768, PHASE 65536 (Ghost Mode item), PROT 131072 (2 s hit protection)`; drift spark tier = `(f >> 12) & 3` (`driftTierOf(f)`).
`BRAKE`: the car's throttle input is on the brake (`th < 0`) while it still rolls forward (> 40 px/s): draw-only,
for brake lights. A pure function of the input and the car state, so it is deterministic like the rest.

## Messages: client -> server

- `{t:'in', s: seq, st: steer -1..1, th: throttle -1..1 (negative = brake, then reverse), dr: 0|1 drift held, f: 1 fire pressed, i: 1 item pressed, ha?, hm?}`
  one per tick (30/s). `f` / `i` are one-shot presses (send 1 once). The server applies one
  physics step per input, in order, and acknowledges with `me.ack`.
  Joystick steering: `ha` = target heading (radians, WORLD frame, same convention as the car angle;
  in the Top-down camera the stick's screen direction is the world direction; the rotating Chase /
  Cockpit cameras convert the stick's screen direction to the world with their current heading, see
  `camera.js`, so the wire value is always world frame) and `hm` = stick
  magnitude 0..1 (already multiplied by the sensitivity, clamped to 1). With `ha` present and
  `hm > 0.15` the physics turns the nose toward `ha` (shortest way, rate proportional to the error so it
  never overshoots, capped by `hm`, the speed-based turn rate and `sens`) and ignores `st`.
  Without `ha` (keys, gamepad, bots) `st` steers exactly as before.
- `{t:'reset'}` RESET: back on the racing line at your place in the race (never behind your last
  checkpoint), facing along the track, stopped, ghosted for 1 s. One every 3 s (`me.rcd`); ignored
  on the grid, in the air, wrecked or finished. The server also resets a car stuck for 3 s by itself.
- `{t:'pick', driver}` change driver in the lobby.
- `{t:'horn'}` sound your horn (races only; at most one every 1.5 s, `rc.horn()`).
- `{t:'emote', e: 0..3}` Elimination spectators only (knocked out): an emote for everyone (one every 1.5 s).
- `{t:'host', start: 1}` / `{t:'host', bots: true|false}` the room host's START and FILL WITH BOTS (`rc.host({start, bots})`); anyone else is ignored.
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
rc.setInput({ ha, hm });              // joystick: target heading + magnitude (ha: null = back to st)
if (resetPressed) rc.reset();         // RESET button (me.rcd = cooldown left, me.stuck = seconds stuck)
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

`params.sens` (0.5..1.5) goes to the server as the `sens` join param and the prediction steers with
it too, so pass the same value you scale `hm` with.

Controls the spec asks for (map them to `setInput` / `fire` / `useItem`):
touch (landscape): an always-drawn joystick under the left thumb points where the car should go
on screen (stick up = forward in Chase / Cockpit; in Top-down its screen direction is the world heading)
-> `ha` (radians, world frame after the camera conversion) + `hm`
(0..1, times the Steering sensitivity setting), plus the equivalent `st` for a server without `ha`
steering; accelerate is automatic (`th: 1`), the BRAKE/REVERSE button sets `th: -1`; DRIFT (hold) ->
`dr: 1`; FIRE -> `fire()`; ITEM -> `useItem()`; RESET (top right, pulses when `stuck` > 1 s; key R)
-> `{t:'reset'}`. Left-handed (Settings) swaps the joystick and the thumb buttons. The race join
sends `sens` (Settings, 0.5-1.5). The first race from the lobby runs `mode=tutorial` first
(`public/race/tutorial.js` shows the step prompts from the server's `tut` events; SKIP always on screen).
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
- `zones`: `{kind: 'surf' | 'paint' | 'pad' | 'ramp', surf, s0, s1, d0, d1, x, y, a, c}`: a span along the
  corridor (`s0..s1` px) and across it (`d0..d1` px, + is right of the driving direction; full width
  when huge). Use `pointAt(corridor, s, d)` from trackgeom.js to outline them. `pit` = a gap
  (falling in wrecks you), `lava` hurts fast, `ice` slides, `sand`/`snow`/`offroad` slow. `paint` = a
  themed patch drawn as `surf` that drives like road; a corridor's `look` is how it is drawn (its `surf`
  is how it drives). CLEAR TRACKS: the 4 tracks and their arenas have no obstacles, no hazards, no
  `surf` zones or circles and roads at least `MIN_HW` (shortcuts `MIN_SC_HW`) half-wide; `validateTrack`
  (trackcheck.js) enforces it and `test/race-cleartracks.test.js` laps every track with a bot and a
  human-style joystick driver. The engine keeps hazards / obstacles (the tutorial's cones), so `hz` is 0.
- `T.gates` checkpoints `{k, x0, y0, x1, y1, s, a}` (k = 0 is the start/finish line), `T.grid` (10 start
  slots `{x, y, a}`), `T.boxes` item boxes `{x, y}`, `T.hazards` timed dangers
  `{kind: 'geyser' | 'arc', x, y, r, period, on, phase}` (active per `hz`), `T.obstacles` pillars
  `{x, y, r, cone?}` (`cone: 1` = a traffic cone on the training track: draw it as a cone), `T.bounds`,
  `T.L` lap length (px).
- The training track: `getTrack('tutorial')` (`TUTORIAL_DEF` in tracks.js, not in `TRACK_IDS`),
  `trackName('tutorial')` = Training Track, world `desert`.
- Arena (`T.kind === 'arena'`): `T.box` `{x0, y0, x1, y1}` walls, `T.surf`, `T.circles` round zones
  `{x, y, r, kind, surf}`, `T.obstacles`, `T.boxes`, `T.grid` spawns, `T.hazards`.
- Minimap: main loop `px/py`, cars from `view().cars`, the leader (`view().leader`) highlighted
  for everyone (bounty).
- Drift sparks: tier 1 blue, 2 orange, 3 purple (from `driftTierOf(flags)` / own `car.dc`).

## Lobby data

- Modes: `RACE_MODES` / `RACE_MODE_IDS` in `protocol.js` (`name`, `desc`, rules):
  Grand Race (3 laps, finish order), Elimination Race (cuts from 25 s, a black hole: see Elimination),
  Battle Arena (most takedowns in 2 minutes, respawns), Time Trial (solo, best time saved).
- Tracks: `TRACK_IDS`, `TRACK_DEFS[k].name`, `ARENA_DEFS[k].name` (`trackName(k, arena)`).
- Drivers: `DRIVERS[id]` (`name, car, role, top, accel, handling, armor, color, accent`) and
  `WEAPONS[id]` (`name, desc, cd`). Items: `ITEMS[id]` (`name, desc`).
- Account: `progress.race.best[track]` (best Time Trial time, s), `progress.race.bestLap[track]`,
  `progress.race.races / wins / trials`, `progress.race.tut` (1 = tutorial completed); per-mode stats in `progress.modes.race_<mode>`.
- The FILL WITH BOTS toggle maps to `bots=0|1`; the friend room code to `room=CODE`.

## Elimination (`mode=elim`)

Server-authoritative and deterministic (`src/race/sim.js` `elimTick`, numbers in `ELIM` in protocol.js;
`test/race-elim.test.js`, `test/race-elim-client.test.js`, `tests/e2e/overnight-elim.spec.js`).

- **Cuts**: last place is cut at 25 s, then every 18 s; from 4 racers left every 12 s; with 2 left (the
  FINAL DUEL) every 8 s. The interval is picked at each cut for the racers left after it
  (`elimInterval`, `elimSchedule(10)` = 25 43 61 79 97 115 127 139 147). When the black hole (or a
  quitter) takes racers, the running timer is cut down to the interval for the field that is left. A
  race that starts with 2 racers opens as the duel, but its first cut is still at 25 s.
- **The racer in danger** (`md.dg`) is last place: red outline (pulsing, steady with Reduce Flashing),
  a ring that empties to the cut (`md.nx / md.iv`) and a DANGER tag, until the cut.
- **Black hole** (`md.bh`): it starts 1200 px behind the back of the grid, eases up to speed over the
  first 4 s, moves at 430 px/s + 30 per cut (max 760), is never more than 1500 px behind the last racer
  (it follows the pack), and swallows any car whose race distance is within 120 px of it, wrecked or not.
  It never takes the last racer: if it reaches everyone left, the best placed survives and wins. Clients
  darken the screen edges and play a warning pulse from 900 px (`me.bg`). In Elimination a wreck comes
  back where it crashed (on the racing line), not at the last checkpoint behind the hole.
- **Order inside a tick**: quitters (bots off) are out, worst first; then the hole moves and swallows,
  worst first; then the cut takes last place; then the timer shrinks; then the danger and the duel.
- **Tie at a cut**: positions compare race distance to the pixel; level racers are ordered by the
  previous tick's order (the one who was behind stays behind), then the higher id (the later grid
  slot) is behind. Two racers swallowed on the same tick get distinct places by the same order.
- **Takedown boost**: knocking a car out, or landing a hit (damage or a spin-out) on the racer in danger,
  gives a 2 s burst (`burst` event).
- **Disconnects**: a dropped racer's car is driven by a bot when FILL WITH BOTS is on (it stops when bots
  are off); the cuts run on time either way. Reconnecting after being cut = spectating (`me.out` = place).
  Quitting for good (`bye`) with bots off puts you out at once; with bots on a bot drives on. A
  spectator who leaves keeps their settled place. The race ends when one racer is left, or when every
  human has left.
- **Spectating**: the camera follows the leader; 4 emotes, LEAVE and NEXT RACE (a fresh race with the
  same choices).
- **Rewards** (`src/race/results.js`): the usual placement pay (trophies and coins by place, XP and coins
  for the minutes survived), + 2 coins per takedown (max 8), + 1 coin per 10 s survived (max 15), and the
  cosmetic title **Last Racer Standing** (`last_racer`, earned with a win, never sold) once; wins count in
  `progress.race.elimWins`. The `progress` message carries `elim: {ko, surv, secs, win, title, titleId}`.
- **Final duel**: FINAL DUEL banner and a short slow-mo of the cut that made it (presentation only:
  shorter for the two still driving). The results screen replays the final cut (black hole included).
- **Bots** (only with FILL WITH BOTS on): flat out when they are in the last two with a cut under 7 s
  away or the hole within 1100 px (and use a turbo at once), take shortcuts more often then, and aim
  their weapon and items at the racer in danger when within 1500 px.
- Dev (HUNT_DEV): `{t:'dev', k:'cut'}` (knock yourself out), `k:'cutnow'` (the next cut now),
  `k:'hole', gap` (the black hole `gap` px behind you).

## Tutorial (`mode=tutorial`)

A private solo run on the training track (no bots; one parked target car named Target to shoot),
3 s countdown, then the steps in order: `steer` (through the cone slalom on the first straight),
`drift` (charge a drift to the first spark tier: the long curve after the cones is made for it),
`item` (hold an item: drive through the row of boxes on the back straight), `fire` (fire your
weapon), then `done` and the run ends (`end` with `tut: 1`). The current step is in `md.tut`; every
step done is a `{k:'tut', id, step}` event. Time limit 3 minutes. No trophies, XP, coins or race
stats: a completed run only sets `progress.race.tut = 1` on the account (once). SKIP is the
client's: leave (`rc.leave()`) and set a local flag.

## Rules worth knowing (server-enforced)

- Laps count only through the checkpoints in order; driving back over the last gate takes it back.
- A wrecked car is back exactly 2 s (60 ticks) later just past its last checkpoint, lap kept,
  with 1.5 s of ghosting (no hits, no bumps).
- Bounty: the leader (race position 1; in Battle the top scorer with a takedown) is flagged
  `LEADER`. Wrecking them steals half their match coins and gives you a boost.
- Match coins: +1 item box, +2 lap, +3 takedown, + steals. Paid into the account at the end (capped at 40).
- Items roll by position: leaders get defensive items, the back of the pack the catch-up ones.
  Holding an item, a box that rolls the same item levels it up (max 3; the held item is 5x as likely).
- WEAPONS (two slots: the built-in weapon on FIRE, one pickup on ITEM): 12 pickups with levels,
  lock-on + drift dodge, arming traps, combos, big hits, 2 s protection after a rival's hit. Every
  item and its counter: COMBAT.md "Oblivion GP weapons". Dev (HUNT_DEV): `{t:'dev', k:'item', item, lv}`,
  `{t:'dev', k:'aim', item, lv}` (the nearest racer uses that item now, homing ones at you).
- Grand Race ends 30 s after the winner crosses the line (5 s if only bots are still racing), or
  when everyone is in, or at 5 minutes.
- Walls: hitting one takes away the speed into the wall and keeps the speed along it (the car
  slides on); a hit costs at most 12% of that (once per hit, a scrape costs nothing more), and a car
  pressed nose-first into a wall turns along it. Throttle is full again the moment the car is free.
- Never stuck: "stuck" = touching a wall (or wedged against a pillar or a car), slower than 60 px/s,
  throttle on; or no progress along the track for 3 s (not counted in the air, wrecked, finished or
  on the grid). Pinned for 1.5 s: a nudge (`nudge` event) toward the racing line, facing along the
  track, rolling. Stuck for 3 s: an automatic reset (`reset` event, `auto: 1`).
- Remember the credit: "Made by Gleyde Technologies" must stay visible in the race screens too.

## Tests

`node test/race-physics.test.js` (determinism, drift tiers, surfaces, walls, ramps, bumps),
`race-steer` (joystick heading steering, sensitivity, the unchanged `st` path, forgiving drifts),
`race-walls` (every track's walls, pillars and corners: moving again within 2 s; scraping; nudge,
auto-reset, RESET button; 10-bot races never stuck over 3 s), `race-tutorial` (the training track,
the steps in order, the one-time flag, joystick prediction end to end),
`race-tracks` (validator on every track and arena), `race-sim` (laps, anti-cut, respawn, items,
weapons, bounty), `race-modes` (all 4 modes, bots on/off), `race-bots` (every driver laps every
track, 10-bot races finish, 2 ms tick budget), `race-results` (progression), `race-room` (the
Durable Objects end to end with two `RaceClient`s over a laggy link; harness in
`test/race-harness.js`). `race-weapons` (the 12 pickups, levels, counters, combos, protection,
bots), `race-items-balance` (300 head-to-head 1v1 races per item, 45-55%).

## Race client (what the player sees): `public/race/app.js`

```js
import { startRace } from './race/app.js';
const race = startRace({ mode, track, driver, room, bots, token, name, lobby, best, onExit: ({ left }) => showLobby() });
```

One call opens a full-screen race layer (its own canvas, the pre-race card, pause menu, finish
screen and the "Made by Gleyde Technologies" credit on top of everything) and calls `onExit` when the
player picks LOBBY / LEAVE RACE / CANCEL. RACE AGAIN restarts with the same options. `best` (optional)
is the Time Trial best for the HUD. Files: `render.js` (world, camera transform), `camera.js` (the Chase /
Top-down / Cockpit views: rotation, CSS tilt, lean, boost kick, speed zoom, stick -> world heading),
`speedfx.js` (speed lines, edge blur, wind streaks, road glints, the cockpit bonnet), `haptics.js`
(navigator.vibrate patterns, a no-op where the browser has none, e.g. iPhone Safari), `audio-mix.js` (race
music: final-lap layer, crash duck), `moments.js` + `replay.js` (replay recorder, slow-mo after a
last-second overtake, crash replay on the results screen, pass-by whooshes, grid revs: presentation
only), `trackart.js` (chunked track
art, 4 themes), `cars.js` (6 vehicles, sprite cache), `fx.js` (particles, tire marks, effects),
`hud.js`, `controls.js` (touch by identifier, keys by event.code, mouse, gamepad; left-handed
mirror from the existing setting), `sound.js`, `race.css`.

The lobby (`public/ui/lobby.js`, PLAY page + `public/ui/screens.js` driver select, track picker,
RACE WITH FRIENDS) calls `startRace` through `launchRace` in `public/game.js`. Deep link:
`/?race=1[&mode=&track=&room=&bots=0|1&driver=]`. `onProgress(m)` gets the server's `progress`
message (the lobby stores the new account progress), `onBots(on)` the host's room switch.
Local dev only (HUNT_DEV): `laps=1..3` for short races (also `/?laps=1` from the lobby), and `window.__race.dev('wreck' | 'item', id)`.
`window.__race` also exposes `elim()` (danger, timer, black hole, duel, spectating) and `emote(k)`, `perf()`, `layout()`, `hint()` (`ha`: the stick's screen direction, `wha`: the world
heading), `camera()` / `setCamera()`, `moments()` / `slowmo()`, `audio()` and `auto()` for the browser tests.

Camera views (Settings > Camera, `raceView`: `top` default, `chase`, `cockpit`; also the pause menu's CAMERA
button): the world canvas is drawn rotated (car pointing up) and tilted with a CSS 3D transform; the HUD,
minimap (north-up, your arrow shows your heading), joystick and buttons are on a second, never-tilted canvas
on top that takes the touches. No tilt / motion steering anywhere: the joystick is the only steering input
and the game never listens to device motion or asks for that permission (`test/race-nomotion.test.js`).

## Unlockable cars (Oblivion GP Part 4)

`public/race/unlocks.js` (shared, server-authoritative): 8 new driver ids with stats and one perk
each in `NEW_DRIVERS` (physics.js; `DRIVER_IDS` stays the six starters, `ALL_DRIVER_IDS` is all 14,
bots drive the starters), built-in weapons in `WEAPONS` (items.js, `kind` = arc pulse rail mine
turret blink), looks / engine voices in looks2.js / cars2.js / sound2.js.

- Unlocks live in `progress.race`: `cars` (unlocked new cars), `car` (default car), `ko`, `firsts`
  `{track: n}`, `pieces {helix, prime}`, `ch` (daily / weekly challenge progress); `elimWins`,
  `wins` as before. `normalize()` fills them in for old saves (race takedowns start from the saved
  race mode stats) and unlocks any goal already met.
- Rare (VOIDRUNNER, SOLAR FANG, FROSTBYTE): 1500 coins (`/api/shop {action:'carbuy', car}`) or
  150 / 300 / 450 total trophies. Epic: GRAVITON 5 Elimination wins, PHANTOM VX 10 race takedowns,
  REDLINE ZERO 1st place on 4 different tracks (Grand or Elimination). Legendary: HELIX 25 race wins +
  10 pieces, OBLIVION PRIME 1000 trophies + 10 pieces. Pieces: one daily challenge (1 piece) and one
  weekly challenge (3 pieces), the same for everyone; they fill HELIX, then PRIME, then pay coins.
- `/api/shop {action:'carset', car}` sets the default car (unlocked cars only).
- Race join: an unlockable `driver` is unverified until the account loads; a guest, a bad token or
  a locked car is swapped for the default car with a `car` message; a race that starts first
  races the default car; `pick` of a locked car is refused (`car` again).
- Client: GARAGE / store show all 14 cars with progress bars for locked ones; ui/carunlock.js plays
  the NEW CAR UNLOCKED screen once per car per device (localStorage `hunt-cars-seen`).
- Dev only (HUNT_DEV): `POST /api/devgrant {coins, trophies, race, pieces, firsts}`.
