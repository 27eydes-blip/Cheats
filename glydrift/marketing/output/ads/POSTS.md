# Glydrift ads: what to post (2026-11-05)

© 2026 Sammy Eyde. All rights reserved.

All footage is the real game: a demo bot plays a full run, recorded frame by frame at 60 fps,
with the game's own music and sound. Every number on screen comes from the game: 7 worlds,
4 secret dimensions, 58 heroes in the hero carousel (shown as "50+"), the Abyss at 2,000 m, and
the bot's run of 2,178 m.

The videos end on **PLAY FREE · LINK IN BIO** and contain no web address, because the site is
moving to Cloudflare. **Put the new game link in your TikTok bio and in each X post** once the
move is live.

---

## TikTok (1080×1920, 30 fps, sound on; all text kept clear of TikTok's buttons)

### 1. `tiktok_abyss.mp4` (23.7 s): post this first

Opens on the wildest near-miss with "POV: you made it to the Abyss". Then a run through Solar
Storm and Frozen Nebula, "it gets quiet... / ...too quiet" as the lights go out, the ABYSS
title slamming in, the crash, NEW BEST, and the logo.

**Caption:** it gets quiet right before the Abyss… then the lights go out 🖤 how far would you make it?

**Hashtags:** #indiegame #pixelart #arcadegame #gamedev #mobilegame #fyp

### 2. `tiktok_challenge.mp4` (15.3 s)

"can you reach 2,000 m?", then near-misses, "it only gets faster", the Abyss, the crash, and
the end card: "I hit 2,178 m. beat it."

**Caption:** one tap. that's it. I hit 2,178 m, drop your best below 👇

**Hashtags:** #challenge #arcadegame #indiegame #pixelart #onetap #fyp

Reply to commenters' scores. Challenge videos grow through the comments.

### 3. `tiktok_heroes.mp4` (15.0 s)

The menu ("one tap. that's the whole game."), the hero carousel ("50+ heroes"), three worlds
("7 worlds"), and "+ 4 secret dimensions".

**Caption:** 50+ heroes, 7 worlds, 4 secret dimensions… and all you do is tap. which hero are you picking?

**Hashtags:** #pixelart #indiegame #gamedev #retrogaming #arcadegame #fyp

**Posting tips:**
- Post one a day rather than all three at once.
- Use the game's own sound (it's original), or add a trending sound at low volume underneath.
- Pin the first comment: "play free, link in bio".

---

## X / Twitter

### Video post: `x_abyss_16x9.mp4` (1920×1080, 23.7 s)

> It gets quiet right before the Abyss… then the lights go out. 🖤
>
> Glydrift: a one-tap neon arcade flyer. 7 worlds, 4 secret dimensions, 50+ heroes. Free in your browser.
>
> ▶️ [game link]
>
> #indiegame #pixelart #gamedev

X also plays vertical video, so `tiktok_abyss.mp4` works there too. The 16:9 version fills
more of the timeline on desktop.

### Image posts (1600×900)

**`x_still_abyss.png`**
> Survive the Abyss. It gets dark at 2,000 m. 🖤 Play Glydrift free: [game link] #indiegame #pixelart

**`x_still_nearmiss.png`**
> One tap. No mercy. Thread the gap, chain the close calls. ⚡ [game link] #arcadegame #indiedev

**`x_still_heroes.png`**
> 50+ heroes. 7 worlds. 4 secret dimensions to find. Which one's yours? [game link] #pixelart #gamedev

### Thread starter (all three images in one post)

> I made a one-tap neon arcade game. 🐦⚡
>
> 7 worlds, 4 secret dimensions, 50+ heroes, its own soundtrack, and an Abyss that turns the lights off at 2,000 m.
>
> Free in your browser 👇
> [game link]

---

## Remaking them

```bash
cd glydrift
npm run build:test
node marketing/record.cjs     # ~10 min: new 60 fps footage + audio → marketing/work/
node marketing/edit-ads.cjs   # ~3 min: all of the above → marketing/output/ads/
```

`REEL_SEED=123 node marketing/record.cjs` records a different run.
