# Glydrift: Authorship

© 2026 Sam Eyde III. All rights reserved.

Glydrift was created by **Sam Eyde III**. Sam came up with the game, named it, designed its
characters and worlds, and directed every feature, change and fix. The code and the pixel art
were written with **Claude Code**, an AI coding tool, working from Sam's direction.

This document draws on the git history of this repository (`27eydes-blip/Cheats`, folder
`glydrift/`) and on the project's own files. Wherever a fact did not come from git, the text
says so.

---

## At a glance

| | |
| --- | --- |
| First commit | **2 November 2026**, 00:39 UTC ("Add Glydrift: neon-cosmos one-tap arcade game") |
| Days worked | **5 calendar days** (2–6 November 2026), with commits on every one of them |
| Commits (main Glydrift line) | **196**: 183 made in Claude Code sessions, 13 from the CI bot recording test screenshots |
| Commits (all branches) | **275** distinct commits touch `glydrift/` across all branches |
| Lines added / removed | **+80,433 / −17,340** on the main line (text files; binary screenshots not counted) |
| Files in the project | 538 |

Where these numbers come from: `git log` on `glydrift/` along the main Glydrift branch
(`claude/glydrift-arcade-game-7hznpc`), measured on 6 November 2026. Every commit is authored as
"Claude" because Claude Code made the commits. The ideas and decisions behind them were
Sam's.

---

## Timeline of major milestones

### Before any code: Beat Glider → Glydr → Glydrift
*Source: Sam's notes. This stage came before any code was written, so it isn't in git.*
- **Beat Glider:** the game's first name.
- **Glydr:** the second name.
- **Glydrift:** the final name, and the one the game carries from its very first commit.

### 2 November 2026: Day 1, the game and the pixel-art pivot
- **00:39** Glydrift is born: a one-tap, portrait, neon-cosmos arcade flyer (Phaser 3 + Vite,
  ready to be wrapped as an iOS app with Capacitor).
- **01:30** High-contrast neon restyle and procedurally generated **house music**.
- **01:43** Online leaderboard (Supabase) and a playable web app on GitHub Pages.
- **02:11–03:06** Play-feel tuning: a smaller flyer, **VOLT** redrawn as a neon storm bird
  with flapping wings, crusher walls taken out of the game.
- **04:03** First app icon, built around VOLT.
- **04:21 The pixel-art pivot.** The neon vector look is replaced by a full **pixel-art
  overhaul**: a pixel pipeline, the five original biomes redrawn, and six pixel heroes. More
  pixel heroes follow within the hour (Bloom, Tide, Mecha, Draco).
- **05:21** Each biome gets its own signature hazards, plus **The Calm** and the Abyss entrance.
- **13:18–16:44** iPad support, the **Lucky Spin** wheel with 10 heroes you can only win there,
  and 10 shop heroes, **RONIN** among them.

### 3 November 2026: Realms, dimensions and the hero roster
- **01:49** A much easier Abyss, followed by two new biomes: **Peaceful Valley** and **Hurricane**.
- **02:26** Runs get combos, perfects, milestones and Lucky Runs.
- **02:33–02:45** A link-in-bio page for TikTok, with the footer "Created by Sam Eyde III".
- **04:36** **Dimensions**: a rift after the Hurricane opens into four new worlds (Prism Rift,
  Tidal Sky, Chrono Fracture, Mirror Realm).
- **14:07–20:29** New heroes: **SMASH**, **MILZZZ**, **MANNY**, **WALLRUNNER**, **SPRINGER**,
  **DZR**, **YARMS**.
- **16:51** Coin shop with cosmetics, a Daily Shop, Mystery Pods and Collections.
- **21:30** Shop redesign with neon offer cards, the Daily Drift Drop, biome bundles and the
  first **Drift Pass**.
- **22:47** Hero customisation: trails, death effects, hats, skins, flap effects.

### 4 November 2026: The tiger, seasons, accounts and Drift Pass+
- **00:08** **손주원**, a Legendary storm-surfing white tiger, along with a Korean pixel font
  so the name shows in Hangul.
