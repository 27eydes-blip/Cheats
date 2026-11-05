# Glydrift promo videos

This folder turns Glydrift gameplay into TikTok and Twitter/X promo videos. It's separate from the
game: nothing here changes game code or ships with the game.

| Video | Output (`output/`) | Size | Length |
|---|---|---|---|
| 1. TikTok "The Abyss" | `glydrift-abyss-tiktok.mp4` | 1080×1920 | 20–25s |
| 2. TikTok "I made this" | `glydrift-made-with-ai-tiktok.mp4` | 1080×1920 | 15s |
| 3. Twitter/X, vertical | `glydrift-twitter-1080x1920.mp4` | 1080×1920 | 15–20s |
| 3. Twitter/X, square | `glydrift-twitter-1080x1080.mp4` | 1080×1080 | 15–20s |

Every video is H.264 High at 30fps with AAC audio, faststart, and under 50MB (it re-encodes
automatically if a file goes over). Each one also gets a `.jpg` of its exact first frame, so you can
check the still people see before it plays. Captions, hashtags and tweets are in
[CAPTIONS.md](CAPTIONS.md).

## Requirements

- Node 18+, plus ffmpeg and ffprobe on your PATH (built with libx264 and libfreetype).
- Playwright with Chromium (`npm i` in this folder, then `npx playwright install chromium`). You only
  need it for recording, not for the iPhone script.
- Optional: `assets/logo.png`, the Glydrift logo for the end card. Pixel art works best; it's
  scaled up by a whole number with nearest-neighbour. If it's missing, the end card shows a text
  "GLYDRIFT" wordmark instead.
- Optional: `MARKETING_FONT=/path/to/font.ttf` for the captions. By default it uses the first heavy
  sans it finds (Inter Black, Arial Black, DejaVu Sans Bold and so on).

## Option 1: record the game automatically

```sh
# 1. run the game locally (any URL works)
# 2. record every moment in config/moments.json into clips/
GLYDRIFT_URL=http://localhost:5173/ node record/record.mjs
#    or just some of them:  node record/record.mjs --only nearmiss,abyss
# 3. cut the videos into output/
node build.mjs                    # all four
node build.mjs abyss-tiktok       # or just one
```

### One-time setup: `config/glydrift.adapter.js`

This is the only game-specific file, and it hasn't been written yet because the Glydrift source
wasn't available when this pipeline was built. It tells the bot how to read the game (player,
hazards, realm, score) and press its buttons, and it lets moments be staged (`warp("abyss")`,
`hero("yarms")`, `openScreen("shop")`). Each method has a `TODO` describing what it has to return.
`test/fixture.adapter.js` is a complete, working example against the test game.

The adapter should also report these events through `events()`, because the edits cut on them:
`eyeBeam` (the Eye Beam warning starts), `flex` (Yarms flexes) and `surf` (the tiger surfs). The bot
produces `nearMiss`, `chain`, `realm`, `<realm name>` (for example `calm` or `abyss`) and `death` on
its own.

### How recording works

- **Hidden `?demo` mode.** The recorder injects the bot from outside the page before the game loads.
  The bot only switches on when the URL has `?demo` and the recorder has armed it. A release build
  doesn't contain the bot, and adding `?demo` to the live site does nothing.
- **The bot** (`record/inject/demo-bot.js`) plans about 0.75s ahead. It tries each input for
  several hold lengths, rolls the player forward with the adapter's `predict()`, and picks the plan
  that survives while passing hazards closest to a target clearance (2–3 game px), which is what
  makes the near-misses dramatic. `style: "die"` makes it crash at a dramatic moment instead.
- **Smooth footage on any machine.** The page runs on a virtual clock covering `performance.now`,
  `Date`, `requestAnimationFrame`, timers and CSS animations, and that clock only moves when the
  recorder steps it. If the browser can only manage 10fps, game time slows to a sixth of normal
  speed, and the frames still play back as a perfectly even 60 steps per second of game time. The
  recorder prints how much it slowed the game.
- **Audio in sync.** The game's own procedural WebAudio is rendered on that same clock through an
  OfflineAudioContext, so the music and SFX line up with the frames to the sample, whatever the
  recording speed. No outside music is added.
