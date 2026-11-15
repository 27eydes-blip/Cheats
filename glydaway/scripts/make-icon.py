#!/usr/bin/env python3
"""Glydaway app icon, pixel art on a 48x48 grid (Glydrift's icon is 32x32).

The bird is Glydrift's own Volt, taken pixel for pixel from Glydrift's icon source
(icons/source/volt-glydrift-32.png), so the two icons share one mascot. Glydaway then tilts
him up into a glide (a RotSprite-style rotation: scale2x three times, rotate, sample back down,
so the pixels stay crisp) and sets him in its own world: a purple-to-teal night sky, a mint
glow (the GLYDAWAY title colour), a mint/cyan sparkle trail and a glowing city skyline.
No text. The bird sits inside the centre 80%.

    python3 glydaway/scripts/make-icon.py      (needs Pillow + numpy)

Writes glydaway/icons/: icon-1024.png (App Store, opaque, square corners), icon-180.png,
icon-120.png, icon-60.png, favicon-512.png, and glydaway-icon-48-source.png (the art itself).
"""
import math
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent.parent
OUT = HERE / "icons"
SRC = OUT / "source" / "volt-glydrift-32.png"
N = 48                      # art grid
TILT = 11                   # degrees: nose up and to the right, soaring away
BIRD_C = (24.0, 21.5)       # where the bird's centre sits on the grid


def hx(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)


def blend(a, b, t):
    return a * (1 - t) + b * t


# ---------------------------------------------------------------- 1. Volt, cut out of Glydrift's icon
src = np.array(Image.open(SRC).convert("RGB"))
BG = {(0xff, 0x7a, 0x1a), (0xff, 0x87, 0x1e), (0xff, 0x94, 0x23), (0xff, 0xa2, 0x27), (0xff, 0xbd, 0x30),
      (0xff, 0xca, 0x35), (0xff, 0xd8, 0x3a), (0xff, 0xf6, 0xc0)}  # Glydrift's sky bands and sparkle arms
H, W, _ = src.shape
part = np.array([[tuple(src[y, x]) not in BG for x in range(W)] for y in range(H)])
bird = np.zeros((H, W), bool)
q = deque([(16, 16)])
while q:  # the connected sticker around the centre (sparkles in the corners are left behind)
    y, x = q.popleft()
    if 0 <= y < H and 0 <= x < W and part[y, x] and not bird[y, x]:
        bird[y, x] = True
        q.extend([(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)])
rgba = np.zeros((H, W, 4), np.uint8)
rgba[..., :3] = src
rgba[..., 3] = np.where(bird, 255, 0)


def scale2x(a):
    """EPX/scale2x on an RGBA array: doubles it and smooths stair-steps without new colours."""
    key = (a[..., 0].astype(np.uint32) << 24) | (a[..., 1].astype(np.uint32) << 16) | (a[..., 2].astype(np.uint32) << 8) | a[..., 3]
    p = np.pad(key, 1, mode="edge")
    P = p[1:-1, 1:-1]; A = p[:-2, 1:-1]; B = p[1:-1, 2:]; C = p[1:-1, :-2]; D = p[2:, 1:-1]
    pa = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode="edge")
    cA = pa[:-2, 1:-1]; cB = pa[1:-1, 2:]; cC = pa[1:-1, :-2]; cD = pa[2:, 1:-1]
    e0 = np.where(((C == A) & (C != D) & (A != B))[..., None], cA, a)
    e1 = np.where(((A == B) & (A != C) & (B != D))[..., None], cB, a)
    e2 = np.where(((D == C) & (D != B) & (C != A))[..., None], cC, a)
    e3 = np.where(((B == D) & (B != A) & (D != C))[..., None], cD, a)
    out = np.zeros((a.shape[0] * 2, a.shape[1] * 2, 4), a.dtype)
    out[0::2, 0::2] = e0; out[0::2, 1::2] = e1; out[1::2, 0::2] = e2; out[1::2, 1::2] = e3
    return out


big = scale2x(scale2x(scale2x(rgba)))  # 8x
K = 8
ang = math.radians(TILT)
ca, sa = math.cos(ang), math.sin(ang)


