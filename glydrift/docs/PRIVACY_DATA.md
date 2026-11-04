# Glydrift: data collected (for the privacy policy and App Store privacy labels)

**New in this release:** accounts, cloud save, titles, the distance leaderboard and Drift Pass+.

All of it is stored in Supabase (the backend), except payments, which Apple handles. None of it is used for tracking or advertising, and none of it is sold.

## New data

| Data | When | Why | Where | Linked to the player |
|---|---|---|---|---|
| **Email address** | Creating an account (optional) | Sign-in, password reset, account emails | Supabase Auth | Yes |
| **Password** | Creating an account | Sign-in. Stored only as a hash by Supabase Auth; nobody can read it | Supabase Auth | Yes |
| **Apple ID sign-in** (Apple's user ID; the email or Apple's private relay address) | Sign in with Apple (iOS, optional) | Sign-in | Supabase Auth | Yes |
| **Cloud save** (coins, shards, heroes, items and what's equipped, titles, XP and level, missions, achievements, login streak, Drift Pass progress, best scores and lifetime stats, username) | Signed-in players, after changes | Restore progress on any device | Supabase `player_saves` | Yes |
| **Purchase records** (App Store transaction ID, original transaction ID, product, season, purchase date, sandbox or production) | Buying or restoring Drift Pass+ | Unlock and restore the pass; prevent fraud | Supabase `purchases`; Apple | Yes |
| **Distance per run** (with each leaderboard entry) | Each personal best | The DISTANCE leaderboard; cheat checks | Supabase `scores` (public leaderboard) | Yes (username) |
| **Equipped title** (with each leaderboard entry) | Each personal best | Shown under your name on the leaderboard | Supabase `scores` (public leaderboard) | Yes (username) |

## Already collected before (unchanged)

- An anonymous account ID per device.
- Username.
- Leaderboard entries: score, hero, run time and date.

## Not collected

- **Payment details.** Apple processes the payment; we receive only the transaction record above.
- **Location, contacts, photos or advertising IDs.** None of these are collected.

## Technical data processed by the providers

Supabase (and Apple for purchases and Sign in with Apple) process IP addresses and request logs to run the service. The device stores a session token and the local save.

## Deleting data

**Settings → Account → Delete my account** permanently deletes all of the following, straight away:
- the account and login;
- the cloud save;
- the leaderboard entries;
- the purchase records.

The device's copy of the save is reset too.

Apple keeps its own record of App Store purchases under Apple's policy.

## App Store privacy label (suggested)

- **Contact Info → Email Address:** App Functionality; linked; not tracking.
- **Purchases → Purchase History:** App Functionality; linked; not tracking.
- **Identifiers → User ID:** App Functionality; linked; not tracking.
- **User Content → Other User Content (username, title):** App Functionality; linked; not tracking.
- **Usage Data → Product Interaction (scores and runs on the leaderboards):** App Functionality; linked; not tracking.
