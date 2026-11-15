# Glydash

*(Formerly Glydrunner. The folder keeps its old name so existing links still work.)*

An endless side-scrolling runner spin-off of **Glydrift**, starring Volt the Storm Bird. It's one self-contained file (`index.html`) with no build step and no image assets.

## Controls
| Action | Touch | Keyboard |
|---|---|---|
| Jump | Tap | Space / ↑ / W |
| Glide | Hold, in the air | Hold Space |
| Pause / resume | ⏸ button | P / Esc (Space, ↑, W or Enter also resume) |
| Retry | Tap anywhere once the crash screen shows (taps in the first 0.6 s are ignored) | Space |
| Mute | Pause menu | M |

## Biomes (a new one every 350 m while you speed up, then every 500 m)
The first three biomes are 350 m long (the run reaches top speed about 1000 m in), every later one 500 m, so each lasts roughly 25–40 s. The first lap visits all ten in this order, each adding its hazard. After The Void, every lap is a fresh shuffle (never the same biome twice in a row), so long runs don't repeat.
| Order | Biome | Signature hazard |
|---|---|---|
| 1 | Sky Meadow | **Thorn seeds** roll toward you. Jump them. |
| 2 | Sunset Canyon | **Mesa hops**: chains of 2–4 stepping stones over a chasm, with no rest between hops. |
| 3 | Neon Night | **Pulse orbs** bob on a rail. Jump them when they're low, run under them when they're high. |
| 4 | Crystal Cavern | Lots of **low ceilings** and floating walls. |
| 5 | Frozen Peaks | **Icicles** shiver, drop as you get close and stick in the ground as ice spikes. Jump them. |
| 6 | Storm Reach | **Lightning** strikes the ground ahead from a glowing storm cloud and leaves a crackling patch. Jump it. Rain falls. |
| 7 | Solar Forge | **Flare vents.** A *lit* vent burns low, so jump it. A *dark* vent is safe to run over. Both burst tall just before you arrive and just after you pass. |
| 8 | Tidal Ruins | **Sea gaps**: more pits and long glide gaps, filled with water. |
| 9 | Prism Garden | Extra **orbs and thorn seeds**. |
| 10 | The Void | No new hazard: every hazard is equally likely, always at top difficulty. |

Every biome also has spikes, gaps, low ceilings, floating walls (glide over) and wide pits (glide across).
The level generator simulates the real jump and glide physics for every obstacle, including moving ones, so every layout can be cleared.

## Power-ups
One sits on the ground in a clear stretch roughly every 280–460 m (the first at 140–220 m). Run into it.
| Power-up | What it does |
|---|---|
| **Magnet** (gold) | Pulls nearby coins to you for 8 s. |
| **Shield** (cyan) | Absorbs one crash, then 1.2 s of invulnerability. Falling into a pit bounces you back out. Lasts until used. |
| **Boost** (mint) | 3 s of flying high at 1.8× speed through a coin rush. The course ahead is cleared, so you land safely, with 0.8 s of invulnerability. |
Active power-ups show under the coin counter.

## Music
Glydash has its own chiptune soundtrack, composed and played live in code (no music files). There's one song for each of the ten biomes plus a calmer menu tune, each with its own tempo, key and drum groove.
- Songs change on the next bar when you enter a new biome, and the hi-hats fill in as you speed up.
- Music stops on pause and on a crash. **MUSIC ON/OFF** (start and pause screens) is separate from **SOUND ON/OFF**, which mutes everything.
- Browsers only allow sound after a first tap or key press, so the menu music starts then.

## Leaderboard
Two online boards: **DISTANCE** (best metres in one run) and **COINS** (most coins in one run). Players pick a name (3–12 letters/numbers, same filter as Glydrift) the first time they open it.
- Uses the same Supabase project as Glydrift but its **own table**, `glydash_scores`, so Glydrift's boards, checks and resets never touch it.
- **Setup (once):** someone with access to the Supabase project runs `supabase/glydash_leaderboard.sql` in the SQL editor. Until then the board says "coming soon" and the game works normally.
- Each device signs in anonymously. Only personal bests are uploaded, and they wait in a queue while offline. Impossible results (too far or too many coins for the run's length) are rejected by the game and by the database.
- Autopilot runs (`?bot=1`) never count toward the best score or the leaderboard.

## Glydrift look
Glydash uses Glydrift's art (source: `glydrift/` on the `feature/levels` branch, and the `gh-pages` build):
- **Volt sprite and coin sprite** are copied verbatim from `glydrift/src/pixel/common.js` and `px.js`, with the same `PixelCanvas`, dark outline and white rim.
- **Fonts:** Orbitron (titles), Rajdhani (numbers and body text), Silkscreen (buttons).
- **Colors:** Glydrift's UI tokens: cyan `#3ef4ff`, mint, lavender and gold `#ffc83d`. Hazards use the danger colors red `#ff2a3d`, orange `#ff6a1a` and pink `#ff2d78`.
- **Hazard style:** dark body, inner tint, neon outline, soft glow and a white core line.
- **Backdrop:** dark skies, a pixel city skyline and a Tron grid in Neon Night.

## Juice
- Squash and stretch on jump and landing (a spring that wobbles; harder landings squash more).
- A glide trail: a ribbon in Volt's trail colors plus pixel sparkles and gold bolt sparks.
- Coin pickups: a burst and a ring, a chime that rises in pitch with each coin in a streak, and a bump on the HUD counter.
- On death: a hit-stop, a white flash, screen shake, a feather burst and a vibration on phones.
- Restart: taps during the crash and for 0.6 s after the crash screen appears are ignored, so frantic jumping doesn't skip your score.
- Passing your best mid-run flashes NEW BEST! with a chime.
- Three parallax layers per biome (far sky, mid silhouettes, near details), crossfading between biomes, plus a biome banner.

## Development
- `?bot=1` starts a run with the autopilot that also plays the attract mode.
- The best score is kept in `localStorage` (`glydash.best`); the leaderboard name, sign-in and upload queue use `glydash.name`, `glydash.auth` and `glydash.lbQueue`.
