# Glydrift reggae soundtrack

Every note is original and generated in code with Tone.js. Nothing is sampled. The songs are
rendered **at build time** (`npm run music`) to small mono MP3 stems. The game plays them back
with plain Web Audio, so nothing is synthesized while you play.

## Tracks

| Realm | Title | Style | BPM | Key |
|---|---|---|---|---|
| Menu | Sunny Side | Chill, sunny roots reggae · one drop · melodica hook | 75 | C major |
| Neon Void | Neon Skank | Upbeat modern reggae · double-time feel · bright organ skank | 90 | A minor |
| Solar Storm | Sun Riddim | High-energy dancehall riddim · hard drums · horn stabs | 100 | E minor |
| Frozen Nebula | Ice Echo | Spacey dub · huge echoes · icy pads · floating flute | 80 | A minor |
| Glitch Realm | Bit Dub | Digital dub · chopped stuttering delays · bitcrushed skanks | 70 (140 feel) | D minor |
| The Calm | Heartbeat | Near silence · heartbeat · dub echo fading out | 70 | D minor |
| Abyss | Abyss Dub | Dark reggae-dubstep fusion · massive sub · eerie delays | 140 half-time | D phrygian |
| Peaceful Valley | Valley Roots | Gentle roots one drop · soft brushes · flute | 70 | F major |
| Hurricane | Storm Ska | Fast ska · skank on every 8th · walking bass · horns | 140 | G minor |
| Prism Rift | Prism Rocksteady | Bright rocksteady · glass chimes · sweet flute | 70 | B♭ major |
| Tidal Sky | Tidal Dub | Deep underwater dub · muffled · long echoes | 70 | D minor |
| Chrono Fracture | Clockwork Rockers | Ticking rockers · rimshot clock · chimes | 70 | G minor |
| Mirror Realm | Mirror Dub | Eerie reverse dub · organ swells · hypnotic echoes | 70 | D phrygian |

**Song form** (one loop): groove (4 bars) → build (2) → drop (4) → dub breakdown (4) → repeat.
The 140 BPM tracks use twice as many bars. Each track also has a 2-bar intro. You always enter a
realm on its drop: an impact, plus an airhorn in the high-energy realms.

**Drums:** a one-drop groove (kick and rimshot on beat 3), steppers (a kick on every beat) in
the drops, and swung hats.

**Stems:** drums · bass · skank (guitar chop, organ bubble, pads, horn stabs) · lead
(melodica / flute / horns / bell), plus dub sends.

**Mix:** every stem is balanced to a fixed loudness. The bass is the loudest stem, and
everything else is high-passed so the low end stays clear. At run time there's a small dip at
2.6 kHz so the sound effects cut through.

## Flowing between realms

- **Keys.** Neighbouring realms are on the same key or a neighbour on the circle of fifths:
  C → Am → Em → Am → Dm → D phrygian → F → Gm, and the dimensions use 1♭ / 2♭ keys.
- **Tempo.** Menu 75 → Void 90 → Solar 100 → Frozen 80 → Glitch 70, ramped gradually inside
  the bridges. From the Glitch Realm on, everything sits on one 70 / 140 grid, so half-time
  and double-time feels carry it with no tempo jump.
- **Bridges.** Every boundary the course can produce has its own pre-rendered bridge:
  1. the current groove, its tempo ramping
  2. the next realm's hats, then its drums, fading in underneath
  3. **one** bass swap, on a downbeat
  4. a big echo throw, a filter sweep and a riser
  5. a dub drop-out, then landing on the next realm's first beat

  The new skank and melody come in on that beat.
- **Timing.** The bridge is started on the current track's bar line, picked from the player's
  distance and speed so that it lands closest to the border. The next realm is preloaded when
  you enter the one before it.
- **Bridge length.** Realms last 14–27 s, so bridges are 4 bars for 90–100 BPM tracks and 2
  bars for the longer 70–80 BPM bars. 8 bars wouldn't fit.
- **Titles.** "ENTERING …" (with its sound and flash) appears on the landing beat.
- **The Calm.** It starts on a dub drop-out (skank and lead out, echo thrown). The track then
  dissolves into echo while a heartbeat rises.
- **The Abyss.** Exactly one bar of silence (the blackout is held by the audio clock), then
  the heavy bass drop with the title slam.
- **Death.** A dub echo tail and a filter sweep. RETRY cleanly resets to Neon Void, even
  mid-bridge.
- **Speed layers.** Drums and bass first, the skank from about 125 m, and the lead from Solar
  Storm on. Layers change on bar lines.
- **Chrono Fracture.** Pre-rendered audio can't bend tempo without bending pitch, so the time
  zones muffle (golden) or open up (red) the music instead.

## Files

- `src/audio/reggae/songs.js`: the compositions (data)
- `src/audio/reggae/render.js`: the Tone.js instruments, effects and arranger (build only)
- `scripts/music/render.mjs`: renders everything in headless Chromium, balances it, encodes
  it with ffmpeg into `public/music/`, and writes `src/audio/reggae/manifest.json`
- `src/audio/music.js`: the run-time player (decks, bridges, cues, Calm, Abyss, layers)
- `src/audio/house/`: the previous house engine, kept only for the music test page

## Commands

- `npm run music`: re-render the soundtrack after changing `songs.js` / `render.js`. It takes
  about 4 minutes and needs ffmpeg with libmp3lame. The build refuses to run if the audio is
  older than the sources.
- `node scripts/music/verify-run.mjs`: a real god-mode run with audio. It checks every bridge
  and title against the beat grid, the decoder offset, and a death mid-bridge followed by a
  retry.
- Music test page: open `?music` in a dev/test build, or tap the logo 5 times. Every reggae
  track and the old house tracks are there, plus **PLAY FULL JOURNEY** (every realm in order
  with all transitions).
