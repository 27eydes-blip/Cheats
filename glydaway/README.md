# Glydaway

*(Formerly Glydrunner, then Glydash.)*

An endless side-scrolling runner spin-off of **Glydrift**, starring Volt the Storm Bird. It's one self-contained file (`index.html`) with no build step and no image assets.

## Controls
| Action | Touch | Keyboard |
|---|---|---|
| Jump | Tap | Space / ↑ / W |
| Glide | Hold, in the air | Hold Space |
| Flip gravity (in a flip zone) | Double-tap | Press Space twice |
| Pause / resume | ⏸ button | P / Esc (Space, ↑, W or Enter also resume) |
| Retry | Tap anywhere once the crash screen shows (taps in the first 0.6 s are ignored) | Space |
| Volume | SETTINGS (start or pause screen): Sound effects and Music sliders | M mutes everything |

## Cities (a new one every 250 m while you speed up, then every 350 m)
Each "biome" is a famous city, drawn in Glydrift's pixel style with its landmarks. The first four are 250 m long (the run reaches top speed about 1000 m in), every later one 350 m, so a new city comes roughly every 20–30 s. The first lap visits all thirteen stops in this order (the trip starts at the airport), each adding its hazard. After Dubai, every lap is a fresh shuffle (never the same city twice in a row), so long runs don't repeat.
Each city's skyline rotates through three stretches with different landmarks, and its street has two looks, so a city doesn't repeat while you're in it.

| Order | City | Landmarks and street life | Signature hazard |
|---|---|---|---|
| 1 | The Airport | Control tower, glass terminal, a jet at the gate, hangar, a plane crossing the sky; baggage carts, runway lights, windsock, stair truck | **Thorn seeds** roll toward you. Jump them. |
| 2 | Paris | Eiffel Tower, Louvre pyramid, Arc de Triomphe, Notre-Dame, Sacré-Cœur; café awnings, Seine booksellers | **Thorn seeds** roll toward you. Jump them. |
| 3 | New York | Empire State, Chrysler, Statue of Liberty, Brooklyn Bridge, One World Trade Center, Flatiron; Times Square billboards, cabs, subway globes | **Rooftop hops** and **launch pads**. |
| 4 | Tokyo | Tokyo Tower, Skytree, five-story pagoda, torii gate, Mt Fuji; neon signs, cherry blossoms, vending machines | **Pulse orbs**: jump them low, run under them high. |
| 5 | London | Big Ben, Parliament, Tower Bridge, London Eye, St Paul's, the Shard; double-deckers, black cabs, phone boxes | Low ceilings, floating walls and **crushers**. |
| 6 | Seoul | N Seoul Tower, Lotte World Tower, Gwanghwamun gate, the DDP, Banpo rainbow bridge; palace roofs, street-food tents | Extra orbs, launch pads and crushers. |
| 7 | Sydney | Opera House, Harbour Bridge, Sydney Tower, lighthouse, yachts; surfboards, beach huts | **Gravity flip zones**. Down Under, after all. |
| 8 | Moscow | St Basil's, the Kremlin, Spasskaya clock tower, Ostankino tower, the Bolshoi; a tram, falling snow | **Icicles** drop and stick as ice spikes. |
| 9 | Seattle | Space Needle, Mt Rainier, Great Wheel, Columbia Center, ferries; coffee carts, rain | **Lightning** strikes ahead and leaves a crackling patch. |
| 10 | Cairo | Pyramids, Sphinx, Cairo Tower, a domed mosque, feluccas on the Nile; minarets, camels | **Flare vents**: jump lit ones, run over dark ones. |
| 11 | Venice | St Mark's, Rialto Bridge, Doge's Palace, Santa Maria della Salute; gondolas, market stalls | **Canals**: more gaps and long glide gaps. |
| 12 | Rio de Janeiro | Christ the Redeemer, Sugarloaf and its cable car, Maracanã, Selarón steps, Lapa arches; bunting, beach umbrellas | Extra **orbs, thorn seeds and launch pads**. |
| 13 | Dubai | Burj Khalifa, Burj Al Arab, Dubai Frame, Museum of the Future, Ain Dubai; dunes, a gold supercar | The finale: every hazard, always at top difficulty. |

Every city also has spikes, gaps, low ceilings, floating walls (glide over) and wide pits (glide across).

### Obstacles that play differently
- **Gravity flip zones** (from Sydney, 1700 m, then now and then everywhere): a glowing ceiling track appears and the floor fills with a spike bed too long to jump or glide. **Double-tap** to flip gravity and run upside down on the ceiling, jumping (downward) over spikes that hang from it. Then the floor clears and the ceiling ends in spikes: **double-tap again** to drop back down. If the ceiling ends while you're upside down, gravity snaps back by itself. Double-tapping does nothing outside a flip zone, so fast jumping elsewhere is unchanged. The first zone of each run shows "DOUBLE TAP TO FLIP!".
- **Crushers** (from London): a piston slams down on a rhythm and is fully up as you pass. Keep running; a jump hits it.
- **Launch pads** (from New York): a spring pad in front of a tower too tall to jump. Run onto the pad and it throws you over; jump over the pad and you hit the tower.
The level generator simulates the real jump and glide physics for every obstacle, including moving ones, so every layout can be cleared.

