# Motor City 1915

A mobile-first pseudo-3D racing game set in 1910s Detroit and New York, shot like a hand-cranked silent
picture: sepia streets of cobblestones and brick, one hand-tinted motor car, ragtime piano and the
mighty **Ah-oo-gah** klaxon.

**Gleyde Technologies, LLC · Created by Sam Eyde III**

## Play

- **Career**: four cups of three chapters (Detroit Cup, Motor Cup, Empire Cup, Grand Prix of 1915)
  over eight courses: Michigan Central Depot, Woodward Avenue, Belle Isle, Grand Boulevard, Highland
  Park Ford Plant, Wall Street, Flatiron & Fifth Avenue, Brooklyn Bridge.
- **Time Trial**: three laps against the ghost of your best lap.
- **Garage**: buy seven period cars, tune engine/tyres/steering, choose hand-tinted paint.
- Weather and time of day: fair, overcast, rain (wet cobbles, lamp reflections, less grip), fog, dusk, night.

Controls: throttle is automatic. ◀ ▶ steer (or tilt). Hold **Brake** while steering hard at speed to
powerslide, which fills the **Boost** gauge. Tuck in behind a rival to slipstream. The klaxon makes
rivals swerve, horses shy and pedestrians leap. Keyboard: arrows, Space brake, Shift boost, H horn, Esc pause.

## Develop

```sh
npm install
npm run dev          # Vite dev server
npm run build        # type-check + production build into dist/
node tests/smoke.test.mjs --shots   # phone/desktop smoke + full menu flow (needs a build); screenshots in tests/out/
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
