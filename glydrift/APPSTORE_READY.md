# Glydrift v1.0.0: App Store readiness (13 Nov 2026)

Branch `release/appstore-v1`. The game is ready. What's left is setup that needs your Apple,
Codemagic, GitHub and Supabase accounts (section 3). Nothing in that list needs a code change.

🟢 done and tested · 🟡 done, with something for you to know or decide · 🔴 blocked on you

## 1. Checklist

### Step 1: open work
| | Item | Status |
|---|---|---|
| 🟢 | iPad context-loss fix (`bugfix/ipad-context-loss`) | Merged and live. The overnight stress test then found two more cases, both now fixed with tests: a lost context while the next realm's art is still loading, and a lost context after visiting the Shop or Levels map. |
| 🟢 | Sakura Skies (`realm/sakura-skies`) | Merged and live. Every realm was played in the stress sessions. |
| 🟢 | `bugfix/overnight-nov11` | Merged and live. |
| 🟡 | SQL to run | Run in this order: 1) `cleanup/20261108_remove_ci_test_scores.sql`, 2) enable pg_cron, then `migrations/20261109000001_all_mighty.sql`, 3) `migrations/20261113000001_delete_account_everything.sql`. All three are safe. The cleanup deletes only the 32 TestPilot rows (8 Nov, 08:45–11:30 UTC). ALL MIGHTY adds new read-only tables and doesn't touch scores. The deletion function only ever acts on the signed-in player (`auth.uid()`). Nothing has been run on the database yet: that's for you to do. |

### Step 2: Apple rejection checklist
| | Item | Status |
|---|---|---|
| 🟡 | Account deletion without the service key | Settings → Account → Delete my account calls a locked-down database function, `delete_my_account()`. It runs with the database's rights but deletes only the caller's own data and login. The service key is never in the app. I used a database function instead of an Edge Function because it does the same job without putting a service key anywhere. Apple-token revocation isn't built yet (see section 2). |
| 🟢 | Sign in with Apple | Shown wherever email sign-in is. |
| 🟢 | Restore Purchases | In the Drift Pass+ screen and Settings. |
| 🟢 | StoreKit only | The native StoreKit plugin, checked server-side by the `verify-purchase` function. No web or other payments in the iOS app. The Pass+ "hang" bug is fixed. |
| 🟢 | User-generated content | Filtered names show as "Hidden player". The leaderboard has REPORT A NAME and a new BLOCK button. support@glydrift.com is shown in Settings. Note: the name filter runs only in the app. |
| 🟢 | Privacy and support links | In Settings, linking to glydrift.com/privacy and glydrift.com/support (both live). |
| 🟢 | No placeholder, test or beta UI or data | Debug flags only work in test builds. TestPilot scores are removed by the cleanup SQL above. |
| 🟢 | Offline | Tested on all 5 devices: runs, the shop and saving work offline, and scores queue and upload when the connection is back. |
| 🟢 | No Android, other-store or web mentions | Gated off in the iOS app. The only matches left are code comments and browser detection that never shows. |
| 🟢 | Native feel | Haptics, safe areas, no web install prompt, no bounce or zoom, pauses when backgrounded. |
| 🟢 | App icon and launch screen | The icon is 1024×1024 with no transparency layer. `LaunchScreen.storyboard` is in place. |
| 🟢 | `ITSAppUsesNonExemptEncryption = false` | Set in Info.plist. |
| 🟢 | Version and build number | Version 1.0.0. Codemagic sets the build number to its own build number + 100, so the first upload is build 101 or higher. No build has ever been uploaded, so nothing can be higher. |

### Step 3: stress tests (Chromium, simulated devices)
| | Device | Result |
|---|---|---|
| 🟢 | iPhone SE | 33 min, 28 runs, 0 errors, 0 blank frames, no memory growth |
| 🟢 | iPhone 15 | 33 min, 28 runs, 0 errors |
| 🟢 | iPhone 17 Pro Max | 33 min, 28 runs, 0 errors |
| 🟡 | iPad mini | About 15 minutes clean. That's when the test found the Shop/Levels context-loss bug, and the session stopped there. After the fix, context-loss checks passed in every realm. |
| 🟡 | iPad Pro 13" | Same as the iPad mini. |