## Skins
Volt has a skin for every stop, plus the classic look. The first time you reach a stop in a real run, its skin unlocks ("NEW SKIN!"). Open the **LOCKER ROOM** in the lobby to see them all (locked ones show as shadows with where to unlock them) and tap one to wear it. The glide trail and crash feathers match the skin.
| Stop | Skin |
|---|---|
| (start) | Volt, the classic blue |
| The Airport | Jet Pilot: navy with a pilot's cap |
| Paris | Café: lavender with a black beret |
| New York | Taxi: yellow with a checker stripe |
| Tokyo | Neon: pink and cyan with a headband |
| London | Royal Guard: red with a tall black hat |
| Seoul | K-Pop Star: lavender with pink headphones and a star |
| Sydney | Surfer: teal with sunglasses |
| Moscow | Frost: icy white with a fur hat |
| Seattle | Rain Ranger: green with a yellow rain hat |
| Cairo | Desert Sun: sand gold with sunglasses |
| Venice | Gondolier: navy and white stripes with a straw boater |
| Rio de Janeiro | Carnival: green with a feather crown |
| Dubai | Golden: gold with a crown |
Unlocked skins and the one you're wearing are saved on the device (`glydaway.skins`, `glydaway.skin`). Autopilot runs don't unlock skins; `?allskins` shows every skin for testing without saving them.

## Power-ups
One sits on the ground in a clear stretch roughly every 280–460 m (the first at 140–220 m). Run into it.
| Power-up | What it does |
|---|---|
| **Magnet** (gold) | Pulls nearby coins to you for 8 s. |
| **Shield** (cyan) | Absorbs one crash, then 1.2 s of invulnerability. Falling into a pit bounces you back out. Lasts until used. |
| **Boost** (mint) | 3 s of flying high at 1.8× speed through a coin rush. The course ahead is cleared, so you land safely, with 0.8 s of invulnerability. |
Active power-ups show under the coin counter.

## Music
Glydaway's soundtrack is composed and played live in code (no music files): one song per city, written in that city's style and played on small synthesized instruments. All melodies are original; the London chime is the public-domain Westminster Quarters.
| City | Style |
|---|---|
| The Airport | A boarding chime, then smooth lounge jazz |
| Paris | Accordion musette waltz |
| New York | Big piano chords and a brass hook over a boom-bap beat |
| Tokyo | City pop: electric piano, slap bass, bright synth lead |
| London | The Big Ben chime, then Britpop guitars |
| Seoul | K-pop: claps, synth stabs, a plucked gayageum-style lead |
| Sydney | Didgeridoo drone, clapsticks and marimba |
| Moscow | Balalaika folk tune in a minor key |
| Seattle | Grunge: distorted power chords |
| Cairo | Oud in maqam hijaz over a darbuka rhythm |
| Venice | A gondolier's barcarolle on mandolin, in 6/8 |
| Rio | Samba/bossa: flute, nylon guitar, surdo and shaker |
| Dubai | Arabic pop: reed lead over a dance beat with darbuka |
- Songs change on the next bar when you enter a new city, and the hi-hats fill in as you speed up.
- Music stops on pause and on a crash. **SETTINGS** (start and pause screens) has separate **Sound effects** and **Music** volume sliders (0–100%, saved on the device); M mutes everything.
- Browsers only allow sound after a first tap or key press, so the menu music starts then.

## Leaderboard
Two online boards: **DISTANCE** (best metres in one run) and **COINS** (most coins in one run). Players pick a name (3–12 letters/numbers, same filter as Glydrift) the first time they open it.
- Uses the same Supabase project as Glydrift but its **own table**, `glydaway_scores`, so Glydrift's boards, checks and resets never touch it.
- **Setup (once):** someone with access to the Supabase project runs `supabase/glydaway_leaderboard.sql` in the SQL editor. Until then the board says "coming soon" and the game works normally.
- Each device signs in anonymously. Only personal bests are uploaded, and they wait in a queue while offline. Impossible results (too far or too many coins for the run's length) are rejected by the game and by the database.
- Autopilot runs (`?bot=1`) never count toward the best score or the leaderboard.

## Glydrift look
Glydaway uses Glydrift's art (source: `glydrift/` on the `feature/levels` branch, and the `gh-pages` build):
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
- `?bot=1` starts a run with the autopilot (it no longer plays behind the menu).
- The best score is kept in `localStorage` (`glydaway.best`); the leaderboard name, sign-in and upload queue use `glydaway.name`, `glydaway.auth` and `glydaway.lbQueue`.

## Credits
- Published by **Gleyde Technologies, LLC**
- Created by **Sam Eyde III**, Founder & CEO
- Produced by **Juwon Shon**, COO

## Home screen
An airport at night. It has:
- your records in a top bar
- a split-flap departures board showing the next flight, cities reached and the next new city
- your hero hovering over the runway (tap it for the Locker Room)
- PLAY, plus Leaderboard, Locker Room and Settings buttons
- planes taking off every 10–15 s

The first PLAY opens a short hands-on tutorial; **Settings → How to play** shows it again. In landscape the title and hero are on the left and the buttons on the right. See `HOME_REDESIGN.md` for before/after screenshots, and run `node glydaway/tests/home.test.cjs` after changing the home screen.

The publisher credit and the "Created by Sam Eyde III" line appear on the splash screen, the home screen footer (with "Produced by Juwon Shon") and in Settings. Never remove them (`tests/credits.test.mjs` checks this).

© 2026 Gleyde Technologies, LLC. All rights reserved.

## Deploying (glydaway.com)
Glydaway is its own Cloudflare Pages project, `glydaway` (custom domain glydaway.com, also glydaway.pages.dev). It serves only `index.html`; the config is in `wrangler.jsonc`.

Every push to `main` that changes `glydaway/` runs `.github/workflows/glydaway.yml`. It runs the tests (`tests/credits.test.mjs` and `tests/home.test.cjs` on WebKit, Chromium and Firefox) and deploys only if they pass, using the repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. To deploy by hand from this folder:

```sh
rm -rf dist && mkdir dist && cp index.html dist/ && npx wrangler pages deploy dist --project-name=glydaway --branch=main
```