- **01:09–01:22** Four-week **Seasons** driven by remote config, and the Drift Pass rebuilt as
  a full-screen **50-tier season pass**.
- **01:58** RONIN gets perks: +13 coins per run and Fire Ward in the Solar Storm.
- **03:06–05:59** A full quality sweep, plus automatic tests on every device and browser.
- **19:29** Realm changes never pause a run.
- **19:33** Two leaderboards: DISTANCE and SCORE.
- **19:54** **Accounts and cloud save.**
- **19:59** Titles.
- **20:09** **Drift Pass+**, a paid track at $3.99 per season.
- **21:37** 10 Drift Pass+ Season 1 heroes.
- **21:57–23:06** A flow-and-feel pass and a micro-polish pass.
- **23:54 onward** Scenery passes on all five core realms: Frozen Nebula, Solar Storm,
  Neon Void, Glitch Realm, Abyss.

### 5 November 2026: glydrift.com
- **04:43–04:57** Two hazards that were too hard come out (the Corrupt Column and the Neon Void
  vertical laser).
- **06:31** **The move to glydrift.com** (Cloudflare Pages), with phone-friendly setup steps.
- **07:34** The move is turned into a launch event: the **Founding Drifter** reward.
- **14:44** **MATTOE**, the big toe with a massive aura.
- **20:52** New app icon: VOLT seen head-on, in pixel art.
- **20:59** Score becomes the main leaderboard.

### 6 November 2026: Drift Pass+ rewards, SXE, reggae and Level Mode
- **00:36–01:09** Drift Pass+ Season 1 rewards, checked on the server.
- **03:04** **SPLICE**, a Legendary black peregrine falcon, is added. **03:19** He is renamed
  **SXE**, priced at 50,000 coins and made indestructible in the Glitch Realm. **03:23** His
  combo goes up to x13. **03:47** He gets his own Afterburner trail.
- **04:09** **The music changes direction:** a pre-rendered **reggae soundtrack**, one
  continuous mix, replaces the procedural house music.
- **06:25** **Level Mode** begins: the level engine, a map and a level-complete screen.
- **08:33–10:50** All five batches go live, 50 levels in total across the five core realms.
- **12:09** The latest commit on the main line: map layout fixes for notched phones.

---

## Sam's creative decisions

### The concept
A **one-tap, portrait arcade flyer**: tap to flap through a scrolling cosmos that keeps
speeding up. One hit ends the run, and you're flying again the instant you tap retry. You travel
through a chain of themed worlds, each with its own hazards. Sam then built on that core with
collectible heroes, a season pass, competitive leaderboards and a hand-designed Level Mode.

### The names
- The game: **Beat Glider → Glydr → Glydrift**.
- The season pass: **Drift Pass** and **Drift Pass+**. Related names include the **Daily Drift
  Drop** and the **Founding Drifter** launch reward.

### Characters
Sam designed the cast. Some highlights:

| Hero | Who they are |
| --- | --- |
| **VOLT** | The Storm Bird, the original hero and the face of the app icon |
| **RONIN** | Ninja Crow (Epic). Earns +13 coins per run and has Fire Ward in the Solar Storm |
| **YARMS** | "All Arms" (Legendary). A hero who is just two huge arms |
| **손주원** | The tiger: a Legendary storm-surfing white tiger, Storm Surfer, whose name always shows in Korean |
| **SXE** (first named **SPLICE**) | Black Peregrine falcon (Legendary, 50,000 coins). +25% speed, indestructible in the Glitch Realm, combo up to x13, Afterburner trail |
| **MATTOE** | The Big Toe (Epic), with a massive aura |
| **SMASH** | Mantis Shrimp: a MEGA LEGENDARY hero available for 24 hours only |
| **MILZZZ** | Red-Eyed Tree Frog (Ultra Legendary), the hardest hero to get, with a double jump |
| **MANNY** | Gold-Nosed Black Bear (Epic) |
| **WALLRUNNER** | Leprechaun (Legendary). Runs move 20% faster, and every coin he picks up is worth 15 |
| **SPRINGER** | Hockey Player (Legendary), wearing a big number 9 |
| **DZR** | Matte blue Velociraptor (Legendary) |

