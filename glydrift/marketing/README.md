# Glydrift marketing videos

Separate from the game: nothing in `../src` is changed. The "demo mode" lives in
`demo-bot.js` and is injected by the recorder when it opens the game with `?demo`.

## Make the promo videos

```bash
cd glydrift
npm run build                 # the recorder plays the built game (dist/)
node marketing/record.cjs     # ~20 min here: 60 fps master + the game's own audio → marketing/work/
node marketing/edit.cjs       # ~8 min: both TikTok cuts → marketing/output/
```

Outputs (1080x1920, 30 fps, H.264/AAC, loudness -14 LUFS):

- `output/glydrift_tiktok_abyss.mp4`: 20–25 s. Opens on the wildest near-miss, then the run start, near-misses, the Solar Storm and Frozen Nebula titles, The Calm, the Abyss entrance (blackout, slam, speed spike), the death and NEW BEST. It ends on the logo.
- `output/glydrift_tiktok_ai.mp4`: 15 s. "I built this game with AI in one night", then the menu, the hero carousel, the biomes and the logo.
- `output/captions.md`: captions and hashtags for both.

### How the recording works

- **Demo bot** (`demo-bot.js`, Volt): every frame it simulates about 60 flight plans 1.5 s ahead. Each plan holds a height or drifts toward one. The simulation uses the game's own hazard code, with side effects stubbed and state restored afterwards.
  - It flies the safest plan.
  - Every few seconds it deliberately takes a plan that grazes a hazard by 8–18 px. The game counts that as a real near-miss, with slow-mo and "CLOSE!".
  - Six seconds into the Abyss it flies into the nearest hazard.
- **Smooth 60 fps on any machine:** the game advances in exact 1/60 s steps, and each frame is read off the canvas. Game time slows down while recording and plays back at full speed.
- **Audio:** a second pass replays the identical run in real time without drawing. A `MediaRecorder` tapped onto the page's speakers records the game's own procedural music and sound effects. The music is original and generated, with no copyrighted tracks.
  - Randomness is seeded inside game logic, so both passes are identical. `record.cjs` checks this event by event.
- **Edit:** the frames are upscaled 3× with nearest-neighbour filtering (crisp pixels), then cropped to 1080×1920.
  - Cuts last 1–3 s and start and end on beats detected in the soundtrack: the menu lounge at 112 BPM, the biome tracks at 124 BPM and the Abyss at 140 BPM.
  - Text is rendered in the game's Orbitron font and checked to stay out of the top 150 px and bottom 400 px, where TikTok's buttons sit.

Change the run with `REEL_SEED=123 node marketing/record.cjs`. Each seed gives a different layout of hazards.

## Option 2: edit your own iPhone screen recording

```bash
node marketing/edit-upload.cjs ~/Downloads/RPReplay_Final123.mp4
node marketing/edit-upload.cjs rec.mp4 --text "12|it gets quiet..." --text "15|...too quiet"
node marketing/edit-upload.cjs rec.mp4 --cuts "34.2:2,5:1.5,61:2" --hook "watch this"
```

The script crops the recording to fill 1080×1920 and drops the status bar.

- **Automatic cuts:** it finds highlights from the recording's own audio. The loudest moment becomes the 2 s hook, and later peaks become 1–3 s cuts on the detected beat. You can choose your own cuts with `--cuts` instead.
- **Text and ending:** it adds the same text style ("POV…" on the hook, "GLYDRIFT · coming soon" for the last 3 s) and ends on the logo.
- **Output:** `marketing/output/<name>_tiktok.mp4`.
