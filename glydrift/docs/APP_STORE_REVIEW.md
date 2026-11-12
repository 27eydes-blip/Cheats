# App Store review: answers, notes and listing

Everything to type into App Store Connect for Glydrift (bundle ID `com.glydrift.game`).
Pass/fail checks are in the review-readiness report; this page holds the answers.

## App Privacy (App Store Connect → App Privacy)

**Do you or your third-party partners collect data from this app?** Yes.

| Data type (Apple's name) | Collected | Linked to the user | Used for tracking | Purpose |
|---|---|---|---|---|
| Contact Info → Email Address | Yes (accounts only) | Yes | No | App Functionality |
| Identifiers → User ID (player ID, username, Apple user ID) | Yes | Yes | No | App Functionality |
| Purchases → Purchase History | Yes | Yes | No | App Functionality |
| Usage Data → Gameplay Content (scores, distances, level times, cloud save) | Yes | Yes | No | App Functionality |
| Diagnostics → Crash Data | Yes | Yes | No | App Functionality |
| Diagnostics → Performance Data | No | | | |
| Everything else (location, contacts, health, financial info, browsing, search, sensitive info, photos, audio, advertising data, other diagnostic data) | No | | | |

Tracking: **No.** No ads, no advertising ID, no tracking permission prompt.
This matches `ios/App/App/PrivacyInfo.xcprivacy` and https://glydrift.com/privacy.

Privacy Policy URL: `https://glydrift.com/privacy`

## Export compliance

**Does your app use encryption?** Yes, but only standard HTTPS through Apple's own networking.
**Is it exempt?** Yes. `ITSAppUsesNonExemptEncryption` is `false` in Info.plist, so App Store
Connect doesn't ask again for each build. No documents needed.

## Age rating questionnaire

| Question | Answer |
|---|---|
| Cartoon or Fantasy Violence | Infrequent/Mild (the hero crashes into obstacles; no blood or gore) |
| Realistic Violence | None |
| Sexual content / nudity | None |
| Profanity or crude humour | None |
| Alcohol, tobacco, drugs | None |
| Mature / suggestive themes | None |
| Horror / fear themes | None |
| Medical / treatment information | None |
| Simulated Gambling | None. (Lucky Spin and Mystery Pods use coins earned by playing, can't be bought with money, never pay out money and show their odds.) |
| Contests | None |
| Unrestricted web access | No |
| User-generated content | Yes: usernames on the leaderboard (profanity filter, REPORT A NAME, names removed after reports) |
| Messaging / chat | No |
| Loot boxes (paid random items) | No |

Expected rating: **9+** (because of mild cartoon violence). Made for Kids: **No.**

## Review notes (App Store Connect → App Review Information → Notes)

> Glydrift is a one-tap arcade flyer. Tap to flap through the gaps. No account is needed to play.
>
> Demo account (has progress and Drift Pass+ already unlocked):
> email: (the demo email) · password: (the demo password)
> Sign in from Settings → ACCOUNT → SIGN IN.
>
> In-app purchase: Drift Pass+ (non-consumable, one per season) unlocks a second, cosmetic-only
> reward track in the Drift Pass. Open it from the home screen: SEASON 1 banner → GET PASS+.
> RESTORE PURCHASES is next to the buy button. Purchases are verified on our server with the App
> Store Server API before anything unlocks.
>
> Lucky Spin and Mystery Pods use coins earned in the game only. Odds are shown (under the wheel and behind the ODDS button on
> the Lucky Spin screen; on each pod in the Shop). They can't be bought with real money.
>
> Account deletion: Settings → ACCOUNT → DELETE MY ACCOUNT (deletes everything immediately).
> Report an offensive name: Leaderboard → REPORT A NAME.
> Privacy policy and support: Settings → PRIVACY POLICY / SUPPORT.
>
> Some playable heroes are based on real people; each has given permission to appear in the game.

Contact: your name, phone and email. Sign-in required: **Yes** (fill in the demo account).

## The demo account

1. In the app (or at https://glydrift.com): Settings → ACCOUNT → CREATE ACCOUNT. Use an email
   you control just for review, e.g. a new mailbox, and a strong password.
2. Play a few runs and a few levels, so the account has progress, then wait for the cloud save
   (a few seconds after a run, while online).
3. Give it Drift Pass+ without buying: Supabase → SQL Editor → run (put the demo email in):

```sql
insert into public.purchases
  (user_id, season_id, product_id, transaction_id, original_transaction_id, environment, purchased_at)
select id, 's1', 'com.glydrift.game.driftpassplus.s1', 'review-demo-s1', 'review-demo-s1',
       'Sandbox', now()
from auth.users where email = 'DEMO-EMAIL-HERE'
on conflict do nothing;
```

4. In the game: Drift Pass → RESTORE PURCHASES. Pass+ shows as owned.

## Testing Drift Pass+ in the sandbox (before submitting)

1. App Store Connect → Users and Access → Sandbox → add a Sandbox Apple Account (a new email).
2. On the iPhone: Settings → Developer → Sandbox Apple Account → sign in with it (Developer
   appears after installing a TestFlight or Xcode build).
3. Install the TestFlight build, open the Drift Pass, tap GET PASS+ → BUY. The price is the
   App Store's (in your currency); the sheet says [Sandbox].
4. Delete the app, reinstall, sign in to the same game account, tap RESTORE PURCHASES: it
   comes back.
5. The in-app purchase must be **Ready to Submit** with a review screenshot (the Pass+ offer
   screen) and be added to the version on the version page ("In-App Purchases and
   Subscriptions") so it's reviewed with the app.

## Store listing (suggested)

- **Name:** Glydrift
- **Subtitle (30):** `Neon one-tap arcade flyer` (25)
- **Promotional text (170):** `New realm: Sakura Skies! 50 handmade levels, 8 living realms, 4 hidden dimensions, new heroes and a whole new Drift Pass. How far can you glide?`
- **Description:**

> Tap to fly. Thread the gaps. Don't stop.
>
> Glydrift is a fast, neon, one-tap arcade game. Glide through eight living realms, from the
> Neon Void to the Abyss, as the world speeds up around you.
>
> • ENDLESS: one run through every realm, with combos, close calls and coin streaks
> • 50 LEVELS: handmade courses with three stars each
> • HEROES: dozens of heroes to unlock, each with its own look and sound
> • LEADERBOARDS: score and distance boards, all time, this week and today
> • DRIFT PASS: earn rewards every season just by playing
> • Plays offline. No ads. No account needed (create one to save your progress across devices).
>
> Drift Pass+ is an optional purchase with cosmetic rewards only: no speed, score or hitbox
> changes.

- **Keywords (100):** `arcade,one tap,flying,neon,endless,runner,casual,reflex,levels,leaderboard,retro,pixel,glide` (93). Don't use other games' names.
- **Category:** Games → Arcade (secondary: Casual)
- **Support URL:** `https://glydrift.com/support`
- **Marketing URL:** `https://glydrift.com`
- **Copyright:** `2026 Sam Eyde III`

## Screenshots

Required sizes (portrait):

| Device slot | Size |
|---|---|
| iPhone 6.9" (required) | 1320 × 2868 (or 1290 × 2796) |
| iPad 13" (required while iPad is supported) | 2064 × 2752 (or 2048 × 2732) |

Smaller sizes are scaled from these. Up to 10 per size; 5 suggested, in this order:

1. **Mid-run in the Neon Void** with a combo going: "Tap. Glide. Don't stop."
2. **Sakura Skies / the Abyss** at speed: "8 living realms"
3. **The level map**: "50 handmade levels"
4. **The leaderboard podium**: "Climb the world leaderboard"
5. **Heroes / Drift Pass**: "Unlock dozens of heroes"

Use real game screens only (no device frames needed); no placeholder text.
