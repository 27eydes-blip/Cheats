# make_tiktok.py

Turns an iPhone screen recording of Glydrift into a TikTok-ready video, in the same style as
the ten videos in `marketing/tiktok/`:

- 1080x1920, 30 fps, H.264 (yuv420p, +faststart) + AAC
- cropped to 9:16 from the centre (no black bars), scaled with nearest-neighbour (crisp pixels)
- bold white text with a thick black outline, always inside TikTok's safe area (y 150-1470)
- zoom punches (or jump cuts) on the beat of a game track (every 2 or 4 beats, 1-2 s apart)
- the 1.5 s GLYDRIFT logo + glydrift.com ending

Needs Python 3 with Pillow and numpy, and `ffmpeg` / `ffprobe` on the PATH. Fonts (Orbitron,
Rajdhani, SIL Open Font License), the app-icon bird and the track list (BPM, stems) are in
`assets/`.

## Usage

```sh
python3 make_tiktok.py RECORDING.mov --out my-video.mp4 \
  --text "0-2.5:I almost had it" --text "2.5-6:one more try..." \
  --track abyss --music-dir ../../../public/music \
  --start 3 --end 18
```

| option | what it does |
| --- | --- |
| `--text "line"` | repeatable. `"line"` alone: the lines share the video evenly. `"START-END:line"`: shown from START to END seconds. `\n` breaks a line. |
| `--text-y 420` / `--text-size 84` | where the text sits (clamped to the safe area) and how big it is |
| `--track NAME` | the game track whose BPM sets the cuts: void, sakura, solar, frozen, glitch, abyss, valley, hurricane, prism, tidal, chrono, mirror, menu |
| `--music-dir DIR` | with `--track`: mixes that track's four pre-rendered stems (glydrift/public/music) as the soundtrack |
| `--music FILE` | any audio file as the soundtrack instead (replaces the recording's audio) |
| `--keep-audio 0.6` | keep the recording's own game sound under the music at this level |
| `--bpm 140` | set the tempo by hand (default: the track's, else 90 = Neon Void) |
| `--cuts auto` | `auto` = every 2 or 4 beats (1-2 s apart), a number = beats per cut, `off` = no cuts |
| `--cut-style punch` | `punch` = a zoom punch on every cut; `jump` = also skips `--jump-skip` s of footage at every cut (tighter montage) |
| `--start` / `--end` | trim the recording (seconds) |
| `--punch 0.08` | how hard the zoom punch is (0 = none) |
| `--no-end-card` | leave out the logo ending |

Without `--music` / `--music-dir` the recording's own audio is kept (turn the game's sound on
while recording; iOS screen recording captures app audio).

## Test (what was run)

A fake "iPhone recording" (1179x2556, 60 fps, with the game's sound effects) was made from a
captured clip and run through the script:

```sh
python3 make_tiktok.py fake-iphone.mov --out test-tool.mp4 \
  --text "0-2:POV: you tap once" --text "2-4:and it gets FAST" \
  --track void --music-dir /path/to/glydrift/public/music --keep-audio 0.8
# wrote test-tool.mp4: 5.50 s, 3.2 MB, cuts every 1.333 s (90 BPM)
```

The result was checked with ffprobe (1080x1920, 30 fps, h264 + aac) and by looking at frames.
