# Glydrift: what you still do yourself (App Store Connect & friends)

© 2026 Sam Eyde III. All rights reserved.

The Codemagic steps are in [CODEMAGIC_SETUP.md](CODEMAGIC_SETUP.md). This list covers everything
Codemagic can't do for you. Tick the items as you go.

## Before the first build

- [ ] Apple Developer Program membership approved ($99/year).
- [ ] **Agreements, Tax, and Banking** (App Store Connect → Business): accept the **Paid Apps**
      agreement and fill in tax and bank details. Drift Pass+ can't be sold without this, and
      the in-app purchase won't even load in TestFlight.
- [ ] **Identifier** `com.eyde.glydrift` registered, with **Sign In with Apple** ticked
      (CODEMAGIC_SETUP.md step 1).
- [ ] **App record** created in App Store Connect with that bundle ID (step 2).
- [ ] Codemagic connected: API key, `CERTIFICATE_PRIVATE_KEY`, and the GitHub secret and
      variable (steps 3–6).

## Server settings that follow the bundle ID

The app's bundle ID is `com.eyde.glydrift`. `docs/ACCOUNTS_AND_PASS_SETUP.md` was written for
`com.glydrift.game`. Where it says that, use `com.eyde.glydrift` instead:

- [ ] **Supabase → Authentication → Providers → Apple → Client IDs:** add `com.eyde.glydrift`.
      On iPhone, Apple's sign-in token is issued for the app's bundle ID.
- [ ] **Supabase secret** `APPSTORE_BUNDLE_ID=com.eyde.glydrift` for the `verify-purchase`
      function. Otherwise every purchase is rejected as "not for this app".
- [ ] **Supabase → Authentication → URL Configuration → Redirect URLs:** `capacitor://localhost`
      is there.
- [ ] **Apply the server-side checks** (`docs/SECURITY_AUDIT_2026-11-05.md`, step 3):
      `supabase db push`, `supabase functions deploy verify-purchase`, and
      `supabase functions deploy appstore-notifications --no-verify-jwt`.
- [ ] **App Store Connect → Glydrift → App Information → App Store Server Notifications:**
      Production and Sandbox URL `https://<project-ref>.supabase.co/functions/v1/appstore-notifications`,
      Version 2. Refunds then take paid extras off the leaderboard right away.
- [ ] Optional, after launch: set the Supabase secret `ALLOW_SANDBOX=false` so free test
      purchases stop unlocking Drift Pass+ (keep it on while App Review is testing a version).
- [ ] The Drift Pass+ **product IDs** stay `com.glydrift.game.driftpassplus.s1`, `…s2`, and so
      on. That's what the game asks for. Product IDs don't have to start with the bundle ID.

## In-App Purchase (Drift Pass+)

- [ ] **Monetization → In-App Purchases → +** → **Non-Consumable**, with Product ID
      `com.glydrift.game.driftpassplus.s1` and reference name "Drift Pass+ · Season 1".
- [ ] Price $3.99, display name and description, and a **review screenshot** of the Drift Pass+
      screen.
- [ ] **Users and Access → Integrations → In-App Purchase** → generate a key. It's for the
      Supabase `verify-purchase` function and is separate from the Codemagic API key.
- [ ] When you submit version 1.0.0, attach the in-app purchase to it. The first in-app purchase
      has to go to App Review together with an app version.

## TestFlight

- [ ] **TestFlight → Internal Testing → +** to make a group, for example "Me", and add yourself.
      Every new build then reaches your iPhone automatically through the TestFlight app.
- [ ] Optional: an **external** group for friends. Its first build needs a short Beta App
      Review, a "What to Test" note and a beta contact email. To send builds to it
      automatically, uncomment `beta_groups` in `codemagic.yaml`.
- [ ] Test on a real iPhone **and** iPad: portrait lock, full screen, sound after the first tap,
      sign in (email and Apple), buying and restoring Drift Pass+ with a **Sandbox** tester
      (Users and Access → Sandbox), and deleting the account.

## The App Store listing (App Store Connect → Glydrift → iOS App 1.0.0)

- [ ] **Screenshots:** iPhone 6.9" (1320 × 2868 or 1290 × 2796) **and** iPad 13"
      (2064 × 2752 or 2048 × 2732). You need the iPad ones because the app also runs on iPad.
      Take them in portrait from TestFlight, or from the web build at those sizes.
- [ ] **Promotional text, description, keywords** (100 characters), **support URL**, and
      optionally a marketing URL.
- [ ] **Category:** Games → Arcade, plus a secondary category if you want one.
- [ ] **Age rating** questionnaire. Leaderboard usernames are user-generated content that other
      players see, so answer that question honestly.
- [ ] **Copyright** line, for example "2026 Your Name".
- [ ] **Price:** Free, plus availability (countries).
- [ ] **Build:** choose the TestFlight build that Codemagic uploaded.

## App Privacy (required before you submit)

- [ ] **Privacy Policy URL:** host a privacy policy, for example on GitHub Pages, built from
      `docs/PRIVACY_DATA.md`.
- [ ] **App Privacy → Data types:** answer as in `docs/PRIVACY_DATA.md`. In short: email
      address, user ID, purchases and gameplay/leaderboard data, used for App Functionality,
      linked to the user, **no tracking**.
- [ ] **Account deletion:** already in the game (Settings → Account → Delete my account).
      Mention it in the review notes.

## App Review

- [ ] **App Review Information:** contact name, phone and email. In the notes, say that
      accounts are optional (the game plays without signing in), where to find Drift Pass+,
      and where to find account deletion. Add a demo account if you want the reviewer to see
      signed-in features.
- [ ] **Export compliance:** already answered in the app (`ITSAppUsesNonExemptEncryption = NO`,
      standard HTTPS only). If App Store Connect asks anyway, answer "None of the algorithms
      mentioned above".
- [ ] **Content rights:** confirm you own or have the rights to everything in the app. The
      fonts are open-source (OFL); everything else is generated by the game.
- [ ] **Version release:** manual or automatic after approval.
- [ ] **Add for Review → Submit.** Codemagic only uploads to TestFlight. Submitting for review
      is up to you (`submit_to_app_store: false` in `codemagic.yaml`).
