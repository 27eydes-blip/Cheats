# Motor City 1915

A mobile-first pseudo-3D racing game set in 1910s Detroit and New York, shot like a hand-cranked silent
picture: sepia streets of cobblestones and brick, one hand-tinted motor car, ragtime piano and the
mighty **Ah-oo-gah** klaxon.

**Gleyde Technologies, LLC · Created by Sam Eyde III · Juwon Shon, COO**

## Play

- **Career**: four cups of three chapters (Detroit Cup, Motor Cup, Empire Cup, Grand Prix of 1915)
  over eight courses: Michigan Central Depot, Woodward Avenue, Belle Isle, Grand Boulevard, Highland
  Park Ford Plant, Wall Street, Flatiron & Fifth Avenue, Brooklyn Bridge.
- **Time Trial**: three laps against the ghost of your best lap.
- **Garage**: buy seven period cars, tune engine/tyres/steering, choose hand-tinted paint.
- **Rivals**: Barney Oldham (fastest and cleanest), Ralph De Palmer (aggressive, blocks your line),
  Louis Chevalier (steady), Ray Harlan (reckless and fast, sometimes crashes) and Cannonball Becker (slow
  early, fast late). They boost on straights, corner cleanly and dodge trolleys and carriages.
  **Difficulty** (Settings): Easy, Normal (the fastest rival matches your car's top speed) or Hard. On every
  level a rival is never allowed to get more than about 8 seconds ahead of you.
- **The Gatsby — Legendary**: an original long cream-yellow touring car (nickel trim, whitewalls, green
  leather, hat-boxes, gold "G" ornament), the fastest car in the game. Win every career cup to earn it, or
  buy it for 25,000 coins. Deep two-tone horn; gold sparkles when boosting.
- Weather and time of day: fair, overcast, rain (wet cobbles, lamp reflections, less grip), fog, dusk, night.

Controls: throttle is automatic. ◀ ▶ steer (or tilt). Hold **Brake** while steering hard at speed to
powerslide, which fills the **Boost** gauge. Tuck in behind a rival to slipstream. The klaxon makes
rivals swerve, horses shy and pedestrians leap. Keyboard: arrows, Space brake, Shift boost, H horn, Esc pause. Press **D** (or tap the pause button 5 times) in a race for debug
mode: hitboxes (red = roadside, yellow = vehicles, green = you), the kerb (yellow), clear zone (magenta) and soft
wall (cyan), plus an on-screen and console log of every collision with its type, position, lane and effect.

## Develop

```sh
npm install
npm run dev          # Vite dev server
npm run build        # type-check + production build into dist/
node tests/smoke.test.mjs --shots   # phone/desktop smoke + full menu flow (needs a build); screenshots in tests/out/
node tests/feel.test.mjs --shots    # iPhone-portrait handling/collision/touch checks
node tests/collisions.test.mjs      # drives every course; fails on any hit with nothing visibly touching (--verbose lists all)
node tests/bots.test.mjs            # 10 bots-only races + Easy/Normal/Hard races with a robot player
node tests/gatsby.test.mjs          # the Gatsby: garage, unlock, purchase, horn, sparkles
```

Code map (`src/`): `core/` loop, input, maths · `track/` segment builder and course definitions ·
`render/` pseudo-3D renderer, film effects, HUD · `art/` all pixel art, drawn in code · `game/` player
physics, AI rivals, traffic, race · `audio/` Web Audio engine, effects and procedural ragtime ·
`ui/` intertitle screens and touch controls · `data/` cars, cups, weather · `save/` localStorage.
See `PLAN.md` for the architecture.

## Deploy

Cloudflare Pages project `motor-city-1915`. `.github/workflows/motorcity.yml` tests and deploys on
pushes to `main` (production) and to `claude/motor-city-1915-*` branches (preview). By hand:
`npm run build && npx wrangler pages deploy dist --project-name=motor-city-1915 --branch=main`.