The wider roster includes the first pixel heroes (Ember, Frost, Shade, Glitch, Nova, Bloom,
Tide, Mecha, Draco); the shop and Lucky Spin heroes (Pip, Coral, Sprout, Ruby, Pengu, Jelly,
Comet, Seraph, Leviathan, Zephyr, Hoot, Lumen, Buzz, Cinder, Nyx, Koi, Kitsu, Griffo, Aurora);
and the ten Drift Pass+ Season 1 heroes (Voidcat, Hexowl, Wraith Moth, Triphound, Phantom Ray,
Scorpyre, Krakkie, Crimson Mantis, Gloomeleon, Umbra Drake). Another 30 animal heroes exist in
four themed batches (Peaceful, Prism, Abyss, Christmas), set aside for later.

### Realms
- **Core realms:** Neon Void, Solar Storm, Frozen Nebula, Glitch Realm, Abyss.
- **Beyond the Abyss:** Peaceful Valley, Hurricane.
- **The dimensions through the rift:** Prism Rift, Tidal Sky, Chrono Fracture, Mirror Realm.

### Level names (Level Mode, 50 levels)
- **Neon Void (1–10):** First Flight, Saw Alley, Twin Teeth, Pendulum, Laser Lines, Heartbeat,
  Upside Down, Small Wonder, Neon Gauntlet, The Void Core
- **Solar Storm (11–20):** Sunrise, Meteor Shower, Fire Bars, Solar Flare, Eruption, Firefall,
  Under Pressure, Heatwave, Corona, Heart of the Sun
- **Frozen Nebula (21–30):** First Frost, Ice Sliders, Static, Frost Comet, Ice Curtain,
  Glacier Pass, Staircase, Whiteout, The Gauntlet, Frozen Throne
- **Glitch Realm (31–40):** Corrupted, Flip Field, Double Vision, Firewall, Packet Loss,
  Bit Rot, Overclock, Buffer Overflow, Kernel Panic, System Crash
- **The Abyss (41–50):** The Deep, Slammer, Closing In, The Eye, Watchers, Grasp, The Crush,
  Pressure, Event Horizon, The Abyss Awakens

### Monetization
- Coins earned in play, spent in a **coin shop** (heroes, cosmetics, a Daily Shop, Mystery Pods,
  Collections, biome bundles, the Daily Drift Drop).
- The **Lucky Spin** wheel, with heroes that can only be won there, a hero guarantee, and
  ×10 / ×20 spins.
- **Limited-time heroes**, such as SMASH for 24 hours.
- A free **Drift Pass** (a 50-tier season pass across four-week seasons) and **Drift Pass+**, a
  paid track at **$3.99 per season** with exclusive heroes, titles and extras, verified on the
  server.
- Choices that keep it fair: Boosts were tried and taken out, reward farming is blocked, and
  hero progression was made harder without touching gameplay.

### Music
The game started with **procedurally generated house music** and moved to a **pre-rendered
reggae soundtrack** that plays as one continuous mix.

---

## How it was built

- **Sam Eyde III (creator and director):** the concept, the names, the characters and what makes
  each one special, the realms, the level names, the look, the monetization model, the music
  direction, and every feature, tweak and fix: what to add, what to cut, what felt too hard,
  what to rename. Sam playtested the game and pointed each step in its direction.
- **Claude Code (development tool):** wrote the code, the procedurally drawn pixel art and the
  music engine; ran the tests; and made the commits, following Sam's direction in Claude Code
  sessions. That's why git lists "Claude" as the author of each commit.
- **Stack:** Phaser 3 (WebGL), Vite, Capacitor for iOS, Supabase for accounts and leaderboards,
  Playwright for cross-browser tests, and Cloudflare Pages hosting at glydrift.com.
- **Third-party asset:** the Galmuri pixel font (© Lee Minseo, SIL Open Font License),
  used for the Korean name 손주원.

---

© 2026 Sam Eyde III. All rights reserved.
