# Glydrift: App Store readiness (19 Nov 2026)

This replaces the 13 Nov checklist, which stays unchanged on `release/appstore-v1`. That branch is
frozen at 13 Nov, so it doesn't have the Gleyde Technologies credits, the security headers, the
Apple sign-in revocation or the fixes below. **Ship the current game**: cut a new release branch
from the live branch (section 3, step A). The 13 Nov steps referred to below are in that branch's
copy of this file (`git show origin/release/appstore-v1:glydrift/APPSTORE_READY.md`).

🟢 done and tested · 🟡 done, with something to know or decide · 🔴 needs you

## 1. What's ready

| | Item | Status |
|---|---|---|
| 🟢 | Account deletion | Settings → ACCOUNT → DELETE MY ACCOUNT deletes everything on the server. |
| 🟢 | Sign in with Apple revoked on deletion (guideline 5.1.1(v)) | **New.** Apple players confirm on Apple's sheet; the `apple-revoke` server function revokes the token at Apple; closing the sheet keeps the account. If Apple can't be reached, the account is still deleted. Needs its keys (section 3, step B). |
| 🟢 | StoreKit only, Restore Purchases, server-verified Pass+ | Unchanged since v1. |
| 🟢 | User-generated names | Profanity filter, REPORT A NAME, BLOCK, "Hidden player". |
| 🟢 | Privacy policy (glydrift.com/privacy) | **Updated.** Names Gleyde Technologies, LLC; lists everything collected; Apple revocation; crash and name reports deleted with the account. |
| 🟢 | Privacy manifest (`PrivacyInfo.xcprivacy`) | **Updated.** Six data types (User ID, Email, Gameplay Content, Other User Content, Purchase History, Crash Data), all linked, none tracking; UserDefaults reason CA92.1. |
| 🟢 | Listing text (`appstore/APP_STORE_TEXT.md`) | **Updated.** 8 realms, the credits (Gleyde Technologies, LLC · Created by Sam Eyde III · Produced by Juwon Shon), the right counts, the real Pass+ route. Copyright `2026 Gleyde Technologies, LLC`. |
| 🟢 | Screenshots and preview (`appstore/`) | Checked: real gameplay, Heroes and Levels screens; no WASP LORD, no old credits, no test UI. |
| 🟢 | WASP LORD | Switched off: unreachable in the app; nothing advertises him. |
| 🟢 | Test switches | Compiled out of the release build (Codemagic runs `npm run build`). |
| 🟢 | iPhone details since v1 | The Gleyde About card blocks keys while open, closes under pop-ups, and its logo is a 44 pt tap target. |
| 🟢 | Game over screen | **Redesigned**: score first; a REWARDS card (coins, XP, spins counting up, level bar); one NEXT UP goal; a SPIN button when spins are waiting. |
| 🟡 | Season timing | Season 1 and its product `com.glydrift.game.driftpassplus.s1` end on **2 Dec 2026**. If review runs past that date, the app sells `…driftpassplus.s2`: create it in App Store Connect as well (section 3, step D), and update the review notes. |
| 🟡 | Age rating | Loot boxes: answer **Yes** (the paid Pass+ track contains 2 Mystery Pods). Simulated gambling: "None" is defensible (spins can't be bought and odds are shown); "Infrequent/Mild" is the cautious answer. |
| 🔴 | A real-device build | Codemagic has never built the app (section 3, step C). |

## 2. Superseded documents

`docs/APP_STORE_REVIEW.md` and `docs/PRIVACY_DATA.md` are older and disagree with the final answers
in places (each now says so at the top). Copy into App Store Connect from `appstore/APP_STORE_TEXT.md`
only.

## 3. What you need to do, in order

### A. Cut the release from today's game
Tell Claude to cut it, or do it yourself: create a branch named `release/appstore-1.0` from
`claude/glydrift-arcade-game-7hznpc` and push it. The "Glydrift iOS release" workflow runs the full
test suite on that exact commit, then starts the Codemagic build once Codemagic is connected (step C).

### B. Supabase (dashboard)
1. If not done yet: the 13 Nov steps A1–A6 (cleanup SQL, pg_cron + ALL MIGHTY, account deletion
   function, Apple client ID, `capacitor://localhost` redirect, `APPSTORE_BUNDLE_ID` secret).
2. **Deploy the new function:** `supabase functions deploy apple-revoke` (or dashboard → Edge
   Functions → Deploy a new function, pasting `supabase/functions/apple-revoke/index.ts`).
3. **Its secrets** (Edge Functions → Secrets; paste them in the dashboard, never in chat):
   - `APPLE_TEAM_ID` (developer.apple.com → Membership)
   - `APPLE_SIGNIN_KEY_ID` and `APPLE_SIGNIN_PRIVATE_KEY`: developer.apple.com → Keys → **+** →
     tick **Sign in with Apple** → Configure → App ID `com.glydrift.game` → Register; download the
     `.p8` and paste its contents. The key you made for Supabase's Apple provider works too.
   Until these are set, deletion still works; the Apple ID entry just isn't removed.

### C. Codemagic → TestFlight
Unchanged from the 13 Nov list, step B (`CODEMAGIC_SETUP.md`). Once it's connected, re-run the
"Glydrift iOS release" workflow on `release/appstore-1.0`.

### D. App Store Connect
1. The 13 Nov list, steps C and D: agreements, the Pass+ product, sandbox tester, TestFlight checks,
   demo account, listing, screenshots, App Privacy, age rating.
2. **Copyright:** `2026 Gleyde Technologies, LLC`. If the developer account is in your own name,
   the store shows you as the seller; to show the company instead, the account has to be an
   organization account (needs a D-U-N-S number).
3. **If review may run past 2 Dec:** also create the Non-Consumable `com.glydrift.game.driftpassplus.s2`
   ($3.99) and mention both products in the review notes.
4. **TestFlight, one extra check:** with a Sign in with Apple test account, delete the account and
   confirm Glydrift is gone from iPhone Settings → Apple ID → Sign in with Apple.
