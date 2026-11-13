#!/usr/bin/env python3
"""Turn an iPhone screen recording of Glydrift into a TikTok-ready video.

Output: 1080x1920, 30 fps, H.264 (yuv420p, +faststart) + AAC. The recording is cropped to 9:16
from the centre (never letterboxed) and scaled with nearest-neighbour (crisp pixel art). Bold
white text with a thick black outline stays inside TikTok's safe area (y 150..1470). Zoom
punches (or jump cuts) land on the beat of the game track, and the video ends with the same
1.5 s GLYDRIFT logo + glydrift.com card as the other Glydrift TikToks.

Needs only Python 3 + Pillow + numpy, and ffmpeg/ffprobe on the PATH. See README.md.
"""
import argparse, json, math, os, re, subprocess, sys, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
W, H, FPS, SR = 1080, 1920, 30, 48000
SAFE_TOP, SAFE_BOT = 150, 1470
TRACKS = json.load(open(os.path.join(ASSETS, "tracks.json")))


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def probe(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries",
                                   "stream=codec_type,width,height,r_frame_rate:stream_tags=rotate:stream_side_data=rotation:format=duration",
                                   "-of", "json", path])
    j = json.loads(out)
    v = next(s for s in j["streams"] if s["codec_type"] == "video")
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(float(sd["rotation"]))
    rot = int(v.get("tags", {}).get("rotate", rot) or 0)
    w, h = v["width"], v["height"]
    if abs(rot) % 180 == 90:  # ffmpeg auto-rotates: report the displayed size
        w, h = h, w
    has_audio = any(s["codec_type"] == "audio" for s in j["streams"])
    return w, h, float(j["format"]["duration"]), has_audio


# ------------------------------------------------------------------ text + logo
_fonts = {}


def font(kind, size):
    k = (kind, size)
    if k not in _fonts:
        f = {"orb": "Orbitron-Black.ttf", "raj": "Rajdhani-Bold.ttf"}[kind]
        _fonts[k] = ImageFont.truetype(os.path.join(ASSETS, f), size)
    return _fonts[k]


