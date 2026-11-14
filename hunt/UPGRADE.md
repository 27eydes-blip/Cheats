# World + Brawler Upgrade

Branch `upgrade/world-and-brawlers`, merged into `main`. Only `hunt/` changed. Screenshots are in `docs/upgrade/` (`before-*` / `after-*` / `zone-*` / `worldmap-*`, each on iPhone and iPad).

## Part 1 — the bigger world

### Free Play: 20000 × 20000 (was 4000 × 4000)

**Layout.** A 3×3 grid of zones, each its own Durable Object. Crossing between zones is seamless, in both directions. The safe hub sits in the middle of the Hub district, and you arrive there.

| | | |
|---|---|---|
| Neon City | **Ruined Citadel** | Wildwood (forest) |
| **The Hollow** | The Hub | **Ashlands** |
| Frozen Lake | **Dead Marsh** | Desert Mirage |

The middle tile, the Hub district, is a ninth area around the safe hub: open plaza where every road meets.

**The four new zones:**
- **Ashlands:** black basalt, glowing cracks, two lava rivers with bridges, and a smoking **Volcano**.
- **Dead Marsh:** fog, gnarled dead trees, plank boardwalks, and **sinking mud that slows you**.
- **Ruined Citadel:** a huge fortress with gated walls, corner towers, courtyards and tunnels, around the **Giant Tower**.
- **The Hollow:** dark caves with narrow passages and glowing crystals. The cave generator removes 1-tile squeezes and unreachable pockets.

**Finding your way:**
- **Roads** run from the hub to every zone, plus a ring road through the outer zones. Zone fences always have a gate where a road crosses.
- **Landmarks** are visible from far away: the Giant Tower, the Volcano, and a **Frozen Waterfall** in Frozen Lake. Off-screen landmarks show as compass markers at the screen edge, with their distance.

**Points of interest** in every zone:
- power-cube vaults (a walled room with crates)
- crate caches
- ambush bushes beside the roads
- high ground: you see further, and into bushes from twice as far

Free Play crates refill after 90 s.

**Maps:**
- **Minimap** (top-left): your area, landmarks, bounty pings and the top bounty holder.
- **Full map** (tap the minimap): every zone, the roads and landmarks, your position, the top bounty holder, the events running in each zone, and the day/night clock.

### Day / night (10-minute cycle, the same in every zone)
- **Night:**
  - vision shrinks
  - fog rolls in
  - bushes get darker
  - high bounties glow brighter and can be spotted from further away
- **Blood Moon:** once per night, for 2 minutes. Every kill is worth double bounty. The screen gets a steady red tint (no flashing) and original tense music plays.
- **Banners** announce nightfall, dawn, the Blood Moon and each zone you enter.

### Quick Hunt arenas
- **Sizes:** 10 players = 3000 × 3000 (was 2000). New **Big Hunt**: 20 players on 5000 × 5000, Showdown rules, chosen from the mode list.
- **Layouts:** every world has two, picked by the match seed: Crossfire, The Keep, Broken Rings, Three Lanes. The four new worlds are Quick Hunt arenas too.
- **Balance:** a balance check over many seeds averages every brawler at 48.8–51.0% (target 45–55%). No stats were changed. The first version of Broken Rings was tuned because its solid rings forced every fight to close range.

### Tech for a big world
- **Chunks:** ground is drawn in chunks, and only about 48 near the camera stay in memory. Wall art is cached per world with a size limit.
- **Interest management:** the server only sends each player the bullets, pickups, effects and radar pings near them. Tests show snapshot size stays flat however much happens far away (about 400 bytes per update).

## Part 2 — the hunters

- **All six redesigned:**
  - **Volt:** storm hunter with a cracked mask leaking lightning, long coat, crackling rifle.
  - **Brick:** armoured brute with a stone helmet, glowing furnace chest and scrap shotgun.
  - **Wisp:** faceless hooded sniper with pale eyes and a mist trail.
  - **Dune:** bandaged desert wraith with a bone mask and swirling sand.
  - **Rook:** crow-skull helmet, feathered cloak, chains, hooks.
  - **Flicker:** all-black shadow assassin with a jagged grin mask and twin blades; blurs when moving.
- **Animation:** threatening idles (breathing, cloaks, glowing eyes, weapon twitches).
- **Unchanged:** names, roles, stats and hitboxes are exactly the same; only the drawing changed.
- **Skins:**
  - Old skins now recolour the new designs.
  - Every brawler gets a free **Classic** skin with the original cute look; old saves get it automatically.
- **Scary feel:**
  - an original growl when you pick a hunter
  - eliminations shatter into dark shards, smoke and embers (no blood)
  - a heartbeat and darker screen edges when an enemy hides nearby
  - the top bounty holder is **Marked**: a red aura and a skull over their head
- **Lobby:**
  - the hunter is lit from below, with fog rolling over the pedestal
  - a darker theme: deep purples and blacks with gold and red accents
  - "Created by Sam Eyde III" is still shown

## Checks

| Check | Result |
|-------|--------|
| Tests | All Node tests pass. 53/53 browser tests pass on Chromium. Firefox and WebKit can't be installed in this environment; run `npx playwright install firefox webkit && npm run e2e` on your machine. |
| 20-player Big Hunt with bots | All 20 present on the 5000 arena. Prediction correction stays under 25 px (test `bighunt.spec.js`). |
| Frame rate at iPhone SE size, normal CPU | **60 fps** in a 20-player Big Hunt, and **60 fps** in Free Play at the Volcano at night. |
| Frame rate with the CPU slowed 4× (stand-in for an older phone) | About **50 fps** in arenas. Free Play **38–49 fps** depending on the scene; Low Graphics brings the heaviest scene to about 50. This test browser draws pixels in software (most of the time goes there); a real iPhone uses its graphics chip, so treat these as worst case. |
| Old saves and skins | Covered by `cosmetics.test.js`: an old save keeps its skins and equipped skin, and gains the Classic skins. |

## Needs Sam's decision

1. **Zone count.** The Hub district in the middle is its own zone server, so there are 8 themed zones plus the hub tile: 9 Durable Objects in all. The alternative, 8 wedge-shaped zones meeting at the hub, would make people near the hub hop between servers constantly.
2. **Visual darkness vs gameplay vision.** At night and in the Hollow, the screen dims closer to you than the server's actual vision limit. That's deliberate, so night reads as dark on a phone. Things in the dim area are darker, not hidden.
3. **Where to look on a real phone.** If an older iPhone struggles in Free Play at night, the first things to cut are fog banks and volcano smoke; Low Graphics already turns them off.
