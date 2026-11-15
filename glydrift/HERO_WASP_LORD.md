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

## His power (changed 15 Nov 2026: he's now a normal hero)
WASP LORD flies like every other hero: **standard speed, combo up to x10, no phasing** (walls,
pillars and every hazard kill him as they kill anyone). His one power:
- **DOUBLE JUMP:** a second tap within 0.25 s of a flap is a 1.45× boosted flap with the red
  shockwave. Once, then ready again only when he starts falling. MILZZZ's double jump is
  unchanged.

His runs count on the normal leaderboards and for ALL MIGHTY like any hero's. His look, sounds,
shop card, reveal and price (55,000 coins) are unchanged, and players who bought him keep him.
(The phasing, the extra speed and x16 code is still in the game but switched off: it only works
for a hero that has those perks, and no hero has them now.)

## Leaderboard and server
- His runs count on the normal leaderboards and for the ALL MIGHTY crown, like every hero.
- His rows still show the small red ILLEGAL tag (drawn from the hero stored with each score).
- **No SQL is needed for him any more.** He flies at normal speed with a normal x10 combo, so the
  standard score check fits his runs. `supabase/migrations/20261114000001_wasp_lord_scores.sql`
  is optional: if you already ran it, it's harmless (it only gives looser limits to his rows,
  which a normal-speed hero never reaches); if you haven't, you don't need to.
- The ILLEGAL leaderboard (a separate board for him) was built and then dropped before it went
  live; nothing of it is in the game or the database.

## Tests (tests/e2e/wasplord.spec.js, tests/e2e/wasplord-art.spec.js)
- He's a normal hero: standard speed, no phasing, combo up to x10; a saw on him ends the run.
- The ground, the ceiling and the screen edges end the run; retry works.
- Double jump: inside 0.25 s, outside 0.25 s, once until he falls; MILZZZ unchanged.
- The ILLEGAL tag on his leaderboard rows (podium, list, your own row, another device's data).
- Shop and art: the locked card, buying him and the one-time reveal, the Heroes screen and
  locker, his art after a lost GPU context, Reduce Flashing and Low Graphics, no leaks when
  swapping heroes.

## Things to decide or know
- **The Heroes screen shows his name and preview while he's still locked.** Only the shop hides
  him as "???".
- **New save field:** `revealed` remembers that his reveal has played. It works with old saves.
- **Existing gap, unchanged:** SXE's theoretical top speed (1.856) is already a little above the
  general ×1.8 server limit. That's unrelated to Wasp Lord, but worth a look one day.
- **Home screen pictures re-recorded (15 Nov 2026):** the saved home screenshots predated the
  space kept at the bottom for the Gleyde Technologies mark, so they were recorded again.
