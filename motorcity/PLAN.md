# Motor City 1915 — architecture plan

Note: `reference/prototype.html` was not in the repository (or its history), so the game is built from
the brief's description of the prototype: sepia old-film look, cobblestone streets between tall
buildings, an Ah-oo-gah horn that makes rivals swerve.

## Stack
- Vite + TypeScript, one HTML5 canvas, no engine, no runtime dependencies.
- All art is pixel art authored in code (palette-indexed string grids + pixel-level procedural
  painters) and baked into offscreen canvases at boot, so there are no image files to load.
- World renders to a low-resolution canvas (short side 240 px), then is scaled to the screen with
  nearest-neighbour filtering. Menus are DOM (crisp text in "Limelight" / "Playfair Display SC").
- Cloudflare Pages: `npm run build` → `dist/`, `wrangler pages deploy dist`.

## Modules (`src/`)
| Folder | Contents |
|---|---|
| `core/` | game loop (fixed 60 Hz step, render on rAF), input (touch, keys, tilt, gamepad), math, seeded RNG |
| `track/` | segment builder (curves, hills, bridges, tunnels, rails, scenery zones) and the 8 track definitions |
| `render/` | pseudo-3D segment projector with hill clipping, road/cobble/rail drawing, sprite batching, parallax skyline, weather (rain, fog, wet reflections, lamps at dusk/night), film FX (grain, scratches, flicker, vignette, gate weave, cigarette burns), HUD |
| `art/` | palettes, sprite sheets: player car (3 steer frames × 2 wheel frames, brake lights), 5 rival models, buildings, lamps, people, horses, trolleys, trucks, wires, bunting, skyline landmarks |
| `game/` | race state, player physics (auto-throttle, steer, brake, drift → boost, slipstream, spin-outs), AI personalities + rubber-banding, traffic, pedestrians, horn reactions, ghost recording |
| `audio/` | Web Audio: layered engine with gears, backfire, skid, crowd, horse, trolley bell, klaxon, procedural ragtime piano |
| `ui/` | intertitle screens (title, career, garage, settings, pause, chapter cards, results with newspaper), touch controls |
| `data/` | cars, upgrades, paints, cups, weather presets |
| `save/` | versioned localStorage save |

## Key designs
- **Road**: Jake-Gordon-style segments (200 units long), each with `curve`, world `y`, sprites, cars,
  flags (bridge, tunnel, rails, finish). Hills via eased `y` ramps; renderer clips with `maxY`.
- **Handling**: speed auto-throttles to the car's top speed; steering scales with speed; centrifugal
  push on curves. Braking while steering hard at speed starts a **drift**: lower lateral push, sliding
  sprite, skid sound, boost meter fills. **Boost** = 2.5 s nitro with backfire bang. Slipstream when
  close behind a rival in the same lane. Off-road slows; hitting scenery/traffic at speed = **spin-out**
  (rotating sprite frames, steam from radiator, ~1.5 s), never game over.
- **AI**: each rival has a model, top speed, personality — *blocker* (drifts into the player's line
  when the player is behind), *clean* (holds the racing line), *reckless* (fast, late swerves, crashes).
  Rubber band: ±8 % speed based on distance to the player. Horn within range → swerve away.
- **Traffic**: horse carriages, trolleys locked to rails, delivery trucks; pedestrians on kerbs jump
  back / tip hats on horn.
- **Content**: Career 4 cups × 3 races (Detroit, Motor, Empire, Grand Prix) over 8 tracks with varied
  weather/time; Time Trial with best-lap ghost; Garage with 6 cars, 3 upgrade lines, 8 paints.

## Milestones (each on its own branch, tested on a phone viewport before moving on)
1. Renderer + hills + handling feel
2. Art pass
3. AI + traffic
4. Career / garage / save
5. Audio + polish + deploy
