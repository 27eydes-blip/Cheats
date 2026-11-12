# Ant Colony War

A vertical (1080×1920, 30 fps) story series rendered with [Remotion](https://www.remotion.dev), narrated by 250 in the first person.
Narration has word-level timings, so captions, shot changes and effects land on the voice.

## Quick start

```bash
npm install
npm run voice:setup           # one-time: installs the narrator voice
npm run studio                # preview in Remotion Studio (works before audio exists, with estimated timing)
npm run render:all            # check script -> sound effects -> voice -> narration -> MP4s in out/
```

`render:all` runs these steps, which you can also run on their own:

| Command | What it does |
| --- | --- |
| `npm run check` | Confirms every `episodes/epXX/scenes.json` matches `script/season1.md` **word for word** and the titles match. Audio and render refuse to run if it doesn't. |
| `npm run sfx` | Synthesises the sound effects into `public/sfx/` (drone, heartbeat, swarm, fire, rain, snap crack, impacts, whoosh, glitch, thunder, senses ping). Generated in code, so royalty-free. |
| `npm run audio` | Narrates every line (local British boy voice by default), writes `audio/epXX.mp3` + `audio/epXX.json` (word timings) and updates `src/data/timelines.ts`. Lines are cached in `audio/cache/`, so re-running only redoes changed lines. `-- 1` for one episode, `-- --force` to re-synthesise. |
| `npm run render` | Renders each episode that has a `scenes.json` to `out/ant-colony-war-epXX-title.mp4`. `-- 1` for one episode. |

Also: `npm run still -- 1` (one still per shot into `out/stills/`, fast for reviewing), `npm run audio:estimate` (estimated lengths, no API calls), `npm run voices` (list your ElevenLabs voices, if you use ElevenLabs).

No ffmpeg install is needed; the scripts use the one that ships with Remotion. If Remotion can't download its headless browser on your network, set `REMOTION_BROWSER_EXECUTABLE` to a local Chrome or Chromium.

## The script and the shots

- `script/season1.md` is your script, verbatim. It is the source of truth for every word the narrator says.
- `episodes/epXX/scenes.json` is the shot list for each episode. Edit shots here without touching code.

Each shot is a slice of the narration plus what's on screen while it's spoken. The cut lands exactly when the narrator starts the shot's first word. Joined together, the shots' `text` must equal the episode's script (`npm run check` tells you where it differs).

```json
{
  "scene": "faceInDirt",
  "text": "Cold dirt on my face, and a heartbeat that wasn't slowing down.",
  "pause": 0.8,
  "tense": true,
  "options": { "eyes": "opening" },
  "note": "Extreme close-up of 250's head on the dirt; his eye slowly opens."
}
```

Shot fields:
- `pause`: silence after the line, in seconds.
- Effect flags: `tense` (heartbeat), `senses` (slow motion, sound ripples, outlines through dirt), `fire` (embers, smoke, orange glow), `rain`.
- `infection`: 0–1, overrides 250's green veins and eye glint for this shot. The episode-level `infection` sets the default, so the glint can stay subtle early and grow as he turns.
- `camera`: `push` | `pull` | `still` | `drift`.
- `options`: per-scene settings (see below).
- `note`: free text for you.

If an episode's narration comes out under 45 s, the audio step lengthens the pauses between shots (never the words) until it reaches 45 s.

Inline markup in `text` is not spoken and not shown:

| Markup | Effect |
| --- | --- |
| `{snap}word` | Trap-jaw **SNAP** on that word: freeze frame, white flash, shockwave ring, screen shake, crack sound, mandibles slam shut |
| `{impact}word` | Impact hit + camera shake |
| `{shake}word` | Camera shake |
| `{flash}word` | Lightning flash + thunder |
| `*word*` / `^word^` | Force a green / orange caption highlight |

Numbers, "dead", "fire ants", "my colony", "Kesh", "queen" and similar words are highlighted automatically (`src/timeline/parse.ts`). Captions show 2–4 words at a time and never split across punctuation or end on a little word like "the" or "my".

### Scenes

| `scene` | What you see | `options` |
| --- | --- | --- |
| `dirtMacro` | Macro on dirt grains; rack focus reveals 250 lying in the dirt | |
| `faceInDirt` | Extreme close-up of 250's head on the dirt, heartbeat pulse | `eyes`: `closed` / `opening` / `open` |
| `lyingInChamber` | 250 lying still while sisters walk past; light rises and falls (time passing) | |
| `deadStill` | Cold, desaturated close shot of his motionless body, dust settling | |
| `eyeOpen` | His eye snaps open with a green glint | |
| `waterDrop` | Slow motion: a drop swelling on a root tip, about to fall | |
| `rise` | 250 pushes up off the dirt; mandibles cock open | |
| `vast` | Pull back: endless tunnels, 250 a speck in the middle | |
| `dark` | Near darkness: a dim silhouette of 250 with a glinting eye, drifting particles | |
| `colony` | Layered amber tunnels full of identical trap-jaws | `find250`: true (a tiny glint picks him out) |
| `hero` | 250 walking, the camera tracking him | |
| `closeup` | 250's head: mandibles, twitching antennae, veins, glint | |
| `senses` | Hyper senses: sound waves; sisters and fire ants as outlines through the dirt | `reveal`: `beetle` |
| `surface` | Night above ground: giant grass, moon, the nest glowing | |
| `flood` | Flooded tunnel, something glowing under the water | |
| `amoeba` | The amoeba: liquid green blob, bloom, creeping tendrils | |
| `infection` | The amoeba's tendrils entering 250; veins light up | |
| `fireColony` | The fire colony's ember-lit chambers | |
| `swarm` | A river of fire ants pouring through a tunnel | |
| `battle` | Trap-jaws vs fire ants: lunges, flashes, smoke, embers | |
| `kesh` | Kesh, huge and scarred, backlit by fire | |
| `duel` | 250 facing Kesh (or `"with": "elder"`) in a ring of onlookers | |
| `queen` | The fire queen, enormous and almost invisible in shadow | |
| `council` | The colony gathered against 250 | |
| `army` | 250 at the head of the fire ant army | |

## Characters

Every ant is drawn by one shared rig, `src/art/Ant.tsx`, so 250 looks identical in every episode. The rig has:
- Segmented bodies: head, mesosoma, petiole and gaster.
- Six legs, all attached to the mesosoma, each with three jointed segments (femur, tibia, tarsus) and a tripod walking gait.
- Elbowed antennae that twitch.
- Long straight trap-jaw mandibles that snap shut.
- Rim lighting.
- Poses: lying down (`lie`) and eyes opening (`eyeOpen`).

Fire ants, Kesh (scarred) and the fire queen use the same rig.

## Narrator voice

The narrator is **250 as an older British boy**, speaking slowly. It's a local voice, so it's free and needs no account:
- It's Kokoro TTS, blending 70% `bm_fable` with 30% `bf_emma`, with no pitch processing.
- That lands at about 136 Hz, a teenage boy's register.
- `npm run voice:setup` installs it once. It needs Python 3.10+ and downloads a ~340 MB model.

Tune it in `.env`:
- `VOICE_SEMITONES`: shifts the pitch; positive sounds younger, negative older. Default 0.
- `VOICE_SPEED`: lower is slower. Default 0.78.
- The blend itself is at the top of `scripts/generate-audio.ts`.

Kokoro doesn't output timestamps, so `tts/narrate.py` measures them from the audio. It matches silences to punctuation and spreads words by phoneme count, which is accurate to roughly a syllable.

To use ElevenLabs instead, set these in `.env`:
- `TTS_ENGINE=elevenlabs`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`: pick a young British male voice from their Voice Library; `npm run voices` lists the ones on your account.

ElevenLabs gives exact word timestamps from the API.

## Layout

```
script/season1.md      your script (source of truth)
episodes/epXX/         scenes.json per episode (the shot list)
scripts/               check, make-sfx, generate-audio, render, still, list-voices
src/art/               Ant rig, Earth (tunnels/roots), Amoeba, Props (beetle, grains, drop), Atmosphere
src/scenes/            the shot types
src/fx/                snap, flashes, hyper senses, fire attack, camera shake
src/ui/                captions, title card, end card, fonts
src/timeline/          parsing, word timing, story clock (slow motion + freeze frames)
audio/                 generated narration (epXX.mp3 + epXX.json)
out/                   rendered MP4s
```
