# Ant Colony War

A 10-episode vertical (1080×1920, 30 fps) story series rendered with [Remotion](https://www.remotion.dev).
Narration comes from ElevenLabs with word-level timestamps, so captions, shot changes and effects land exactly on the voice.

## Quick start

```bash
npm install
cp .env.example .env          # paste your ELEVENLABS_API_KEY
npm run render:all            # sound effects -> narration -> all 10 MP4s in out/
```

`render:all` runs three steps you can also run on their own:

| Command | What it does |
| --- | --- |
| `npm run sfx` | Synthesises the sound effects into `public/sfx/` (drone, heartbeat, swarm, fire, rain, snap crack, impacts, whoosh, glitch, thunder, senses ping). All generated in code, so they're royalty-free. |
| `npm run audio` | Calls ElevenLabs for every line, writes `audio/epXX.mp3` and `audio/epXX.json` (word timings), and updates `src/data/timelines.ts`. Lines are cached in `audio/cache/`, so re-running only pays for lines you changed. Add `-- 3 4` for specific episodes or `-- --force` to re-synthesise. |
| `npm run render` | Renders every episode to `out/ant-colony-war-epXX-title.mp4`. Add `-- 3` for one episode. |

Other useful commands:

- `npm run studio` opens Remotion Studio to scrub through any episode live (it works before audio exists, using estimated timing).
- `npm run still -- 4` renders one still per shot of episode 4 into `out/stills/`, which is quick for reviewing visuals.
- `npm run audio:estimate` prints each episode's estimated length without calling the API.
- `npm run voices` lists the voices on your ElevenLabs account.
- `npm run render:preview` renders without generating narration (silent, estimated timing).

No ffmpeg install is needed; the scripts use the one that ships with Remotion.
If Remotion can't download its headless browser on your network, point `REMOTION_BROWSER_EXECUTABLE` at a local Chrome or Chromium.

## Editing the script

Everything lives in `script/episodes.ts`. Each episode is a list of **beats**: one line of narration plus the shot it plays over. The shot cuts exactly when the narrator starts the line.

```ts
{ scene: 'closeup', text: 'Our jaws lock open... like a loaded spring.', pause: 0.3, tense: true },
{ scene: 'closeup', text: '{snap}SNAP.', pause: 1.0, camera: 'still' },
```

Beat options: `pause` (silence after the line, in seconds), `tense` (heartbeat), `senses` (hyper senses), `fire` (fire attack), `rain`, `infection` (0–1 override), `camera` (`push` | `pull` | `still` | `drift`), `with` (`'elder'` for the duel shot).

Inline markup in `text`:

| Markup | Effect |
| --- | --- |
| `{snap}word` | Trap-jaw **SNAP** on that word: freeze frame, white flash, shockwave ring, screen shake, crack sound, and 250's mandibles slam shut |
| `{impact}word` | Impact hit + camera shake |
| `{shake}word` | Camera shake |
| `{flash}word` | Lightning flash + thunder |
| `*word*` / `^word^` | Force a green / orange caption highlight |
| `[250\|two fifty]` | Captions show `250`, narrator says "two fifty" |

Numbers, "dead", "fire ants", "my colony", "Kesh", "queen", "venom" and similar words are highlighted automatically (`src/timeline/parse.ts`).

Episode options: `infection` (0–1, how far the amoeba has taken 250, which drives the green veins and eye glint) and `endCard` (overrides "FOLLOW FOR PART X+1").

### Shots (`scene`)

| Scene | Look |
| --- | --- |
| `black` | Near darkness, dust, a faint glow (and a green glint once 250 is turning) |
| `colony` | Layered amber tunnels full of trap-jaws, parallax, roots, fog |
| `hero` | 250 walking, the camera tracking him through the tunnels |
| `closeup` | 250's head: mandibles, twitching antennae, veins, eye glint |
| `surface` | Night above ground: giant grass, moon, the nest glowing, rain and lightning |
| `flood` | A flooded tunnel with something glowing under the water |
| `amoeba` | The alien amoeba: liquid green blob, bloom, creeping tendrils |
| `infection` | The amoeba's tendrils entering 250; veins light up through the shot |
| `senses` | Hyper senses: sound waves, sisters and fire ants as glowing outlines through the dirt |
| `fireColony` | The fire colony's ember-lit chambers swarming with fire ants |
| `swarm` | A river of fire ants pouring through a tunnel, on the floor and the ceiling |
| `battle` | Trap-jaws vs fire ants: lunges, flashes, smoke, embers, the fallen |
| `kesh` | Kesh, huge and scarred, backlit by fire (loses an antenna from EP5) |
| `duel` | 250 facing Kesh (or the oldest soldier with `with: 'elder'`) inside a ring of onlookers |
| `queen` | The fire queen, enormous and almost invisible in shadow |
| `council` | The colony gathered against 250 |
| `army` | 250 at the head of the fire ant army |

## Narrator voice

The default is ElevenLabs' **Brian** (deep, resonant, calm), set up for a slow, dramatic read (`speed 0.86`, lower stability for more expression). For a grittier war-veteran sound, set `ELEVENLABS_VOICE_ID=2EiwWnXFnvU5JabPnv8n` (Clyde), or pick any voice from `npm run voices`. Voice settings live at the top of `scripts/generate-audio.ts`.

Each line is synthesised separately, with the surrounding lines passed as context so the delivery flows. That gives exact word timings and precise, controllable dramatic pauses (`pause`).

## Project layout

```
script/            the story: episodes.ts (edit this) + types.ts (markup reference)
scripts/           make-sfx, generate-audio, render, still, list-voices
src/art/           Ant (procedural SVG ants), Earth (tunnels/roots), Amoeba, Atmosphere (fog, dust, embers, smoke, rain, grain)
src/scenes/        the 17 shot types
src/fx/            snap, flashes, hyper senses, fire attack, camera shake
src/ui/            captions, title card, end card, fonts
src/timeline/      script parsing, word timing, story clock (slow-mo + freeze frames)
src/Episode.tsx    puts it all together; src/SoundTrack.tsx layers the audio
audio/             generated narration (epXX.mp3 + epXX.json)
out/               rendered MP4s
```

Settings like the series name, the end-card game line (`GAME_CTA`), title length and end-card length are in `src/config.ts`.
