# Glydrift: project instructions

These are the owner's standing rules. They apply to every Claude session on this project,
whoever runs it.

## Credit (never break)
- Never remove or hide the Sam Eyde III creator credit or copyright line.
  It appears on the home screen ("Created by Sam Eyde III"), in Settings → CREDITS
  ("Created by Sam Eyde III, Founder & CEO" and "© 2026 Sam Eyde III. All rights reserved."),
  on the loading screen ("A Sam Eyde III game"), in the website footer, README and LICENSE.
  The text lives in src/legal.js; tests/e2e/credit.spec.js fails the build if any of it goes
  missing. Redesigns, cleanups and polish passes must keep it, readable, on every screen size.
- Use exactly "Sam Eyde III".

## Secrets and accounts
- Never paste, commit or ask for secret keys (Supabase service_role key, Apple keys, Cloudflare
  or Codemagic tokens). The app only ever uses the public Supabase anon key.
- Don't change the Supabase keys or database setup. Database changes are delivered as SQL files
  in supabase/migrations or supabase/cleanup plus written instructions; the owner runs them.
  Never run database writes yourself.

## Branches, tests and deploys
- Never commit to `main`. Work on your own branch (one per task).
- `claude/glydrift-arcade-game-7hznpc` is the live branch: a push there publishes glydrift.com
  (Cloudflare Pages) once CI passes. Only merge into it what the owner has approved, and only a
  tree that passed the full test lane.
- Nothing merges or deploys unless CI passes on Chromium, Firefox and WebKit. Put `[full]` in the
  commit message to run the full lane; use `[skip ci]` only for changes with no game code (docs,
  marketing files).
- The Abyss double-beam test (tests/e2e/abyss-crash.spec.js) must pass on all three browsers
  before every deploy.
- `release/appstore-v1` (and `release/**`) start the Codemagic iOS → TestFlight build after the
  tests pass.
- Don't open pull requests unless asked.

## Working on the code
- Setup: `cd glydrift && npm ci`. Dev server: `npm run dev`. Tests: `npm run build:test`, then
  `npx playwright test --project=chromium-iphone-std`. Locally only Chromium is installed; CI runs
  all three. Rebuild `dist-test` after every code change, because the tests run against it.
- Don't run the "release build loads" test locally.
- Don't touch /marketing unless the task is about marketing.
- Give times to the owner in UTC+7.

## Docs worth reading first
README.md, APPSTORE_READY.md, APP_STORE_CHECKLIST.md, CODEMAGIC_SETUP.md, docs/ and
docs/TEAM_ONBOARDING.md.
