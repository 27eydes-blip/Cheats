# Story ads (1080x1920 PNG) into marketing/story/: run from the TikTok work folder (needs its captured frames and compose.py).
from videos import *
OUTD = f"{GAME}/marketing/story"
def grad(im, top=700, bot=760):
    a = np.zeros((H, 1), np.float32)
    y = np.arange(H)
    a[:, 0] = np.clip(1.25 - y / top, 0, 1) * 0.95 + np.clip((y - (H - bot)) / bot, 0, 1) * 0.92
    a = (a * 255).astype(np.uint8).repeat(W, 1)
    dark = Image.new("RGBA", (W, H), (6, 3, 18, 255)); dark.putalpha(Image.fromarray(a))
    im.alpha_composite(dark)
def pill(im, text, cy, col):
    t = text_layer(text, 64, (6, 3, 18), col, 0, "orb")
    w, h = t.width + 110, t.height + 56
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((W/2-w/2, cy-h/2, W/2+w/2, cy+h/2), h//2, fill=col + (255,))
    place(im, t, W/2, cy)
def footer(im, cta="PLAY FREE", col=(62, 244, 255)):
    pill(im, cta, 1330, col)
    lg = logo_layer()
    place(im, lg, W/2, 1480, 0.62)
    place(im, text_layer("glydrift.com", 80, (255,255,255), (0,0,0), 9, "raj"), W/2, 1590)
def bg(clip, i, z=1.1, fy=0.5):
    return zoomed(load(clip, i), z, 0.5, fy).convert("RGBA")
LAST = [0]
def head(im, lines, col=(255,255,255), y=380, size=104):
    t = text_layer(lines, size, col); LAST[0] = place(im, t, W/2, y + t.height/2 - 60)[3]
def sub(im, text, y=None, col=(255,255,255), size=62):
    t = text_layer(text, size, col, (0,0,0), 9, "raj"); place(im, t, W/2, LAST[0] + 30 + t.height/2)
def save(im, name):
    im.convert("RGB").save(f"{OUTD}/{name}.png", optimize=True); print(name)

z = zones("journey")
# 1 abyss
im = bg("abyss", 720, 1.15, 0.42); grad(im)
head(im, "CAN YOU SURVIVE\nTHE ABYSS?", (255, 80, 130), 300, 96); sub(im, "99% of players don't.")
footer(im, "TRY IT FREE", (255, 45, 120)); save(im, "01-survive-the-abyss")
# 2 realms collage
im = Image.new("RGBA", (W, H), (6, 3, 18, 255))
picks = [("journey", 1051, "SAKURA SKIES", "sakura"), ("journey", 1788, "SOLAR STORM", "solar"),
         ("journey", 2488, "FROZEN NEBULA", "frozen"), ("journey", 4241, "PEACEFUL VALLEY", "valley")]
cw, chh = W // 2, 380
for k, (c, i, nm, r) in enumerate(picks):
    f = load(c, i).crop((0, 330, W, 330 + int(W / cw * chh))).resize((cw, chh), Image.NEAREST).convert("RGBA")
    x, y = (k % 2) * cw, 380 + (k // 2) * chh
    im.alpha_composite(f, (x, y))
    place(im, text_layer(nm, 40, RCOL[r], (0,0,0), 7), x + cw/2, y + chh - 50)
d = ImageDraw.Draw(im); d.line((cw, 380, cw, 380 + 2*chh), fill=(6,3,18), width=8); d.line((0, 380+chh, W, 380+chh), fill=(6,3,18), width=8)
grad(im, 300, 500)
head(im, "8 WILD REALMS", (255,255,255), 250, 96)
place(im, text_layer("+ 4 SECRET DIMENSIONS", 52, (255, 210, 80), (0,0,0), 8), W/2, 380 + 2*chh + 60)
footer(im); save(im, "02-8-wild-realms")
# 3 near miss
im = bg("nearmiss", 900, 1.2, 0.62); grad(im)
head(im, "ONE TAP.\nZERO MERCY.", (255,255,255), 300, 112)
footer(im, "PLAY FREE", (255, 143, 216)); save(im, "03-one-tap-zero-mercy")
# 4 jamal
fr = load("jamal", 400)
im = zoomed(fr, 1.0).convert("RGBA").filter(ImageFilter.GaussianBlur(6))
cut = fr.crop((0, 380, 400, 780)).resize((960, 960), Image.NEAREST).convert("RGBA")
im.alpha_composite(cut, (60, 400)); grad(im)
head(im, "MEET JAMAL", (255,255,255), 300, 112); sub(im, "the ugliest Legendary ever made")
footer(im, "UNLOCK HIM FREE", (57, 255, 136)); save(im, "04-meet-jamal")
# 5 reveal
im = Image.new("RGBA", (W, H), (6, 3, 18, 255)); im.alpha_composite(load("reveal", 120).crop((0, 60, W, H)).convert("RGBA"), (0, 0)); grad(im, 460, 700)
head(im, "30+ HEROES\nTO UNLOCK", (255,255,255), 300, 100)
footer(im, "COLLECT THEM ALL", (57, 255, 136)); save(im, "05-30-heroes")
# 6 beat my score
im = bg("best14k", 300, 1.15, 0.45); grad(im)
head(im, "BEAT MY\nSCORE", (255,255,255), 300, 112); sub(im, "13,981. Your turn.", None, (255, 210, 80), 72)
footer(im, "CHALLENGE ACCEPTED", (213, 140, 255)); save(im, "06-beat-my-score")
# 7 crown
lb = load("leaderboard", 40)
im = Image.new("RGBA", (W, H), (6, 3, 18, 255))
im.alpha_composite(lb.crop((0, 300, W, 1250)).convert("RGBA"), (0, 400)); grad(im, 420, 760)
head(im, "WIN THE\nALL MIGHTY CROWN", (255, 210, 80), 250, 80)
footer(im, "CLIMB TO #1", (255, 210, 80)); save(im, "07-all-mighty-crown")
