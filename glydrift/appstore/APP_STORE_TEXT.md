# Glydrift: App Store Connect text

Everything here was checked against the game's code (build at commit 52ce7c4): `src/player/characterDefs.js`,
`src/biomes/biomes.js`, `src/levels/levelDefs.js`, `src/systems/analytics.js`,
`src/systems/crashReport.js`, `src/online/*.js`, `src/data/passPlus.js`, `src/data/seasons*.js`,
`public/seasons.json`, `public/privacy.html`, `docs/PRIVACY_DATA.md` and `docs/APP_STORE_REVIEW.md`.
Character counts are in brackets.

## Listing

**App name** [8]

```
Glydrift
```

**Subtitle** (max 30) [25]

```
Neon one-tap arcade flyer
```

**Promotional text** (max 170) [153]

```
Tap to fly through neon gaps! Drift across 8 realms from Sakura Skies to the Abyss, beat 50 handmade levels and unlock 30+ heroes. How far can you glide?
```

**Description** [1457 of 4000]

```
Tap to fly. Thread the gaps. Don't stop.

Glydrift is a fast, one-tap pixel-art arcade game. Every tap is a flap: slip between pillars, dodge saws, lasers and eye beams, and drift through glowing realms as the world speeds up around you.

ENDLESS
One run, every realm. Start in the Neon Void, glide through Sakura Skies, Solar Storm, Frozen Nebula and the Glitch Realm, and try to survive the Abyss. Hidden rifts lead to 4 secret dimensions. Chain close calls and coins into big combos.

50 HANDMADE LEVELS
Five realms of hand-built courses, each with three stars to earn: finish it, grab all three star coins, and fly it without a crash.

HEROES
Unlock 30+ heroes with coins, challenges and the Lucky Spin: a storm bird, a baby dragon, a living star, a sky koi and many more, each with its own trail and sound.

LEADERBOARDS
Score and distance boards for all time, this week and today. Pick a username and climb.

DRIFT PASS
Every season brings a free reward track with new heroes, coins and items, earned just by playing.

- No ads
- Plays offline; the leaderboard and cloud save need a connection
- No account needed. Create one (email or Sign in with Apple) to keep your progress on every device.

Drift Pass+ is an optional purchase for each season. It unlocks a second reward track with exclusive heroes, skins and titles, plus extra coins, shards and Mystery Pods. It doesn't change speed, hitbox, score or the leaderboards.

Created by Sam Eyde III.
```

**Keywords** (max 100, comma-separated, no spaces) [97]

```
arcade,onetap,flyer,flying,neon,pixel,retro,endless,casual,reflex,levels,leaderboard,heroes,glide
```

