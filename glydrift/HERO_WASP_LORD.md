# WASP LORD: ILLEGAL LEGENDARY

Branch `hero/wasp-lord`. **Not merged, not deployed.** He's for the first update after the App
Store launch. The App Store v1 build (`release/appstore-v1`) and glydrift.com are untouched.
Screenshots are in `docs/heroes/wasp-lord/`.

## What he is
A war-wasp king in gunmetal armour, with a jagged crown in his helmet, yellow-and-black stripes
between the abdomen plates, a silver stinger with a red tip, 4 see-through blurring wings and
glowing red visor eyes. 55,000 coins (coins only). New rarity **ILLEGAL LEGENDARY**, the highest
in the game (above Ultra Legendary).

| | |
|---|---|
| Idle (Neon Void, Sakura Skies, Abyss) | `01`–`03`: wings buzz, eyes pulse, hover bob; the eyes stay readable on bright and dark realms |
| Phasing through a wall | `04`: semi-transparent red with red/cyan ghost copies and jittering slices; the wall flickers |
| Double jump | `05`: strike pose, red shockwave ring, metallic boom |
| x16 | `06`: red-and-black flaming "x16" |
| Death | `07`: armour cracks and flies off, eyes flicker out |
| Leaderboard | `08`, `09`: red ILLEGAL tag with a wasp icon on his rows (podium, list and your own row) |
| Shop | `10` locked: black silhouette with only the red eyes lit, "???", "55,000" in red; `11` unlocked card with ILLEGAL stamp and warning-tape border |
| Heroes screen, locker | `12`, `13`: illegal card frame; his own full-width "vault" spot at the top of the locker |
| First unlock | `14`–`16`: black screen, "ILLEGAL" alarm, two red eyes open, buzz-roar, armour slams on, WASP LORD drops in metal letters. Once only; tap to skip |

Sounds (all made with the game's own synth): low buzz on each flap, distorted "zzzt" when
phasing, metallic boom on double jump, deep buzz-roar on unlock (and on a new best).

## His powers
1. **PHASE:** he flies through every obstacle except lasers and beams.
   - **Still kills him:** Neon Void lasers, the Glitch broken laser, Abyss eye beams, Prism mirror
     lasers and Frozen **zap** beams; also the ground, the ceiling and leaving the screen.
     - Zap was added because it's drawn with the same laser beam art: dying to Void lasers but
       not to zap would look wrong. To let him phase through zap, take `"zap"` off
       `perks.phase.lethal` in `characterDefs.js` and from the expected list in the test.
   - **Phases through:** every other type. That's pillars, gates, walls, blocks, columns,
     slammers, closing walls, glass, saws, axes, bells, bamboo, lanterns, meteors, icicles,
     comets, mines, gears, pendulums and the rest, including the Hurricane lightning bolt, the
     Neon Void pulse ring and the Mirror sweep bar (none of those are lasers).
   - **No free points:** phasing through something never counts as a CLOSE! or PERFECT!.
2. **SPEED ×1.308:** 30% above the average of the other 90 heroes (1.006, computed from the
   hero data at load). He's the fastest hero; SXE is 1.25.
   - **Fairness check:** a bot with god mode off flew every realm and dimension at his speed,
     including Sakura Skies and 12 forced Abyss double eye beams, with every laser and beam type
     forced. It never died, and its closest pass was 8 px, still clear.
   - **No spawning changes were needed:** the laser and eye-beam warnings are timed in seconds,
     so they give the same reaction time at his speed.
3. **DOUBLE JUMP:** a second tap within 0.25 s of a flap is a 1.45× boosted flap with the red
   shockwave. Once, then ready again only when he starts falling. MILZZZ's double jump is
   unchanged.
4. **COMBO x16:** a new tier at a chain of 28 (x13 at 22, like SXE). It shows as the flaming
   number on the combo meter and the HUD. SXE still tops out at x13 and everyone else at x10.

## Leaderboard and server
- His runs count on the normal leaderboards and for the ALL MIGHTY crown, like every hero.
- **Where the tag comes from:** the ILLEGAL tag is drawn from the hero stored with each score,
  so every device sees it. A test checks it from a second browser.
- **SQL to run:** `supabase/migrations/20261114000001_wasp_lord_scores.sql`.
  - **Run it BEFORE the update with him goes live.** Until then, the server's score check
    rejects his fastest and x16 runs, so his best scores wouldn't upload.
  - It's safe to run early and safe to run twice. Paste it into Supabase → SQL Editor → Run.
  - **What it changes:**
    - Only rows marked `wasplord` get higher limits (top speed ×1.95 instead of ×1.8,
      38 points per metre instead of 30). Every other hero's limits are unchanged.
    - New scores must carry a valid hero id.
    - A rename can't change which hero a score was set with.
  - **What it can't stop:** the server can't check that a player owns him. A faked "wasplord"
    score would get his limits, but it would also show the ILLEGAL tag and still be capped at his
    real best case.
  - The game checks the same rules before uploading.

## Tests (tests/e2e/wasplord.spec.js, tests/e2e/wasplord-art.spec.js)
- **Phasing:**
  - every obstacle type spawned on him, in its own realm: he goes through and survives, the
    phase look turns on and off, and the obstacle flickers and is restored afterwards;
  - every lethal type still kills him;
  - the ground, ceiling and screen edges still end the run.
- **Double jump and combo:**
  - double-jump timing: inside 0.25 s, outside 0.25 s, once until he falls, MILZZZ unchanged;
  - x16 reached and shown (SXE x13, others x10).
- **Runs and heroes:**
  - retry after death;
  - swapping heroes mid-session (Wasp Lord → VOLT → SXE → Wasp Lord): the others get no phasing
    and their normal speed back;
  - memory: swapping onto him and off again leaves the same number of objects, textures and
    tweens;
  - the fairness bot through every realm and dimension (Sakura Skies, Abyss double eye beams);
  - **a run still ends:** with no taps he hits the ground in under 5 s, and flying blind a zap beam
    got him at 1,852 m. He is not unkillable.
- **Leaderboard and score rules:**
  - the ILLEGAL tag on the podium, the list and your own row, including another device's data;
  - score rules: his runs are accepted, and the same numbers for any other hero are rejected
    (the same rules as the SQL).
- **Shop and art:**
  - the locked shop card, buying him, and the reveal playing once;
  - the Heroes screen and locker;
  - his art comes back after a lost GPU context;
  - Reduce Flashing and Low Graphics: steady glows, no strobing.
- **Existing tests:** abyss-crash (double beams), context-loss, credit, shop, locker and the
  leaderboard tests were re-run and pass.

## Things to decide or know
- **Zap beams kill him** (see above); changing that is one line.
- **The Heroes screen shows his name and preview while he's still locked.** Only the shop hides
  him as "???".
- **New save field:** `revealed` remembers that his reveal has played. It works with old saves.
- **Existing gap, unchanged:** SXE's theoretical top speed (1.856) is already a little above the
  general ×1.8 server limit. That's unrelated to Wasp Lord, but worth a look one day.
- **How to ship him later:** merge `hero/wasp-lord` into the live branch after the App Store
  launch, run the SQL first, then deploy with the full test lane green on all three browsers.
