# Glydaway

*(Formerly Glydrunner, then Glydash.)*

An endless side-scrolling runner spin-off of **Glydrift**, starring Volt the Storm Bird. It's one self-contained file (`index.html`) with no build step and no image assets.

## Controls
| Action | Touch | Keyboard |
|---|---|---|
| Jump | Tap | Space / ↑ / W |
| Glide | Hold, in the air | Hold Space |
| Flip gravity (in a flip zone) | Double-tap | Press Space twice |
| SKY DASH (fly, when charged) | FLY button (bottom right), then hold anywhere (or keep holding FLY) to climb | F or Shift, then hold Space to climb |
| Pause / resume | ⏸ button | P / Esc (Space, ↑, W or Enter also resume) |
| Retry | Tap anywhere once the crash screen shows (taps in the first 0.6 s are ignored) | Space |
| Volume | SETTINGS (start or pause screen): Sound effects and Music sliders | M mutes everything |

## Levels (a new one every 250 m while you speed up, then every 350 m)
Each "biome" is a famous city, drawn in Glydrift's pixel style with its landmarks. The first four are 250 m long (the run reaches top speed about 1000 m in), every later one 350 m, so a new city comes roughly every 20–30 s. The first lap visits all fourteen levels in this order (the trip starts at the airport), each adding its hazard. After Dubai, every lap is a fresh shuffle (never the same city twice in a row), so long runs don't repeat.
Each city's skyline rotates through three stretches with different landmarks, and its street has two looks, so a city doesn't repeat while you're in it.

| Order | City | Landmarks and street life | Signature hazard |
|---|---|---|---|
| 1 | The Airport | Control tower, glass terminal, a jet at the gate, hangar, a plane crossing the sky; baggage carts, runway lights, windsock, stair truck | **Thorn seeds** roll toward you. Jump them. |
| 2 | Paris | Eiffel Tower, Louvre pyramid, Arc de Triomphe, Notre-Dame, Sacré-Cœur; café awnings, Seine booksellers | **Thorn seeds** roll toward you. Jump them. |
| 3 | New York | Empire State, Chrysler, Statue of Liberty, Brooklyn Bridge, One World Trade Center, Flatiron; Times Square billboards, cabs, subway globes | **Rooftop hops** and **launch pads**. |
| 4 | **The Clouds** (the glide level) | Stars, a moon-lit cloud sea, cloud towers, a far-off airship | Storm-cloud tunnels, drifting balloons and spinning rotors. See *The Clouds* below. |
| 5 | Tokyo | Tokyo Tower, Skytree, five-story pagoda, torii gate, Mt Fuji; neon signs, cherry blossoms, vending machines | **Pulse orbs**: jump them low, run under them high. |
| 6 | London | Big Ben, Parliament, Tower Bridge, London Eye, St Paul's, the Shard; double-deckers, black cabs, phone boxes | Low ceilings, floating walls and **crushers**. |
| 7 | Seoul | N Seoul Tower, Lotte World Tower, Gwanghwamun gate, the DDP, Banpo rainbow bridge; palace roofs, street-food tents | Extra orbs, launch pads and crushers. |
| 8 | Sydney | Opera House, Harbour Bridge, Sydney Tower, lighthouse, yachts; surfboards, beach huts | **Gravity flip zones**. Down Under, after all. |
| 9 | Moscow | St Basil's, the Kremlin, Spasskaya clock tower, Ostankino tower, the Bolshoi; a tram, falling snow | **Icicles** drop and stick as ice spikes. |
| 10 | Seattle | Space Needle, Mt Rainier, Great Wheel, Columbia Center, ferries; coffee carts, rain | **Lightning** strikes ahead and leaves a crackling patch. |
| 11 | Cairo | Pyramids, Sphinx, Cairo Tower, a domed mosque, feluccas on the Nile; minarets, camels | **Flare vents**: jump lit ones, run over dark ones. |
| 12 | Venice | St Mark's, Rialto Bridge, Doge's Palace, Santa Maria della Salute; gondolas, market stalls | **Canals**: more gaps and long glide gaps. |
| 13 | Rio de Janeiro | Christ the Redeemer, Sugarloaf and its cable car, Maracanã, Selarón steps, Lapa arches; bunting, beach umbrellas | Extra **orbs, thorn seeds and launch pads**. |
| 14 | Dubai | Burj Khalifa, Burj Al Arab, Dubai Frame, Museum of the Future, Ain Dubai; dunes, a gold supercar | The finale: every hazard, always at top difficulty. |