(No "Glydrift": the app name is already indexed. No other games' names.)

**Category**

- Primary: **Games**, subcategories **Arcade** and **Casual**
- Secondary category: none needed (optional: **Entertainment**)

**URLs and copyright**

- Support URL: `https://glydrift.com/support`
- Marketing URL: `https://glydrift.com`
- Privacy Policy URL: `https://glydrift.com/privacy`
- Copyright: `2026 Sam Eyde III`

## What the facts behind the text are

| Claim | Where it comes from |
|---|---|
| 8 realms | `ENDLESS_IDS` in `src/biomes/biomes.js`: Neon Void, Sakura Skies, Solar Storm, Frozen Nebula, Glitch Realm, Abyss, Peaceful Valley, Hurricane |
| 4 hidden dimensions | `DIMENSION_IDS`: Prism Rift, Tidal, Chrono, Mirror (reached through rifts during an endless run) |
| 50 handmade levels, 3 stars each | `LEVEL_DEFS` (50 levels, 5 realms of 10; 150 stars) |
| 30+ heroes to unlock | 90 hero definitions. Always available: 45 (the starter VOLT + 12 coin heroes + 22 coin-or-challenge heroes + 10 Lucky Spin heroes), plus limited-time heroes. Season 1 adds 10 free Drift Pass heroes and 10 Drift Pass+ heroes. 30+ is true without counting anything seasonal or paid. |
| Leaderboards: score and distance; all time, this week, today | `src/online/leaderboard.js` |
| No ads, no tracking | no ad SDK, no advertising ID; `Analytics` keeps its event log on the device and never sends it (`endpoint: null`) |
| Plays offline | all game content is bundled; online features (leaderboard, accounts, cloud save, Pass+) need a connection |

## App Privacy ("nutrition label")

**Do you or your third-party partners collect data from this app?** Yes.

| Apple data type | Collected | Linked to user | Used for tracking | Purposes | What it is in Glydrift |
|---|---|---|---|---|---|
| Contact Info → Email Address | Yes (only if the player creates an account or uses Sign in with Apple) | Yes | No | App Functionality | account sign-in and password reset (Supabase Auth) |
| Identifiers → User ID | Yes | Yes | No | App Functionality | anonymous player ID (Supabase anonymous sign-in, made the first time the game goes online), account ID, Apple user ID for Sign in with Apple |
| Purchases → Purchase History | Yes | Yes | No | App Functionality | Drift Pass+ transaction ID, original transaction ID, product, season, date, sandbox/production (`purchases` table) |
| User Content → Other User Content | Yes | Yes | No | App Functionality | the username and equipped title shown on the public leaderboards; name reports (REPORT A NAME) |
| User Content → Gameplay Content | Yes | Yes | No | App Functionality | leaderboard entries (score, distance, run time, hero, title, date; level best times) and the cloud save for signed-in players (coins, heroes, items, progress, stats) |
| Diagnostics → Crash Data | Yes | Yes (rows carry the player ID) | No | App Functionality | error message and stack, game build, device model, OS version, screen size, where the run was (score, distance, realm, hero, mode, screen), memory use (`crash_reports` table) |
| Diagnostics → Performance Data | No | | | | |
| Usage Data (Product Interaction, Advertising Data, Other) | No | | | | the game's event log stays on the device and is never sent |
| Location, Health, Financial Info, Contacts, Sensitive Info, Browsing/Search History, Photos/Videos, Audio, Other Data | No | | | | |

- **Tracking: No.** "Data Not Used to Track You" is correct: no ads, no advertising identifier, no data
  shared with data brokers or used across other companies' apps or sites, and the app never shows the
  App Tracking Transparency prompt.
- Payment details are never received (Apple handles payment). Passwords are stored only as a hash by
  Supabase Auth.
- Note: older notes listed leaderboard scores as "Usage Data → Gameplay Content". Apple files
  **Gameplay Content** under **User Content**; use that one.
- Make sure the app's `PrivacyInfo.xcprivacy` lists the same types (it should include Crash Data and
  Gameplay Content / Other User Content).

## Age rating questionnaire

| Question | Answer | Why |
|---|---|---|
| Cartoon or Fantasy Violence | Infrequent / Mild | the hero crashes into hazards (saws, lasers, pillars); no blood, no characters harmed |
| Realistic Violence | None | |
| Prolonged Graphic or Sadistic Realistic Violence | None | |
| Profanity or Crude Humor | None | usernames go through a profanity filter |
| Mature or Suggestive Themes | None | |
| Horror / Fear Themes | None | (the Abyss is dark red with eyes and spikes, but cartoon pixel art) |
| Sexual Content or Nudity | None | |
| Alcohol, Tobacco or Drug Use | None | |
| Medical or Treatment Information | None | |
| Simulated Gambling | None | Lucky Spin spins are earned by scoring (1 per 2,500 points) and Mystery Pods are bought with in-game coins/shards earned by playing; neither can be bought with real money, neither pays out money, odds are shown |
| Contests | None | |
| Gambling (real money) | No | |
| Loot boxes | See note | Mystery Pods can't be bought directly with money. But the paid Drift Pass+ track has 6 Mystery Pods among its 50 rewards (earned by playing after buying). The cautious answer is **Yes**; answering No is defensible because no random item is sold. Odds are shown on every pod. |
| Unrestricted Web Access | No | links open only the game's own privacy/support pages |
| User-Generated Content | Yes | usernames (and titles) on the public leaderboards; filter + REPORT A NAME + removal |
| Messaging and Chat | No | |
| Advertising | No | |
| In-App Purchases | Yes | Drift Pass+ |
| Parental controls / age assurance | No | |

