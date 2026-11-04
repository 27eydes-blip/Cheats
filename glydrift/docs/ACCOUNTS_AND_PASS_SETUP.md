# Accounts, cloud save, titles, two leaderboards and Drift Pass+: setup

The game is live and works without these steps.

**Until you finish them:**
- Account sign-up waits, with the message "Accounts open soon — your progress is safe on this device until then".
- The leaderboards run without the new `distance` and `title` columns.
- Drift Pass+ can't be bought.

Nothing here needs a secret key in the app or the repository.

## 1. Supabase: database (SQL Editor, in this order)

Paste each file into **SQL Editor → New query → Run**. Each one is safe to run twice.

| File | What it does |
|---|---|
| `supabase/migrations/20261104000001_leaderboard_distance.sql` | Adds a `distance` column to `scores`. A server check rejects scores and distances that are impossible for the run's time. |
| `supabase/migrations/20261104000002_accounts_cloud_save.sql` | Adds the `player_saves` table, where only the owner can read or write. Adds `delete_my_account()` for "Delete my account". |
| `supabase/migrations/20261104000003_titles.sql` | Adds a `title` column to `scores`. |
| `supabase/migrations/20261104000004_drift_pass_plus.sql` | Adds the `purchases` table: players can read their own rows, and the app can't write any. Adds a guard so a Drift Pass+ title needs a verified purchase. |

Row-level security is on for every new table.

After the migrations, `npm run test:rls` still checks the original scores rules.

## 2. Supabase: authentication

1. **Authentication → Sign In / Providers → Email:**
   - Turn it on.
   - Keep "Confirm email" on.
   - Keep **Anonymous sign-ins** on; the game already uses them.
2. **Authentication → URL Configuration:**
   - Site URL: `https://27eydes-blip.github.io/Cheats/glydrift/`
   - Redirect URLs: add the same URL, plus `capacitor://localhost` for the iOS app.
3. **Authentication → Emails → SMTP:** set up a real email sender (for example Resend, Postmark or SES). Supabase's built-in sender only allows a few emails an hour, which isn't enough for confirmations and password resets in a live game.
4. **Authentication → Providers → Apple:**
   - Turn it on.
   - Under Client IDs, add `com.glydrift.game`, the iOS bundle ID used for native sign-in.

## 3. Supabase: the purchase check (Edge Function)

With the Supabase CLI:

```bash
supabase functions deploy verify-purchase --project-ref cdjcvhywrbsdryagqxqg
supabase secrets set --project-ref cdjcvhywrbsdryagqxqg \
  APPSTORE_ISSUER_ID=... APPSTORE_KEY_ID=... APPSTORE_BUNDLE_ID=com.glydrift.game \
  APPSTORE_PRIVATE_KEY="$(cat SubscriptionKey_XXXXXX.p8)"
```

The function asks Apple's App Store Server API about each transaction. It only records the purchase when all of these hold:
- it's for this app;
- it's for this season's product;
- it was bought by this player's account;
- it hasn't been refunded.

Supabase gives the function its own service role key on Supabase's servers. That key is never in the app or the repository.

## 4. App Store Connect

1. Create the app with bundle ID `com.glydrift.game`.
2. **In-App Purchases:** add one **Non-Consumable** per season.
   - Product ID: `com.glydrift.game.driftpassplus.s1`, then `…s2` for the next season, and so on.
   - Price: $3.99.
   - Name: "Drift Pass+ · Season 1".
3. **Users and Access → Integrations → In-App Purchase:** generate a key. Its issuer ID, key ID and `.p8` file are the three secrets in step 3.
4. **App Store Server Notifications (recommended, not built yet):** point V2 notifications at a small function that sets `purchases.revoked_at` on refunds. Today a refund is caught the next time that purchase is verified.

## 5. The iOS app (Xcode)

Follow `ios-plugin/README.md`:
1. Add `GlydriftStorePlugin.swift` (StoreKit 2) to the app and register it.
2. Add the **In-App Purchase** and **Sign in with Apple** capabilities.
3. Run `npm i @capacitor-community/apple-sign-in && npx cap sync ios`.

## 6. Check on a real iPhone (these can't be tested in a browser)

1. Accounts: create an account, confirm the email, then sign in on a second device and check everything comes back.
2. Forgot password: the email link opens the game on the "New password" screen.
3. Sign in with Apple.
4. Buy Drift Pass+ with a Sandbox tester, then use RESTORE PURCHASES on a second device.
5. Delete my account. Afterwards, the account, its save, its scores and its purchases are gone from Supabase.
