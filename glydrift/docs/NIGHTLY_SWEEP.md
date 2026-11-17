# Nightly bug sweep

Scripted checks of the live game every night. No AI, no Claude usage, no auto-fixing, and it never
publishes anything.

## When

Every night at **08:00 UTC** (3 AM Detroit in winter, 4 AM in summer), started by
`.github/workflows/glydrift-nightly-trigger.yml`. That file must be on `main`: GitHub only runs
schedules from the default branch. The checks themselves are the nightly mode of
`.github/workflows/glydrift.yml`, run from the branch in the repository variable
`GLYDRIFT_NIGHTLY_REF` (default `ci/nightly-sweep`).

## What it checks

| Check | Where | Fails on |
| --- | --- | --- |
| Full test suite | Chromium, Firefox, WebKit × all 7 device profiles | any failing test |
| 10-minute soak | each browser × 10 profiles (7 + the 3 iPhones sideways) | console error, page crash, WebGL context loss, crash report, memory growth, frame spikes |
| Live site | glydrift.com release build in WebKit and Chromium | console errors, failed loads |
| Site links | `/`, `/privacy`, `/support`, `/links/`, every link and file on them, the manifest's icons | any 404 or error from glydrift.com; a 404 from another site |
| Crash digest (optional) | last 24 h of `crash_reports`, read-only | never fails; only reports |

The soak (`tests/e2e/nightly-soak.spec.js`) loops: a god-mode run (every other lap a long one through
every realm and dimension), three deaths and RETRYs, a hero swap, the Shop, home. Its limits:

- Game-logic frame over 1 s (`SOAK_SPIKE_MS`). Measured: about 17 ms.
- Drawn frame over 20 s (`SOAK_DRAW_SPIKE_MS`). CI draws without a graphics card, so drawn frames
  take 1 to 13 s there.
- Memory on the home screen growing between the first and last third of the laps: more than 40 MB
  of JS heap (Chromium), 120 textures or 300 display objects.

## Results

- **All green:** nothing happens.
- **Any failure:** one GitHub issue labelled `nightly-bug`, titled with the date. It lists each
  failing test with its browser, device and error, and links the run, whose artifacts hold the
  screenshots, traces and soak reports for 14 days. If one is already open, the night adds a comment
  instead. The next green night closes it.

## By hand

- **Actions → "Glydrift nightly bug sweep (trigger)" → Run workflow** (once the trigger is on main), or
- **Actions → "Glydrift tests" → Run workflow**: pick the branch, tick **nightly**.
- From a terminal: `gh workflow run glydrift.yml --ref ci/nightly-sweep -f nightly=true`.

## Turn it off

Actions → "Glydrift nightly bug sweep (trigger)" → **…** → **Disable workflow**. Re-enable it the same
way, or delete the trigger file from main to remove it for good.

## Crash digest (optional)

1. Run `supabase/admin/nightly_readonly_role.sql` in the Supabase SQL Editor, with your own password
   typed into it there. It creates a role that can only read `crash_reports`.
2. Add the repository secret `GLYDRIFT_READONLY_DB_URL` (the format is in that file).

Without the secret the step is skipped quietly. Never use the service_role key.