Every city also has spikes, gaps, low ceilings, floating walls (glide over) and wide pits (glide across).

### Obstacles that play differently
- **Gravity flip zones** (from Sydney, 1700 m, then now and then everywhere): a glowing ceiling track appears and the floor fills with a spike bed too long to jump or glide. **Double-tap** to flip gravity and run upside down on the ceiling, jumping (downward) over spikes that hang from it. Then the floor clears and the ceiling ends in spikes: **double-tap again** to drop back down. If the ceiling ends while you're upside down, gravity snaps back by itself. Double-tapping does nothing outside a flip zone, so fast jumping elsewhere is unchanged. The first zone of each run shows "DOUBLE TAP TO FLIP!".
- **Crushers** (from London): a piston slams down on a rhythm and is fully up as you pass. Keep running; a jump hits it.
- **Launch pads** (from New York): a spring pad in front of a tower too tall to jump. Run onto the pad and it throws you over; jump over the pad and you hit the tower.
The level generator simulates the real jump and glide physics for every obstacle, including moving ones, so every layout can be cleared.

## The Clouds (the glide level)
The 4th level, between New York and Tokyo, and it comes back in later laps. The controls change: **each tap gives a lift, then you glide forward and slowly sink** (no holding, no meter, no timer). Keep tapping to stay up and steer through gaps.
- **Why 4th:** by then you've learned jumping and gliding in the first three levels, and it's early enough (about 750 m in) that most players get to it. It's also a change of pace just before the speed picks up for the later cities.
- **The way in:** a short cloud dock, an automatic take-off, the "ENTERING THE CLOUDS" banner and a hint for 4.5 s: *"GLIDE LEVEL: TAP to flap up, then you glide down slowly. No holding. Stay out of the storm!"* The way out: you glide down onto a long dock and run on into Tokyo.
- **The floor is a storm** (dark clouds with a pink glow): touch it and you crash, unless a shield bounces you back up. The top of the sky is a soft ceiling.
- **Hazards only found here:** storm-cloud tunnels (flat runs, staircase climbs and drops, and pillars to weave over and under), hot-air balloons drifting up and down, and spinning three-blade rotors. All glow in the danger colour.
- **Fair by construction:** every layout follows a corridor that never climbs or drops faster than tapping or sinking can follow. Before it's placed, a test pilot flies it three times: once tapping perfectly, and twice with every tap up to 0.09 s late. It's only used if all three get through (with the largest hitbox, plus a margin). SKY DASH and Boost don't work in this level.
- **Feel:** a gentle arc after each tap (about 55 units up), a capped, slow sink, and the character tilts nose-up as it rises and nose-down as it sinks.
- **Tuning** (`GLIDE_LV` at the top of the game script):
| Setting | Value |
|---|---|
| Lift per tap | 290 units/s (about a 55-unit rise) |
| Gravity in the level | 760 (the normal levels use 1750) |
| Max sink speed | 165 units/s (normal falling tops out at 900) |
| Forward speed | 300 units/s (the run's own speed-up pauses here) |
| Tilt | 0.0012 rad per unit/s, at most 0.42 rad (about 24°) |
| Tunnel opening | 160 units early on → 126 at full difficulty |
| Steepest climb / drop of the corridor | 0.3 / 0.36 units per unit forward |

## Level characters (the Locker Room: CHARACTERS)
Every level has its own character, unlocked the first time a real run reaches that level. A card slides in during the run ("NEW CHARACTER UNLOCKED!") and the crash screen lists what the run unlocked. Unlocks are saved on the device (`glydaway.chars`). None of them is a bird, cat or dog (except Volt, Glydrift's storm bird, who you start with).
| Level | Character | Creature | Animation and personality |
|---|---|---|---|
| The Airport | **Volt** | Storm bird | the one who started it all (start) |
| Paris | **Gaston** | Escargot | striped shell, bobbing eye stalks, a stretching foot, a tiny beret: slow and fabulous |
| New York | **Core** | Big Apple worm | a worm in a little cap wiggling out of a red apple |
| The Clouds | **Nimbus** | Cloud moth | fluffy fore and hind wings with eye spots, feathery antennae |
| Tokyo | **Kappi** | Kappa (a river imp from folk tales) | a shell on its back, a water dish on its head that sloshes, swinging arms |
| London | **Sir Bramble** | Hedgehog | a coat of spines that ripples, a bowler hat |
| Seoul | **Bandi** | Firefly ("bandi" is Korean for firefly) | a tail lantern that pulses, buzzing wings |
| Sydney | **Paddles** | Platypus | a duck bill, a beaver tail that slaps up and down |
| Moscow | **Sasha** | Saiga antelope | a winter-white coat, a big wobbly nose, amber horns |
| Seattle | **Inky** | Giant Pacific octopus | eight curling, waving arms, big eyes |
| Cairo | **Kepi** | Scarab beetle | a jewel-green shell edged in gold, wings peeking out, scurrying legs |
| Venice | **Marina** | Seahorse | a gondolier's scarf, a curled tail, a fluttering fin |
| Rio de Janeiro | **Capi** | Capybara | an orange balanced on its head, twitching ears |
| Dubai | **Rimal** | Spiny-tailed lizard (a dhub) | a ringed spiky tail that curls, sprawling legs |

**Characters and skins work together like this:** you wear **one look at a time**. That's either a level character (earned by reaching levels) or a shop skin (bought with gold). Wearing a skin replaces your character's look and hitbox; tapping a character puts that character back on. What you're wearing is saved (`glydaway.wearing`).

## Shop skins (the Locker Room: SHOP)
Every skin is its own creature, with its own shape, its own animation and its own hitbox. Buy them with **gold** in the **LOCKER ROOM**, SHOP tab. Coins from real runs become gold.
| Skin | Creature | Price | Animation |
|---|---|---|---|
| **Finn** | Flying fish | 100 | glassy pectoral fins beat, forked tail flicks; skims just off the ground |
| **Nyx** | Fruit bat | 150 | scalloped wings with finger bones flap |
| **Ember** | Baby dragon | 250 | wings beat, arrow-tipped tail swishes, a puff of flame |
| **Boo** | Little ghost | 350 | floats; arms wave and the hem ripples |
| **Zoom** | Pocket rocket | 450 | exhaust flame flickers |
| **Jello** | Jellyfish | 600 | the bell pulses wide and tall, tentacles wave |
| **Buzz** | Bumblebee | 750 | blurry wings buzz |
| **Ray** | Manta ray | 900 | wings ripple up and down, whip tail |
| **Orbit** | Flying saucer | 1200 | rim lights chase, a tractor beam flickers, a pilot under the dome |
| **Comet** | Fox | 1500 | big white-tipped tail wags |
Legless creatures hover or skim instead of running, and every one speeds its animation up during SKY DASH.

**Fair hitboxes (characters and skins alike).** Each one's hitbox is a few rectangles that follow its silhouette (a fish is long and low, a ghost is a dome, a saucer is a disc and a dome). Every hitbox fills the same outer box (22 × 22 units, the box every level is planned and checked against, so every layout stays beatable with every skin) and covers about the same area as Volt's (within 5%), so no skin is easier or harder. `tests/gameplay.test.cjs` checks both, and runs the autopilot through the hazards wearing every skin.

**Buying.** Two taps (tap, then tap again to confirm). A skin can't be bought twice and gold never goes below zero. Owned skins, the one you wear and your gold are saved on the device (`glydaway.skinsOwned`, `glydaway.skinNow`, `glydaway.gold`). The old paint jobs only recoloured the hero and are gone: gold spent on them is refunded once, and the Locker Room says so. The per-city birds are gone too (the home screen's "cities reached" still counts the cities you've reached). `?allskins` unlocks every skin for testing without saving.

## Power-ups
One sits on the ground in a clear stretch roughly every 280–460 m (the first at 140–220 m). Run into it.
| Power-up | What it does |
|---|---|
| **Magnet** (gold) | Pulls nearby coins to you for 8 s. |
| **Shield** (cyan) | Absorbs one crash, then 1.2 s of invulnerability. Falling into a pit bounces you back out. Lasts until used. |
| **Boost** (mint) | 3 s of flying high at 1.8× speed through a coin rush. The course ahead is cleared, so you land safely, with 0.8 s of invulnerability. |
Active power-ups show under the coin counter.

## SKY DASH (fly for a few seconds)
- **Trigger: a charge meter.** The FLY button (bottom right) fills as you collect coins (25 coins). When it's full it glows and you hear a chime ("SKY DASH READY"). Tap it (or press F / Shift).
- **While flying you're safe**: nothing can hurt you and you can't fall into a pit. You steer: hold to climb, let go to sink (you skim the ground at the bottom). Gather the coins up high.
- **Timer**: the FLY ring drains and shows the seconds left. For the last 1.25 s it flashes red, beeps and says "LANDING!", so the end is never a surprise. The stretch where you come down is kept clear, and you're safe for 1.2 s after landing.
- **Look and sound**: wind rings in your skin's colours (red at the end), speed lines behind the hero, fast wingbeats, a whoosh going up and a falling tone at the end. Works with every skin.
- **Can't spam it**: the meter empties, and for 12 s after a flight coins don't charge it.
- All the numbers (duration, warning, cooldown, coins to charge, climb and sink speed, ceiling, forward speed, landing safety) are in the `FLY` block at the top of the game script.

### More obstacle variety
New types roll in as the run gets harder, each leaning toward cities where it fits:
- **Drones** (from 300 m; the Airport's is a runaway baggage drone): fly toward you. Low ones: jump. High ones: run under (or clear them with a full jump).
- **Pop-up spikes** (from 500 m; Tokyo, Seoul, Cairo): rise and drop. Up as you arrive: jump. Dropping as you arrive: keep running.
- **Pendulums** (from 750 m; London's is a brass clock pendulum): swing from above, timed to be at the far end as you pass under.
- **Spinners** (from 1000 m; New York, Seoul, Rio): a bar turning overhead, level as you pass. A jump that starts right under it hits it.
- **Spike sizes**: small, normal and tall spikes.
- **Spacing**: now and then a quick burst or a breather, so the rhythm isn't predictable.
Every layout is built from the real jump physics, and each new type was tested: the right move always survives and the wrong one (missing a jump) always crashes.

The five newest hazards each move in their own way. They arrive one by one, and each is commoner in the cities it fits. Before each one is placed, the game runs the bird through it with the real physics and the biggest hitbox; it must be clearable with a ±0.05 s timing window, or plain spikes go there instead:
- **Laser fence** (from 400 m; Tokyo, Seoul, New York, Dubai): a neon beam slides up and down between two grey posts. High as you arrive: run under it. Low: jump it. The emitters ride with the beam, so you can see where it's going.
- **Rail saw** (from 600 m; London, Moscow, New York): a spinning buzzsaw runs back and forth along a rail on the ground. Time your jump to where it will be.
- **Spring ball** (from 850 m; Rio, Sydney): a ball bounces toward you in arcs, with a shadow on the ground. Run under it while it's high, or jump it as it lands.
- **Piston row** (from 1100 m; Cairo, London, Moscow, Seattle): three pistons pump up and down in a wave. Their housings are flush and safe; only the glowing heads hurt.
- **Swooping gull** (from 1400 m; Venice, Sydney, Paris, Seattle): a gull glides in high and dives once. If it dives at you, jump; if it dives early or late, keep running. Its shadow shows how low it is.

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

## Players, accounts and the world leaderboard
How it's built: the game is one static file on **Cloudflare Pages** (glydaway.com). The online part uses **Supabase** (Postgres + Auth), talked to directly from the page over its REST API (no extra library). There's no server code of ours: the rules live in the database (`supabase/schema.sql`).

- **A constant player, from the first launch.** The game makes an anonymous player automatically (Supabase anonymous sign-in, kept on the device) and asks for a name **once**. Every run after that posts under it: no prompts after runs. Anonymous names can appear on the board but aren't protected yet: two anonymous players may share one, and anyone who saves an account can claim it.
- **Save my account / Sign in** (Settings → Account). Passwordless: enter your email, get a one-time code, type it in. No password is stored.
  - A new email is linked to the player you already are (same player id), so your name, scores, unlocked characters, skins and gold simply carry on. The name becomes **claimed**: unique whatever the letter case, and nobody else can use it or post under it. Claimed names show a ✓ on the boards.
  - An email that already has an account: you sign in to it, this device's scores are moved into it (on each board the better one counts), and then **you choose** what progress to keep: combine both (all characters and skins, the higher best and the higher gold: gold is never added together), keep the account's, or keep this device's. Nothing is overwritten silently.
  - Signed in, your progress (gold, characters reached, skins bought, what you wear, your best) is saved to your account and loaded on any device. Unlocks combine across devices; for gold the most recent change wins.
  - **Sign out**: this device starts again as a new player (your account keeps everything). **Change name**: Settings → Player name (a saved name can change once a week). **Delete my data**: removes your login and email, name, scores and progress for good, then the device starts fresh.
- **Boards:** THIS DEVICE (top 10 runs on this device, works offline), **WORLD** (best distance, all time), **THIS WEEK** (best distance this week; resets every Monday, UTC), **COINS** (most coins in one run). Each shows the top 50 with rank, name and score, plus your own rank if you're further down. One row per player per board: only your best counts. The crash screen shows your world and weekly rank after each run. Loading, empty, offline and "not connected" states each have a clear message, with TRY AGAIN.
- I didn't add per-level boards: a run passes through many levels, so "best per level" wouldn't mean much.

### Security and anti-cheat (and what it can't stop)
- **The server decides.** Scores can only be posted through a database function that checks them: whole numbers, distance > 0, coins ≥ 0, a run of 0.5 s to 3 h, no faster than the game can go (28 m/s, a little above the real top speed with the boost), at most 1.5 coins per metre + 100. The tables can't be written directly by players at all; each function only acts on the signed-in player (`auth.uid()`).
- **Rate limits:** one score every 5 s and 500 a day per player; a saved name changes once a week (an anonymous name once a minute). Codes: the game waits 60 s between requests and allows 5 tries per code; Supabase also limits emails and sign-ins per hour (Authentication → Rate Limits).
- **Database rules (Row Level Security):** anyone can read names and scores; a player can read and write only their own progress; the rate-limit columns and every email are never readable through the API.
- **Usernames:** 3–12 letters or numbers with the same profanity filter as Glydrift, checked in the game and again in the database.
- **Keys:** only Supabase's *public* (publishable/anon) key is ever in the page, which is how Supabase is designed: the rules above are what protect the data. It isn't in the repository: the deploy fills it in from GitHub repository *variables*, and refuses to deploy if a *secret* or service_role key is put there by mistake. No secret key is used anywhere.
- **What it can't stop:** the game runs on the player's device, so a determined cheater can change it to send a fake run that is still *possible* (say 3,000 m in a 3-minute run), or edit their own gold and unlocks. The checks stop impossible and spammed scores, writing as someone else, and editing other players' data; they can't prove a possible run was really played. Stronger options later: replay/seed verification on a server, or reviewing top scores by hand.

### Privacy
Stored: the email (only for signing in; other players never see it), the player name, scores and game progress. Nothing else: no analytics, no device details. The sign-in screen says so. "Delete my data" really deletes it all, including the login. Local data on the device: `glydaway.auth`, `glydaway.name`, `glydaway.playerId`, `glydaway.runQueue`, and the progress keys.

### Setting it up (once): see [ONLINE_SETUP.md](ONLINE_SETUP.md)
Until it's set up, the world tabs say "isn't connected on this copy" and everything else works offline (Claude test links can't reach outside servers either).

### Tests
- `node tests/online.test.cjs`: the whole player journey against a fake Supabase.
- `tests/db.test.sql`: the real database rules and functions on PostgreSQL (with small stand-ins for Supabase's auth): `psql -X -q -t -f tests/db.test.sql` from this folder.

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

## Sharp visuals
The canvas is drawn at the screen's real pixel density (up to 3×; it used to be capped at 2×, so phones stretched and blurred it), with nearest-neighbour scaling. The city backdrop and the ground are drawn with a **whole number of screen pixels per art pixel**, scrolling by whole pixels. Before, an art pixel came out 5.57 or 6.5 screen pixels wide, so neighbouring pixels were uneven and crawled as they scrolled, which looked blurry. The see-through speed streaks are gone, cities cross-fade in 0.7 s instead of 1.6 s (two skylines on top of each other read as a double image), and while you play the backdrop is dimmed slightly (`TUNE.bgDim`) so hazards and your hero stand out. Settings has **Reduce flashing & screen shake** (no white flashes or shake, softer text glow).

## Tuning
All the feel numbers are in the `TUNE` block at the top of the game script (the old values are in comments next to them). The game is a little slower than before:
| Setting | Before | Now |
|---|---|---|
| Starting speed | 280 | 245 |
| Top speed | 600 | 520 |
| Speed-up per second | 3.5 | 3.0 (top speed still arrives about 90 s in) |
| Home-screen run | 320 | 290 |
| Gravity | 1900 | 1750 |
| Jump strength | 620 | 595 (the same jump height, a little more hang time) |
| Max fall speed | 950 | 900 |
| Gap before each hazard (s of running, easy → hard) | 0.8 → 0.4 | 0.9 → 0.46 |
| Distance to full difficulty | 2500 m | 2800 m |
| Thorn seed speed | 140 | 125 |
| Drone speed | 120 | 105 |
Cities are measured in metres, so at the slower speed each one lasts a few seconds longer.

## Development
- `?bot=1` starts a run with the autopilot. (The autopilot also plays a perfect run behind the home screen, unless the device asks for reduced motion.)
- The best score is kept in `localStorage` (`glydaway.best`); the leaderboard name, sign-in and upload queue use `glydaway.name`, `glydaway.auth` and `glydaway.lbQueue`.

## Credits
- Published by **Gleyde Technologies, LLC**
- Created by **Sam Eyde III**, Founder & CEO
- Produced by **Juwon Shon**, COO

## Home screen
An airport at night. It has:
- your records in a top bar
- a split-flap departures board showing the next flight, levels reached and the next new level
- open sky over the runway, where the autopilot plays a perfect run with your current look (the big bird that used to hover there was removed)
- PLAY, plus Leaderboard, Locker Room and Settings buttons
- planes taking off every 10–15 s

The first PLAY opens a short hands-on tutorial; **Settings → How to play** shows it again. In landscape the title and hero are on the left and the buttons on the right. See `HOME_REDESIGN.md` for before/after screenshots, and run `node glydaway/tests/home.test.cjs` after changing the home screen.

The publisher credit and the "Created by Sam Eyde III" line appear on the splash screen, the home screen footer (with "Produced by Juwon Shon") and in Settings. Never remove them (`tests/credits.test.mjs` checks this).

© 2026 Gleyde Technologies, LLC. All rights reserved.

## Deploying (glydaway.com)
Glydaway is its own Cloudflare Pages project, `glydaway` (custom domain glydaway.com, also glydaway.pages.dev). It serves `index.html` and the app icons in `icons/`; the config is in `wrangler.jsonc`.

Every push to `main` that changes `glydaway/` runs `.github/workflows/glydaway.yml`. It runs the tests (`tests/credits.test.mjs`, `tests/icon.test.mjs` and `tests/home.test.cjs` on WebKit, Chromium and Firefox) and deploys only if they pass, using the repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. To deploy by hand from this folder:

```sh
rm -rf dist && mkdir -p dist/icons && cp index.html dist/ && cp icons/*.png dist/icons/ && npx wrangler pages deploy dist --project-name=glydaway --branch=main
```

## App icon
`icons/` holds the app icon:
- `icon-1024.png`: App Store, opaque, square corners (Apple rounds them)
- `icon-180.png`, `icon-120.png` and `icon-60.png`
- `favicon-512.png`: the website favicon

The site uses `favicon-512.png` as its favicon and `icon-180.png` as the iPhone home-screen icon.

The art is a 48x48 pixel grid. The bird is Glydrift's own Volt, taken from Glydrift's icon (`icons/source/volt-glydrift-32.png`) and tilted into a glide. To regenerate everything, run `python3 glydaway/scripts/make-icon.py` (needs Pillow and numpy).