Covered in every session:
- Every realm and dimension.
- 14 forced Abyss double lasers.
- Deaths with RETRY.
- Seven hero swaps, including the Pass+ hero.
- Shop, Pass, Heroes, Locker, Spin and Levels opened 17 times.
- Backgrounding: 10 quick hide/show cycles, during the countdown and on game over.
- iPad rotation: 50 checks per iPad.
- Losing the internet mid-run.
- Starting with every outside request blocked.

These were simulated devices in a browser. A real-device check in TestFlight is still on your list (section 3, step C).

### Step 4: store assets (`glydrift/appstore/`)
| | Item | Status |
|---|---|---|
| 🟢 | iPhone 6.9" screenshots | 5 at 1320×2868, with captions: One tap to fly · 8 wild realms · Survive the Abyss · Unlock 30 heroes · 50 handmade levels |
| 🟢 | iPad 13" screenshots | 5 at 2064×2752, with the same captions |
| 🟢 | App Preview | `preview/app-preview-886x1920.mp4` (optional) |
| 🟡 | `APP_STORE_TEXT.md` | Listing, keywords, App Privacy answers, age rating and review notes are ready. You need to fill in the demo account. |

### Step 5: build
| | Item | Status |
|---|---|---|
| 🔴 | Codemagic → TestFlight | The release branch was pushed and the tests passed. The build step then stopped with "Codemagic isn't connected yet: add the CODEMAGIC_API_TOKEN secret and the CODEMAGIC_APP_ID variable". Only you can do this: section 3, step B. |
| 🟢 | CI | Every commit on the release branch passed the full lane on Chromium, Firefox and WebKit, including the Abyss double-beam test. |

## 2. What's in v1 and what was held back

**In v1:**
- Everything live on glydrift.com, including:
  - 8 realms plus the dimensions (Sakura Skies included);
  - the Abyss;
  - 50 levels;
  - 30+ heroes (THE NEWBLEIZER, JAMAL, DAWSON, SPLICE, MATTOE and the rest);
  - Shop, Lucky Spin, Season 1 Drift Pass and Drift Pass+;
  - accounts with cloud sync;
  - both leaderboards and ALL MIGHTY.
- iPad fixes: crashes and the invisible-screen bug, lower graphics memory, and lost-context recovery.
- This release's fixes:
  - App Store compliance: block button, support email, "Hidden player", iOS-only wording;
  - Pass+ purchase hang;
  - Sign in with Apple build fix;
  - two more lost-context cases.

**Held back:**
- TikTok videos (parked, as you said).
- Apple-token revocation on account deletion. The account and all its data are deleted, but the Apple ID stays listed under "Sign in with Apple" in the player's iPhone settings until they remove it. Apple expects the token to be revoked. Building that needs your Apple Sign-in key on the server, so I didn't. Reviewers rarely check it, but it's a possible rejection.
- New level names and the map redesign (tasks not started; not needed for v1).
- Storing pixel art at 1x to save more iPad memory (a bigger change; the current fix is enough).

**Things to know before you submit:**
- The icon's bird shape looks a bit like the old Twitter bird. It's probably fine, but it's a judgment call.
- Drift Pass+ gives gameplay items, not just cosmetics. The listing text says so honestly.
- Age rating: answer the loot-box / random-reward question "Yes" (Lucky Spin and pods).
- Heroes based on real people (friends or family) need their OK.
- `UIRequiresFullScreen` is deprecated in the newest iOS SDK. You may see a warning; it won't stop the build.
- This is the first real-device build, because Codemagic has never built it. If the iOS compile fails, send me the Codemagic log.

## 3. What to do in the morning, in order

### A. Supabase (dashboard → SQL Editor, ~10 min)
1. Open `glydrift/supabase/cleanup/20261108_remove_ci_test_scores.sql`, paste it in and click **Run**.
2. **Database → Extensions** → search `pg_cron` → **Enable**. Then paste and run
   `glydrift/supabase/migrations/20261109000001_all_mighty.sql`.
3. Paste and run `glydrift/supabase/migrations/20261113000001_delete_account_everything.sql`.
4. **Authentication → Providers → Apple → Client IDs**: add `com.glydrift.game`, then **Save**.
5. **Authentication → URL Configuration → Redirect URLs**: add `capacitor://localhost`.
6. **Edge Functions → Secrets**: add `APPSTORE_BUNDLE_ID` = `com.glydrift.game`.
7. Optional: run `glydrift/supabase/queries/ipad_crashes.sql` (read-only) and send me the result.