def text_layer(text, size=84, kind="orb", maxw=980, fill=(255, 255, 255), stroke=(0, 0, 0), sw=None):
    while True:
        f = font(kind, size)
        s = sw if sw is not None else max(6, round(size * 0.13))
        lines = []
        for para in text.split("\\n"):
            cur = ""
            for w in para.split(" "):
                t = (cur + " " + w).strip()
                if f.getlength(t) + 2 * s <= maxw or not cur:
                    cur = t
                else:
                    lines.append(cur)
                    cur = w
            lines.append(cur)
        widest = max(f.getlength(l) for l in lines) + 2 * s
        if widest <= maxw or size <= 30:
            break
        size -= 4
    asc, desc = f.getmetrics()
    lh = int((asc + desc) * 1.09)
    pad = s + 4
    im = Image.new("RGBA", (int(widest) + 2 * pad, lh * len(lines) + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i, l in enumerate(lines):
        d.text(((im.width - f.getlength(l)) / 2, pad + i * lh), l, font=f, fill=fill, stroke_width=s, stroke_fill=stroke)
    return im


def ease_out(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


def ease_back(x):
    x = max(0.0, min(1.0, x))
    return 1 + 2.9 * (x - 1) ** 3 + 1.9 * (x - 1) ** 2


def place(canvas, layer, cx, cy, scale=1.0, alpha=1.0):
    if scale != 1.0:
        layer = layer.resize((max(1, int(layer.width * scale)), max(1, int(layer.height * scale))), Image.BICUBIC)
    if alpha < 1.0:
        layer = layer.copy()
        layer.putalpha(layer.getchannel("A").point(lambda v: int(v * alpha)))
    canvas.alpha_composite(layer, (int(cx - layer.width / 2), int(cy - layer.height / 2)))


_logo = {}


def logo():
    if "l" not in _logo:
        f = font("orb", 150)
        im = Image.new("RGBA", (int(f.getlength("GLYDRIFT")) + 160, 300), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((60, 60), "GLYDRIFT", font=f, fill=(255, 255, 255), stroke_width=9, stroke_fill=(62, 244, 255))
        g = Image.new("RGBA", im.size, (62, 244, 255, 0))
        g.putalpha(im.getchannel("A").filter(ImageFilter.GaussianBlur(22)).point(lambda v: min(255, int(v * 2.2))))
        g.alpha_composite(im)
        g = g.crop(g.getbbox())
        if g.width > 1000:
            g = g.resize((1000, int(g.height * 1000 / g.width)), Image.LANCZOS)
        bird = Image.open(os.path.join(ASSETS, "bird.png")).convert("RGBA")
        _logo["l"] = (g, bird.resize((bird.width * 12, bird.height * 12), Image.NEAREST),
                      text_layer("glydrift.com", 92, "raj", sw=10))
    return _logo["l"]


def end_card(bg, k):
    t = k / FPS
    g, bird, url = logo()
    im = Image.blend(bg, Image.new("RGB", (W, H), (6, 3, 18)), min(0.78, 0.25 + t * 3)).convert("RGBA")
    place(im, bird, W / 2, 640 - 14 * math.sin(t * 6), max(0.01, ease_back(t / 0.3)))
    place(im, g, W / 2, 1000, max(0.01, 0.7 + 0.3 * ease_back((t - 0.12) / 0.3)), min(1, max(0, (t - 0.1) * 6)))
    place(im, url, W / 2, 1180, max(0.01, 0.7 + 0.3 * ease_back((t - 0.25) / 0.3)), min(1, max(0, (t - 0.22) * 6)))
    return im.convert("RGB")


# ------------------------------------------------------------------ audio
def decode(path, start=0.0, dur=None):
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{start:.3f}", "-i", path]
    if dur:
        cmd += ["-t", f"{dur:.3f}"]
    cmd += ["-vn", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"]
    return np.frombuffer(subprocess.check_output(cmd), np.float32).reshape(-1, 2).copy()


def game_track(name, music_dir, dur, bar=0):
    """Mix a realm track's four stems (drums, bass, skank, lead) the way the game plays them."""
    t = TRACKS[name]
    n = int(dur * SR)
    out = np.zeros((n, 2), np.float32)
    off, L = int(t["pad"] * SR), int(round(t["length"] * SR))
    for stem, file in t["files"].items():
        p = os.path.join(music_dir, file)
        if not os.path.exists(p):
            sys.exit(f"missing stem {p} (point --music-dir at glydrift/public/music)")
        a = decode(p)[off: off + L]
        a = np.concatenate([a, np.zeros((max(0, L - len(a)), 2), np.float32)])
        q = int(round(bar * t["bar"] * SR)) % L
        out += np.concatenate([a[q:], np.tile(a, (n // L + 2, 1))])[:n]
    return out


def write_wav(path, a):
    w = wave.open(path, "wb")
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes())
    w.close()


# ------------------------------------------------------------------ main
def parse_text(specs, dur):
    """'line' (auto-spaced) or 'START-END:line' (seconds)."""
    timed, auto = [], []
    for s in specs:
        m = re.match(r"^\s*([\d.]+)\s*-\s*([\d.]+)\s*:(.*)$", s)
        if m:
            timed.append((float(m.group(1)), float(m.group(2)), m.group(3).strip()))
        else:
            auto.append(s)
    if auto:
        step = dur / len(auto)
        for i, s in enumerate(auto):
            timed.append((i * step, (i + 1) * step, s))
    return timed


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help="screen recording (any resolution / fps, e.g. 1179x2556 or 1290x2796)")
    ap.add_argument("--out", required=True, help="output .mp4")
    ap.add_argument("--text", action="append", default=[], help='text line, repeatable: "line" (auto-spaced) or "START-END:line" in seconds; \\n = new line')
    ap.add_argument("--text-y", type=int, default=420, help="vertical centre of the text (kept inside y 150..1470)")
    ap.add_argument("--text-size", type=int, default=84)
    ap.add_argument("--track", default=None, choices=sorted(TRACKS), help="game track for the BPM (and the music with --music-dir)")
    ap.add_argument("--bpm", type=float, default=None, help="beats per minute for the cuts (default: the track's, else 90 = Neon Void)")
    ap.add_argument("--cuts", default="auto", help="'auto' (every 2 or 4 beats, 1-2 s apart), a number of beats, or 'off'")
    ap.add_argument("--cut-style", default="punch", choices=["punch", "jump"], help="punch: zoom punch on each beat cut; jump: also skip --jump-skip s of footage at each cut")
    ap.add_argument("--jump-skip", type=float, default=0.5)
    ap.add_argument("--music", default=None, help="audio file to use as the soundtrack (e.g. a mixed game track); replaces the recording's audio")
    ap.add_argument("--music-dir", default=None, help="glydrift/public/music: with --track, mix that track's stems as the soundtrack")
    ap.add_argument("--music-start", type=float, default=0.0, help="seconds into --music to start from")
    ap.add_argument("--keep-audio", type=float, default=None, help="also keep the recording's own audio at this level (0..1) under the music")
    ap.add_argument("--start", type=float, default=0.0, help="trim: start (s)")
    ap.add_argument("--end", type=float, default=None, help="trim: end (s)")
    ap.add_argument("--punch", type=float, default=0.08, help="zoom punch amount (0 = none)")
    ap.add_argument("--no-end-card", action="store_true")
    ap.add_argument("--crf", type=int, default=21)
    a = ap.parse_args()

    iw, ih, idur, has_audio = probe(a.input)
    end = min(a.end or idur, idur)
    dur = end - a.start
    if dur <= 0.5:
        sys.exit("nothing left after trimming")
    bpm = a.bpm or (TRACKS[a.track]["bpm"] if a.track else None)
    if not bpm and a.music:
        for name, t in TRACKS.items():
            if os.path.basename(a.music).startswith(name + "-"):
                bpm = t["bpm"]
    bpm = bpm or 90.0
    beat = 60.0 / bpm
    if a.cuts == "off":
        every = None
    elif a.cuts == "auto":
        every = 2 if 2 * beat >= 1.0 else 4  # cuts 1-2 s apart
        if every * beat > 2.0:
            every = 1
    else:
        every = float(a.cuts)
    cut_len = every * beat if every else None
    endn = 0 if a.no_end_card else int(1.5 * FPS)

    # crop to 9:16 from the centre, then nearest-neighbour to 1080x1920 (no bars, no blur)
    if iw / ih > W / H:
        cw, ch = int(ih * W / H) // 2 * 2, ih
    else:
        cw, ch = iw, int(iw * H / W) // 2 * 2
    vf = f"crop={cw}:{ch}:{(iw - cw) // 2}:{(ih - ch) // 2},scale={W}:{H}:flags=neighbor,fps={FPS}"
    reader = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{a.start:.3f}", "-i", a.input, "-t", f"{dur:.3f}",
                               "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    fb = W * H * 3

    def next_frame():
        b = reader.stdout.read(fb)
        return Image.frombytes("RGB", (W, H), b) if len(b) == fb else None

    texts = parse_text(a.text, dur if a.cut_style == "punch" else dur)
    layers = {}
    ty = a.text_y

    tmp = tempfile.mkdtemp(prefix="glytt-")
    vtmp = os.path.join(tmp, "v.mp4")
    enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "slow", "-crf", str(a.crf), "-maxrate", "6M", "-bufsize", "12M",
                            "-pix_fmt", "yuv420p", "-an", vtmp], stdin=subprocess.PIPE)
    out_i = 0
    src_t = 0.0  # seconds of the recording used so far (for the audio)
    pieces = []  # (src_start, out_start, length) for the recording's audio
    last = None
    piece_start = (0.0, 0.0)
    while True:
        tv = out_i / FPS
        im = next_frame()
        if im is None:
            break
        src_t += 1 / FPS
        # beat cut?
        if cut_len:
            k = tv / cut_len
            phase = (k - math.floor(k)) * cut_len
            new_cut = out_i > 0 and math.floor((out_i - 1) / FPS / cut_len) != math.floor(k)
            if new_cut and a.cut_style == "jump" and a.jump_skip > 0:
                pieces.append((piece_start[0], piece_start[1], src_t - 1 / FPS - piece_start[0]))
                for _ in range(int(a.jump_skip * FPS)):
                    if next_frame() is None:
                        break
                    src_t += 1 / FPS
                piece_start = (src_t - 1 / FPS, tv)
            z = 1 + a.punch * (1 - ease_out(phase / 0.23)) if out_i > 0 or phase > 0 else 1
            if a.punch and z > 1.001:
                cw2, ch2 = W / z, H / z
                im = im.resize((W, H), Image.NEAREST, box=((W - cw2) / 2, (H - ch2) / 2, (W + cw2) / 2, (H + ch2) / 2))
        clean = im
        canvas = im.convert("RGBA")
        for (t0, t1, s) in texts:
            if t0 <= tv < t1:
                if s not in layers:
                    layers[s] = text_layer(s, a.text_size)
                lay = layers[s]
                cy = min(max(ty, SAFE_TOP + lay.height / 2), SAFE_BOT - lay.height / 2)
                kk = (tv - t0) / 0.22
                al = min(1.0, kk * 2.5) * (min(1.0, (t1 - tv) / 0.12) if t1 < dur - 0.01 else 1)
                place(canvas, lay, W / 2, cy, 0.6 + 0.4 * ease_back(kk), max(0, al))
        enc.stdin.write(canvas.convert("RGB").tobytes())
        last = clean
        out_i += 1
    pieces.append((piece_start[0], piece_start[1], src_t - piece_start[0]))
    reader.wait()
    if last is None:
        sys.exit("could not read any frames")
    base = last
    for k in range(endn):
        enc.stdin.write(end_card(base, k).tobytes())
    enc.stdin.close()
    enc.wait()
    total = (out_i + endn) / FPS

    # audio
    n = int(total * SR)
    mix = np.zeros((n, 2), np.float32)
    rec_level = None
    if a.music or (a.music_dir and a.track):
        if a.music:
            m = decode(a.music, a.music_start)
            if len(m) < n:
                m = np.tile(m, (n // max(1, len(m)) + 1, 1))
        else:
            m = game_track(a.track, a.music_dir, total)
        mix += m[:n]
        rec_level = a.keep_audio
    elif has_audio:
        rec_level = 1.0
    if rec_level and has_audio:
        rec = decode(a.input, a.start, dur)
        for (s0, o0, ln) in pieces:
            i0, j0, L = int(s0 * SR), int(o0 * SR), int(ln * SR)
            seg = rec[i0: i0 + L]
            j1 = min(n, j0 + len(seg))
            mix[j0:j1] += seg[: j1 - j0] * rec_level
    fl = int(0.35 * SR)
    mix[-fl:] *= np.linspace(1, 0, fl, dtype=np.float32)[:, None]
    wavp = os.path.join(tmp, "a.wav")
    write_wav(wavp, mix)
    run(["ffmpeg", "-y", "-v", "error", "-i", vtmp, "-i", wavp, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
         "-af", "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
         "-shortest", "-movflags", "+faststart", a.out])
    print(f"wrote {a.out}: {total:.2f} s, {os.path.getsize(a.out) / 1e6:.1f} MB, cuts every {cut_len and round(cut_len, 3)} s ({bpm:g} BPM)")


if __name__ == "__main__":
    main()
