# Glydrift: the last steps to the App Store (in order)

Everything in the game itself is done and tested. These are the steps only you can do (they need
your Apple account, your Supabase dashboard or a real device). Details for each are in
`APP_STORE_CHECKLIST.md`, `CODEMAGIC_SETUP.md` and `docs/APP_STORE_REVIEW.md`.

## 1. Supabase (SQL Editor, ~10 minutes)

1. **Database → Extensions → pg_cron → Enable.** Then run
   `supabase/migrations/20261109000001_all_mighty.sql` (see `supabase/ALL_MIGHTY.md`). Without it
   ALL MIGHTY doesn't update.
2. Run `supabase/cleanup/20261108_remove_ci_test_scores.sql` (removes test scores from the
   leaderboard before reviewers see it).
3. Run `supabase/queries/ipad_crashes.sql` (read-only). Look at result 2: if the iPad crashes
   cluster at realm borders, the 12 Nov fix covers them. If they cluster somewhere else, send me
   the result before submitting.
4. **Authentication → Providers → Apple → Client IDs:** add `com.glydrift.game`.
5. **Edge Functions → Secrets:** `APPSTORE_BUNDLE_ID` = `com.glydrift.game` (without it every
   Drift Pass+ purchase is rejected).
6. **Authentication → URL Configuration → Redirect URLs:** `capacitor://localhost`.

## 2. Apple (App Store Connect)

1. Developer Program membership active; **Business → Agreements**: Paid Apps accepted, tax and
   bank filled in.
2. **Identifier** `com.glydrift.game` with Sign in with Apple; the app record created.
3. **In-App Purchase**: Non-Consumable `com.glydrift.game.driftpassplus.s1`, $3.99, review
   screenshot (the Drift Pass+ screen). **Users and Access → Integrations → In-App Purchase** key
   → into the Supabase `verify-purchase` function secrets.
4. **Sandbox tester** (Users and Access → Sandbox) for testing the purchase.

## 3. Build and test on real devices (Codemagic → TestFlight)

1. Connect Codemagic (`CODEMAGIC_SETUP.md`), start a build, install it from TestFlight.
2. **On a real iPad** (the crashes were on iPads): play endless past 20,000 points twice. It
   should never go invisible or crash; if the graphics ever reset you'll see "Restoring
   graphics…" and then the pause menu.
3. **On a real iPhone and iPad**: sound after the first tap; sign up with email and with Apple;
   buy Drift Pass+ with the sandbox tester, delete the app, reinstall, **Restore Purchases**;
   sign in on both devices at once, buy a hero on one and play a run on the other, then check
   both have the hero and all the coins; Settings → Account → Delete my account.

## 4. The listing

1. **Screenshots**: ready-made at the exact sizes (iPhone 6.9" 1290 × 2796, iPad 13"
   2048 × 2732): upload them as they are.
2. Name, subtitle, promotional text, description, keywords: copy from
   `docs/APP_STORE_REVIEW.md` → "Store listing".
3. **Privacy Policy URL:** `https://glydrift.com/privacy` (live). **Support URL:**
   `https://glydrift.com/support` (live).
4. **App Privacy** answers and the **age rating** answers: `docs/APP_STORE_REVIEW.md`.
5. **Copyright:** `2026 Sam Eyde III`. Category: Games → Arcade. Price: Free.
6. **App Review Information**: your contact details, the review notes and a demo account
   (`docs/APP_STORE_REVIEW.md` → "Review notes" / "The demo account").
7. Attach the Drift Pass+ in-app purchase to version 1.0.0, choose the TestFlight build,
   **Submit for Review**.