Expected rating: **9+** (mild cartoon violence; 13+ only if Apple weighs the UGC usernames that way).
Made for Kids: **No**.

## App Review Information → Notes

```
Glydrift is a one-tap arcade flyer: tap to flap and fly through the gaps between hazards across 8 realms, in an endless mode or 50 handmade levels. No account is needed to play. Accounts are optional (Settings → ACCOUNT) and only save progress across devices.

Demo account (has progress; Drift Pass+ already owned):
email: ____________________   password: ____________________
Sign in from Settings → ACCOUNT → SIGN IN.

In-app purchase: Drift Pass+ (non-consumable, one per season).
- Product ID: com.glydrift.game.driftpassplus.s1 (Season 1, $3.99 US).
- It unlocks a second reward track in that season's Drift Pass: exclusive heroes, skins, titles and a banner, plus coins, shards and Mystery Pods, earned by playing. It gives no gameplay advantage: speed, hitbox, scoring and leaderboards are the same for everyone. (Some Pass+ heroes add a small coin/XP bonus to what a run pays, never to its score.)
- Where: home screen → MORE → SEASON 1 · ABYSS RISING (the Drift Pass), or Shop → SEASON 1 PASS → GET PASS+ $3.99 → BUY.
- RESTORE PURCHASES is at the top of the Drift Pass screen (next to GET PASS+) and next to the BUY button on the Pass+ offer.
- Purchases are verified on our server with the App Store Server API before anything unlocks. A guest (no account) can buy; signing in keeps the purchase on the account.

How to test it in the sandbox: sign in to a Sandbox Apple Account (Settings → Developer → Sandbox Apple Account), open the Drift Pass, tap GET PASS+ → BUY (the sheet shows [Sandbox]). Delete and reinstall the app, then tap RESTORE PURCHASES: Pass+ comes back.

Lucky Spin and Mystery Pods use only spins/coins earned by playing; they can't be bought with real money. Odds are shown (ODDS on the Lucky Spin screen; on each pod in the Shop).

Account deletion: Settings → ACCOUNT → DELETE MY ACCOUNT (deletes the account, cloud save, leaderboard entries and purchase records immediately).
Report an offensive name: Leaderboard → REPORT A NAME.
Privacy policy and support: Settings → PRIVACY POLICY / SUPPORT (https://glydrift.com/privacy, https://glydrift.com/support).

Some playable heroes are based on real people; each has given permission to appear in the game.
```

(Fill in the demo account before submitting. How to set it up: `docs/APP_STORE_REVIEW.md` → "The demo account".)

## Screenshots and preview in this folder

- `screenshots/iphone-6.9/` (1320 x 2868) and `screenshots/ipad-13/` (2064 x 2752), same order:
  1. ONE TAP TO FLY (Neon Void run)
  2. 8 WILD REALMS (Sakura Skies run)
  3. SURVIVE THE ABYSS (Abyss run)
  4. UNLOCK 30+ HEROES (Heroes screen, NOVA)
  5. 50 HANDMADE LEVELS (level map)
- `preview/app-preview-886x1920.mp4`: 6.9"/6.7" iPhone app preview (real gameplay, game music).
  Set the poster frame in App Store Connect to a mid-flight moment.

All captures are the real game (test build, god mode only so no run ended mid-capture, flown by an
autopilot that taps like a player). The profile name is "Drifter"; the leaderboard is not shown.
