# Security audit: 2026-11-05

© 2026 Sam Eyde III. All rights reserved.

## 1. Secrets in the repo and its git history

**What was scanned:** every added line in all **910 commits** on **all 34 branches** of
`27eydes-blip/Cheats` (including `gh-pages`), plus every file name ever committed. Patterns
checked:
- Supabase secret / `service_role` keys, and JWTs (each one decoded to read its role)
- private keys (`BEGIN … PRIVATE KEY`) and `.p8` / `.pem` / `.key` / `.env` files
- GitHub, AWS, Google, Stripe, Slack and OpenAI/Anthropic tokens
- database URLs with passwords
- `password=` / `secret=` / `token=` / `api_key=` assignments

**Result: no secrets found. Nothing needs rotating.**

| Found | Verdict |
|---|---|
| `sb_publishable_zZB05fE…` (`src/config.js`, `scripts/test-leaderboard-rls.mjs`, every built `assets/index-*.js` on `gh-pages`) | The Supabase **publishable** key. It's meant to be public; Row Level Security protects the data. Only one key was ever used. |
| The word `service_role` in `README.md`, `SEASONS_ADMIN.md`, `src/config.js` and `scripts/test-leaderboard-rls.mjs` | Comments warning *not* to add one. No key. |
| `SUPABASE_SERVICE_ROLE_KEY` in `supabase/functions/*` | Read with `Deno.env.get` at runtime on Supabase's servers. Never stored in the repo. |
| `-----BEGIN RSA PRIVATE KEY-----` in `CODEMAGIC_SETUP.md` | Instruction text describing what to paste into Codemagic. No key. |
| `password:` / `token:` / `secret =` in `apps/extension/**/__tests__` and `evals/browser/lib/server.mjs` | Obviously fake test fixtures in Tencent's BrowserSkill code (not Glydrift). |

The commit-only scan doesn't look inside binary files or inside merge-conflict resolutions.
Neither is a realistic place for a key in this repo.

## 2. Is everything that matters enforced on the server?

A cheater has the public Supabase URL and the publishable key, and can call the database
directly. Ownership was already enforced by Row Level Security: nobody can edit someone
else's rows, write purchases, or read another player's cloud save. The review found the
following gaps. Everything marked ✅ is fixed on this branch and tested against a real
PostgreSQL (`npm run test:server`, 35 attack tests, also run in CI).

| # | Gap | Fix |
|---|---|---|
| L1 | The plausibility check scaled with a client-sent run time that had **no limit**. A run time of a billion milliseconds "justified" a 2,000,000 score. | ✅ Run time is capped at 2 h. Score and distance must still fit the run time. |
| L2 | Any update that kept the score could change `created_at`, so a row could be **future-dated** to stay on "Today" forever. It could also change `level`, moving a row to another board. | ✅ The server sets `created_at` and never lets a row change owner or board. |
| L4 | Name rules (3–12 letters/numbers, word filter) ran **only in the game**. | ✅ The same rules and word list now run on the server too. Tested on 3,647 names: the server never rejects a name the game allows. |
| L5 | Any board name was accepted, including made-up boards and future daily challenges. | ✅ Only `endless`, `endless-distance` and `daily-N` within ±1 day of today. `test-…` boards stay open for the RLS test script. |
| L6 | Anyone could show a paid **Drift Pass+ hero** on the public board without buying it. | ✅ Unbought Pass+ heroes show as Volt. The list of paid items is in `glydrift_paid_items`; add each new season's heroes and titles there. |
| L7 | A `p_` title needed *any* purchase, not that season's. | ✅ It needs that title's own season. |
| P1 | **TestFlight / Sandbox** purchases (free) counted as real ones, including public paid flair. | ✅ Sandbox purchases still unlock the game, because App Review needs that, but never public paid extras. Setting the secret `ALLOW_SANDBOX=false` refuses them completely. |
| P2 | **Refunds** were noticed only when the same purchase was verified again. | ✅ New Edge Function `appstore-notifications`. When Apple sends a notification, the function asks Apple directly (the notification itself isn't trusted) and on a refund revokes the purchase and removes its paid hero and title from the board. **You** point App Store Connect → App Store Server Notifications (V2) at it. |
| P3 | A purchase without the game's account token could be claimed by a second account through its original transaction id. | ✅ A purchase belongs to one account, checked by both its id and its original id. |
| P4 | Two requests at once could hand one purchase to the second account. | ✅ Insert-only and never overwrite, then confirm the owner. |

**Still open (your decision):**

| # | What | Why it isn't fixed here |
|---|---|---|
| L1+ | A patient cheater can still post a *believable* fake run (for example 30 minutes with a matching score). | Proving a run is real means re-simulating it on the server from a seed plus an input log. That's a big project and would change the game. For now: check the top of each board now and then, and delete fakes in the Supabase table editor. |
| L3 | Anyone can create unlimited anonymous accounts. | Turn on **CAPTCHA** for anonymous sign-ins (Supabase → Authentication → Attack Protection) and tighten the Auth rate limits. The game would need a small change to show the CAPTCHA, so that's left to you. |
| P5 | Drift Pass+ *cosmetics* unlock in the game from a locally saved flag. Someone editing their own browser storage can unlock them **for themselves**. | That's normal for a client game. Everything other players see, and every real entitlement, is decided by the server (see above). Restore and cross-device sync read only the server's `purchases` table. |
| C1 | Cloud saves accept any content from their owner (up to 1 MB). | It's only that player's own progress. Nothing on the server or seen by other players trusts it. |

## 3. How to apply the server fixes

```bash
supabase db push          # or paste supabase/migrations/20261105000001_server_checks.sql into the SQL editor
supabase functions deploy verify-purchase
supabase functions deploy appstore-notifications --no-verify-jwt
```

Run `npm run test:rls` afterwards. It checks the live project's row rules using test boards only.