### B. Connect Codemagic (~20 min; full detail in `glydrift/CODEMAGIC_SETUP.md`)
1. developer.apple.com → **Identifiers** → **+** → App ID `com.glydrift.game`. Tick **Sign In with Apple** → **Register** (setup step 1).
2. appstoreconnect.apple.com → **Apps → + → New App**: iOS, name `Glydrift`, bundle `com.glydrift.game`, SKU `glydrift` (step 2).
3. codemagic.io → **Sign up with GitHub** → allow `27eydes-blip/Cheats` → **Add application** → Cheats → **codemagic.yaml**. Copy the app ID from the address bar (step 3).
4. App Store Connect → **Users and Access → Integrations → App Store Connect API → Generate API Key** (name `Codemagic`, access App Manager). Download the `.p8`. In Codemagic → **Team integrations → Developer Portal**: name it exactly `Glydrift App Store Connect`, then add the Issuer ID, Key ID and `.p8` (step 4).
5. Code signing key: follow step 5 to make the key. Then add the variable `CERTIFICATE_PRIVATE_KEY` in group `glydrift_signing`.
6. Codemagic → **Integrations → Codemagic API → Show** → copy the token. In GitHub → **Cheats → Settings → Secrets and variables → Actions**:
   - **Secrets** → **New repository secret** `CODEMAGIC_API_TOKEN`, with the token as the value.
   - **Variables** → **New repository variable** `CODEMAGIC_APP_ID`, with the app ID from step 3.
7. GitHub → **Actions → Glydrift iOS release** → the latest run on `release/appstore-v1` → **Re-run all jobs**. It uses the already-passed tests and starts the Codemagic build (10–15 min, then Apple processes it for 5–30 min).

### C. Apple setup and a real-device check
1. App Store Connect → **Business → Agreements**: accept **Paid Apps** and fill in tax and bank details. Without this, the purchase can't be made.
2. **Apps → Glydrift → Monetization → In-App Purchases → +**:
   - Type: Non-Consumable. Product ID `com.glydrift.game.driftpassplus.s1`. Price $3.99.
   - Add a display name and description from `APP_STORE_TEXT.md`.
   - Add a review screenshot of the Drift Pass+ screen.
3. **Users and Access → Integrations → In-App Purchase → Generate**. Put the key in the Supabase `verify-purchase` function secrets. Paste it in the dashboard; never in chat or the repo.
4. **Users and Access → Sandbox → Testers → +**: create a sandbox tester.
5. **TestFlight**: add yourself as an internal tester and install the build on an iPhone and an iPad. Check:
   - Sound plays after the first tap.
   - Sign-up works with email and with Apple.
   - Buy Pass+ with the sandbox tester, delete the app, reinstall it, then tap **Restore Purchases**.
   - Play past 20,000 on the iPad.
   - Settings → Delete my account.
6. Create the demo account (`docs/APP_STORE_REVIEW.md` → "The demo account"). Fill it into `APP_STORE_TEXT.md` line 150, or straight into App Store Connect.

### D. The listing (Apps → Glydrift → version 1.0.0)
1. **Screenshots**: upload `glydrift/appstore/screenshots/iphone-6.9/01–05` and `ipad-13/01–05` in order. Optional: the preview video.
2. Copy from `glydrift/appstore/APP_STORE_TEXT.md` → Listing: promotional text, description, keywords, subtitle.
3. Support URL `https://glydrift.com/support`, Marketing URL (optional) `https://glydrift.com`. Under **App Privacy**, add the Privacy Policy URL `https://glydrift.com/privacy`.
4. **App Privacy**: answer as in `APP_STORE_TEXT.md` → "App Privacy".
5. **Age rating**: answer as in `APP_STORE_TEXT.md` → "Age rating questionnaire".
6. **Copyright** `2026 Sam Eyde III`. Category: **Games → Arcade**. Price: **Free**.
7. **App Review Information**: your name, phone and email, the demo account, and the notes from `APP_STORE_TEXT.md` → "App Review Notes".
8. **Build**: pick the TestFlight build (1.0.0, build 101 or higher). Under **In-App Purchases**, add Drift Pass+.
9. **Add for Review → Submit**. Review usually takes 1–2 days.