def bird_px(x, y):
    """Colour of the tilted bird at art pixel (x, y), or None."""
    dx, dy = x + 0.5 - BIRD_C[0], y + 0.5 - BIRD_C[1]
    sx = dx * ca + dy * sa + 16.0  # inverse rotation (screen y points down: + is clockwise)
    sy = -dx * sa + dy * ca + 16.0
    ix, iy = int(math.floor(sx * K)), int(math.floor(sy * K))
    if 0 <= ix < W * K and 0 <= iy < H * K and big[iy, ix, 3] > 0:
        return big[iy, ix, :3].astype(float)
    return None


# ---------------------------------------------------------------- 2. the night sky (stepped bands, like Glydrift's)
SKY = ["#170833", "#1e0c47", "#26125a", "#2b1c6a", "#272f78", "#1d457c", "#135c7e", "#0c727e"]
art = np.zeros((N, N, 3))
for y in range(N):
    art[y, :] = hx(SKY[min(len(SKY) - 1, y * len(SKY) // N)])

MINT, CYAN, WHITE = hx("#7dffc8"), hx("#3ef4ff"), hx("#ffffff")
GLOW = hx("#5effc0")  # the GLYDAWAY title's mint, pushed a little brighter so it glows on the dark sky


def put(x, y, c, t=1.0):
    if 0 <= x < N and 0 <= y < N:
        art[y, x] = blend(art[y, x], c, t)


def sparkle(x, y, arm, t=1.0):  # a Glydrift-style plus sparkle
    put(x, y, WHITE, t)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        put(x + dx, y + dy, arm, t)


for sx, sy in ((5, 5), (42, 6), (6, 21), (43, 24)):
    sparkle(sx, sy, hx("#c8fff0"))
for sx, sy in ((14, 3), (33, 2), (2, 13), (46, 15), (38, 31), (10, 31)):
    put(sx, sy, hx("#b9a8ff"), 0.8)

# ---------------------------------------------------------------- 3. mint glow behind the bird (pixel-stepped rings)
for y in range(N):
    for x in range(N):
        d = math.hypot(x + 0.5 - BIRD_C[0], (y + 0.5 - BIRD_C[1]) * 1.06)
        t = 0.66 if d < 16.5 else 0.3 if d < 19.5 else 0
        if t and y < 36:  # the glow stays in the sky, above the city
            art[y, x] = blend(art[y, x], GLOW, t)

# ---------------------------------------------------------------- 4. the city skyline, glowing along its roofs
SKY_TOP = 38
back = np.zeros(N, int)   # roof row per column for the far (lighter) row of buildings
front = np.zeros(N, int)  # and the near row
x = 0
for w, h in [(4, 6), (3, 9), (5, 5), (2, 10), (4, 7), (3, 6), (5, 9), (3, 5), (4, 8), (3, 10), (4, 6), (5, 8), (3, 9)]:
    back[x:x + w] = N - h - 2; x += w
back[x:] = N - 6
x = 0
for w, h in [(5, 5), (4, 7), (3, 4), (5, 6), (2, 8), (4, 5), (6, 6), (3, 7), (5, 4), (4, 6), (3, 5), (4, 7), (5, 5)]:
    front[x:x + w] = N - h; x += w
front[x:] = N - 4
# two landmarks: a lattice tower on the left, a needle tower on the right
for i, hw in enumerate([0, 0, 1, 1, 1, 2, 2, 3, 3, 4]):  # a lattice tower, flaring at its base
    for xx in range(31 - hw, 32 + hw):
        front[xx] = min(front[xx], N - 12 + i)
for xx, h in ((42, 15), (43, 15), (41, 11), (44, 11), (40, 8), (45, 8)):  # a needle tower
    front[xx] = min(front[xx], N - h)
FRONT = hx("#0a0820")
WIN = [hx("#ffe9b0"), hx("#8ff7ff"), hx("#ff9ad5")]
for x in range(N):  # far buildings: a quiet silhouette, a shade darker than the sky behind them
    for y in range(back[x], N):
        art[y, x] = blend(art[y, x], hx("#120e3a"), 0.6)
for x in range(N):  # near buildings: dark, a mint glow along every roof, a few lit windows
    for y in range(front[x], N):
        art[y, x] = FRONT
        if x % 2 == 1 and y % 2 == 0 and y >= front[x] + 2 and (x * 7 + y * 3) % 5 < 2:
            art[y, x] = WIN[(x // 2 + y) % 3]
    put(x, front[x], MINT, 0.9)
for x in range(N):  # a soft neon haze over the city
    for k, t in ((1, 0.18), (2, 0.08)):
        put(x, back[x] - k, CYAN, t)

# ---------------------------------------------------------------- 5. the sparkle trail, streaming from behind the bird
# a curve from the lower-left edge of the sky up to the bird's trailing wing: white core, cyan, mint edges
P0, P1, P2 = (-1.0, 37.5), (5.0, 34.0), (10.5, 29.0)


def trail_at(f):  # quadratic curve, f = 0 at the far end, 1 at the bird
    u = 1 - f
    return (u * u * P0[0] + 2 * u * f * P1[0] + f * f * P2[0], u * u * P0[1] + 2 * u * f * P1[1] + f * f * P2[1])


for i in range(121):
    f = i / 120
    px, py = trail_at(f)
    ix, iy = int(math.floor(px)), int(math.floor(py))
    a = 0.3 + 0.7 * f
    put(ix, iy, CYAN, a)
    if f > 0.35:  # the streak widens and brightens toward the bird
        put(ix, iy - 1, MINT, a)
    if f > 0.7:
        put(ix, iy + 1, MINT, a * 0.8)
        put(ix, iy, WHITE, (f - 0.7) * 2.5)
for f, dx, dy, arm in ((0.86, -1, -4, MINT), (0.64, 1, 3, CYAN), (0.42, 0, -4, MINT), (0.18, 1, 3, CYAN)):
    px, py = trail_at(f)
    sparkle(int(px) + dx, int(py) + dy, arm, 0.45 + 0.55 * f)
for f, dy in ((0.75, 2), (0.5, -2), (0.3, 2)):
    px, py = trail_at(f)
    put(int(px), int(py) + dy, WHITE, 0.8)

# ---------------------------------------------------------------- 6. Volt on top
for y in range(N):
    for x in range(N):
        c = bird_px(x, y)
        if c is not None:
            art[y, x] = c

# keep the face upright on the tilted head: eyes, brows, beak and cheeks are 1-2 pixel details that
# rotation garbles, so they are stamped back unrotated at their rotated position (as a pixel artist would)
FACE = (9, 11, 23, 18)  # x0, y0, x1, y1 in the 32x32 source (exclusive ends)
fcx, fcy = (FACE[0] + FACE[2]) / 2, (FACE[1] + FACE[3]) / 2
rx, ry = fcx - 16.0, fcy - 16.0
ox = BIRD_C[0] + rx * ca - ry * sa - fcx  # where the face's centre lands, as an offset for the patch
oy = BIRD_C[1] + rx * sa + ry * ca - fcy
ox, oy = int(round(ox)), int(round(oy))
for y in range(FACE[1], FACE[3]):
    for x in range(FACE[0], FACE[2]):
        if bird[y, x]:
            c = tuple(src[y, x])
            if c in {(0xff, 0xff, 0xff), (0x07, 0x10, 0x1e), (0x0b, 0x18, 0x30), (0xff, 0xa3, 0x1a), (0xff, 0xd2, 0x3f), (0xff, 0x8f, 0xb8), (0x2a, 0xa8, 0xff)}:
                put(x + ox, y + oy, src[y, x].astype(float))

art8 = np.clip(np.round(art), 0, 255).astype(np.uint8)
OUT.mkdir(exist_ok=True)
Image.fromarray(art8, "RGB").save(OUT / "glydaway-icon-48-source.png")
big1024 = Image.fromarray(art8, "RGB").resize((1024, 1024), Image.NEAREST)  # crisp pixels
big1024.save(OUT / "icon-1024.png")
for size, name in ((512, "favicon-512.png"), (180, "icon-180.png"), (120, "icon-120.png"), (60, "icon-60.png")):
    big1024.resize((size, size), Image.LANCZOS).convert("RGB").save(OUT / name)
print("wrote", sorted(p.name for p in OUT.glob("*.png")))