- **Pixel-crisp.** The recorder captures at 390×844 (deviceScaleFactor 1). The editor scales that
  up by a whole number with nearest-neighbour (×3 for these formats), so every game pixel becomes
  an identical 3×3 block, then crops to the frame. `focusX` and `focusY` in an edit choose where
  the crop sits.
- **Safe backend.** During recording, every request other than GET is answered locally, so demo
  runs never post scores to the real leaderboard. `allowWrites` and `mocks` in `moments.json` can
  change this. Each moment runs in a fresh browser profile, so a local high score is empty and the
  death take shows "NEW BEST!". If the worldwide rank only comes back from a score submission, you'd
  have to allow that write or mock it. Only mock a rank you could really get.

## Option 2: use your own iPhone screen recording

```sh
node iphone.mjs ~/Downloads/RPReplay_Final1730.MP4
```

This applies the same four edits, captions and logo end card, and writes `output/*-iphone.mp4`. It
also:

- crops away the status bar and Safari toolbar by finding rows of the screen that never change
  (you can override with `--crop-top` / `--crop-bottom`, in source pixels)
- converts HDR (HLG or PQ) recordings to SDR, applies rotation, and turns 60fps or variable-rate
  footage into constant 30fps
- picks moments automatically: the most intense near-misses (motion plus audio hits), realm changes
  (a lasting palette shift), The Calm (the biggest drop in loudness), the Abyss (the biggest jump in
  loudness after it), and the death (the end of the recording). Heroes and menus can't be detected,
  so they're skipped unless you mark them.

It prints the time it picked for each moment. Correct any of them, or add the ones it skipped, with
`--at`:

```sh
node iphone.mjs rec.mov --template abyss-tiktok \
  --at hook=12.4 --at calm=41 --at abyss=47.5 --at yarms=20 --at tiger=26
node iphone.mjs run1.mov run2.mov --at hook=1:8.2 --at death=2:63   # <file #>:<seconds>
node iphone.mjs rec.mov --marks marks.json                           # {"hook": 12.4, "calm": "2:41"}
```

Each time marks when the moment happens; the edit adds its own lead-in. If too few moments are
found, the video comes out shorter than its target and the script warns you.

## Editing the videos

Each video is a JSON file in `config/edits/`:

- `segments`: the cuts, in order. Each has a `clip`, plus either an `event` (with `pick`: an index,
  `"best"` or `"last"`, and `pre`, the seconds of lead-in) or a fixed `in` time. It also has `dur`
  and optional `flash`, `fit: "contain"` (shows the whole screen over a blurred background; used for
  the menus), `zoom`, `speed`, `focusX` and `focusY`.
- `texts`: bold white captions with a black outline. They're timed either absolutely (`start` and
  `end`) or against a segment (`seg`), and placed `upper`, `center` or `lower` inside `safe`. The
  TikTok edits keep text out of the top 150px and bottom 400px, plus 140px on the right for
  TikTok's buttons. The Twitter edits keep it in the middle band so nothing gets cropped. Text that
  starts at 0s appears without any animation, so the first frame works as a still.
- `endCard`: the logo slams in, then the `lines` fade in, over a blurred copy of the last frame
  while the game audio fades out.

Cuts land on the beat. The editor finds the tempo of the game's music and snaps each cut onto it
(the first frame is never moved), then adds or removes beats, longest segments first, until the
video fits its `duration` range. Loudness is normalised to −14 LUFS in linear mode, so The Calm
stays quiet compared with the rest.

## Self-test

```sh
node test/selftest.mjs     # writes to .tmp/selftest/
```

This records `test/fixture-game.html`, a small stand-in game used only for testing (it is **not**
Glydrift), and renders all four edits from it. Moments the test game doesn't have are mapped onto
moments it does. It's how this pipeline was checked: frame-locked capture, CSS-animation timing,
audio sync, beat snapping, captions, the logo end card, durations, sizes and the iPhone path.

## Files

```
record/record.mjs              recorder (Playwright)
record/inject/virtual-time.js  virtual clock (frame-locked capture)
record/inject/offline-audio.js in-sync capture of the game's own WebAudio
record/inject/demo-bot.js      ?demo bot
config/glydrift.adapter.js     game-specific hooks (TODO)
config/moments.json            what to record
config/edits/*.json            the four videos
build.mjs                      clips -> videos
iphone.mjs                     iPhone recording -> videos
lib/                           editor, beat tracker, ffmpeg helpers
```
