# Making Glydrift private: what breaks, the options, and the safe order

© 2026 Sam Eyde III. All rights reserved.

## First: the Cheats repo can't simply be switched to private

`27eydes-blip/Cheats` is a **fork** of `Tencent/BrowserSkill`. GitHub doesn't let you make a
fork of a public repository private, so the "Change visibility" button won't offer it. There
are two ways around that:

1. **Recommended: give Glydrift its own private repo, `27eydes-blip/glydrift`,** with its full
   history (part 4 below), and keep a private, untouched copy of the whole Cheats repo as
   evidence. Then delete the public Cheats repo, or ask GitHub to detach it (option 2).
2. Ask GitHub Support to detach Cheats from the fork network
   (<https://support.github.com> → "Detach fork"). Afterwards it's a normal repo you can make
   private. Glydrift would still share a repo with Tencent's code and the other games, so
   option 1 is cleaner either way.

Three limits to keep in mind:
- **A private repo hides the source code and history, not the game itself.** Anyone who plays
  the web version downloads the built (minified) JavaScript, just as with any web game. The
  LICENSE and the © notices are what protect that legally. If you're in the US, registering the
  copyright (copyright.gov, about $45–65) gives you the strongest proof and lets you sue for
  statutory damages.
- **Copies made while it was public stay out there.** The repo has 0 forks and 0 stars, which
  is good. Earlier clones, caches and code-archive crawlers can't be recalled.
- **The git author on the Glydrift commits is "Claude"**, because Claude Code sessions made
  them. They were pushed from your account (`27eydes-blip`), and GitHub records that. Don't
  rewrite authorship: altered history is weaker evidence than history left as it was.

---

## What breaks when the code goes private (and what's already fixed on this branch)

| Thing | What happens | Status |
|---|---|---|
| **GitHub Pages** (`27eydes-blip.github.io/Cheats/glydrift/`) | On GitHub Free, Pages doesn't serve private repos. The site goes offline. If Cheats is deleted, it's gone either way. This also takes down **everything else on the Cheats site**: `cbb/`, `kadin-koza/`, `tandem/`, `2/`, `links/` and the landing page. | Choose option A or B below. Give the other games a new home too. |
| **Glydrift tests (CI)** | They still run, but a private repo pays for Actions minutes. One full run takes about **72 minutes** (Chromium 36, WebKit 18, Firefox 17, plus about 1). GitHub Free includes 2,000 minutes a month and Pro 3,000. The repo ran 54 test runs in its last 3 days, which would use up either plan in a few days. | ✅ Added a minute saver: set the repository variable `GLYDRIFT_CI_SAVER=true`. Pushes to ordinary branches then skip the suite. `main`, `release`, pull requests and manual runs still test everything. |
| **Release gate on GitHub** (`glydrift-release.yml`) | Reads test results with the workflow's own token. That keeps working in a private repo. | ✅ Nothing to do. |
| **Release gate in Codemagic** (`codemagic.yaml`) | Today it reads test results **without a token** (public repo). Private → GitHub answers 404 → every build would stop. | ✅ The gate now accepts a token and stops right away with a clear message if it's missing. **You add** `GH_ACTIONS_READ_TOKEN` (see the checklist). |
| **Gate loophole** | With jobs skipped, GitHub reports a run as "success" anyway. | ✅ The gate now requires each browser job and the server checks to have actually run and passed. |
| **Codemagic → repo access** | Codemagic clones through its GitHub App. | Give the Codemagic GitHub App access to the new private repo. |
| **Sign in with Apple (web)** and **Supabase email links** | Supabase only redirects to addresses on its allow-list. | Add the new game address in Supabase → Authentication → URL Configuration. |
| **Players' local progress** | Progress for players without an account is stored in the browser **per website address** (origin). Option A keeps the address `27eydes-blip.github.io`, so it's **kept**. Option B uses a new address (for example `glydrift.pages.dev`), so guests **start over**. Players with an account get it back from the cloud by signing in. | Option A avoids this. With option B, tell players to make an account first. |
| **The iOS app** | Doesn't depend on the website or the repo being public. | ✅ Nothing to do. |

---

## Option A: GitHub Pro (~$4/month) and keep GitHub Pages ✅ recommended

The game moves from `27eydes-blip.github.io/Cheats/glydrift/` to
**`27eydes-blip.github.io/glydrift/`**. It's the same website (origin), so **players keep their
saves**, the installed home-screen app keeps working through the redirect, and Supabase and
Apple stay on the same domain.

1. github.com → your avatar → **Settings → Billing and plans → Plans** → upgrade to **Pro**.
2. Create the private repo `glydrift` and move the code with its history (part 4 below).
3. In the new repo: **Settings → Pages** → Source: **Deploy from a branch** → `gh-pages` /
   `(root)`. On Pro, Pages works for private repos, and the *site* stays public. That's what
   you want: anyone can play, nobody can read the code.
4. **Settings → Secrets and variables → Actions → Variables**: `GLYDRIFT_PAGES_SUBDIR` = `.`.
   This publishes the game at the root of the new site instead of in a `glydrift/` folder.
5. Run **Actions → Glydrift tests → Run workflow** with **deploy** ticked. It publishes only if
   every test passes. Then open `https://27eydes-blip.github.io/glydrift/`.
6. Set up the old-link redirect (below).

## Option B: free host that works with private repos (Cloudflare Pages)

**Cloudflare Pages** is the best of the three for this game. The free plan has unlimited
bandwidth and allows commercial use, and the game sells Drift Pass+. Vercel's free Hobby plan
doesn't allow commercial use. Netlify's free plan caps bandwidth and build minutes.

The address becomes `https://glydrift.pages.dev/`, or your own domain. **Guests lose local
progress** (see the table above). Supabase stays exactly as it is, apart from the allowed URLs.

1. Make a free account at <https://dash.cloudflare.com/sign-up>.
2. **Workers & Pages → Create → Pages → Direct Upload** → name it `glydrift` → create it (upload
   nothing). GitHub Actions does the uploads after the tests pass. Don't connect the Git repo
   in Cloudflare, or Cloudflare would publish without waiting for the tests.
3. **My Profile → API Tokens → Create token → "Edit Cloudflare Workers"** template (or a custom
   token with **Account → Cloudflare Pages → Edit**). Copy it. Your **Account ID** is on the
   Workers & Pages overview page.
4. In the GitHub repo, under **Settings → Secrets and variables → Actions**:
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - Variables: `GLYDRIFT_WEB_HOST` = `cloudflare`
5. Run **Actions → Glydrift tests → Run workflow** with **deploy** ticked. The deploy job runs
   `scripts/deploy-cloudflare.sh` after every test passes.
6. Optional: **Custom domains** → add e.g. `play.glydrift.com`.
7. Supabase → Authentication → URL Configuration: set the Site URL to the new address and add
   it to the Redirect URLs.
8. Set up the old-link redirect, with `NEW` set to the Cloudflare address.

## Keeping the old link working

The redirect pages are ready in `hosting/old-link-redirect/`. They send
`…/Cheats/glydrift/…` and `…/Cheats/links/…` to the new address and keep `?…` and `#…`, so
shared daily-challenge links still work. Any other old address gets a plain "not found".

Once GitHub Pages stops serving Cheats, GitHub serves those paths from your **user site**
repository instead:

1. Create a **public** repo named exactly **`27eydes-blip.github.io`**. It contains only these
   redirect pages, no game code.
2. Copy everything in `hosting/old-link-redirect/` into it: `404.html`,
   `Cheats/glydrift/index.html` and `Cheats/links/index.html`.
3. With option B, change `NEW` (and the two links) in those files to the Cloudflare address.
4. **Settings → Pages** → deploy from `main` / `(root)`.
5. Only after Cheats' own Pages site is gone (deleted, or private on Free) do these pages take
   over `/Cheats/…`. Until then, nothing changes for players.

If you keep Cheats public for a while (for its other games), the redirect can live in its
`gh-pages` branch instead. Replace `glydrift/index.html` there with the redirect page.

---

## Part 4: moving Glydrift into its own private repo, with all its history

I tested this on a copy of the repo (2026-11-05). The result:
- **30 Glydrift branches kept**, and **160 commits** on the game's main line, all with their
  original dates.
- The first commit is "Add Glydrift: neon-cosmos one-tap arcade game", 2026-11-02 00:39:56 UTC.
- None of Tencent's code and none of the other projects came along.

`git filter-repo` gives the moved commits new commit IDs. That's why step 1 keeps an
**untouched private copy** with the original IDs as your proof. GitHub's records of your
original pushes and Actions runs stay with the Cheats repo until you delete it.

Run on any computer with git and Python (Windows, Linux or Mac):

```bash
pip install git-filter-repo

# 1. Evidence: an exact private copy of the whole Cheats repo (every branch, original commit IDs)
#    First create an EMPTY private repo on GitHub called cheats-archive (no README).
git clone --mirror https://github.com/27eydes-blip/Cheats.git cheats-archive.git
cd cheats-archive.git
git push --mirror https://github.com/27eydes-blip/cheats-archive.git
cd ..
git -C cheats-archive.git bundle create ../cheats-full-history-2026-11-05.bundle --all
#    Keep that .bundle file somewhere safe as well (a USB stick, a cloud drive): it's the
#    whole history in one file.

# 2. Glydrift on its own: only glydrift/ (moved to the root) and its workflow files
cp -r cheats-archive.git glydrift.git
cd glydrift.git
git filter-repo --path glydrift/ --path-rename glydrift/: \
  --path .github/workflows/glydrift.yml \
  --path .github/workflows/glydrift-release.yml \
  --path codemagic.yaml
#    First create an EMPTY private repo on GitHub called glydrift (no README), then:
git push --mirror https://github.com/27eydes-blip/glydrift.git
```

Then, in the new `glydrift` repo, on a branch:

1. **Make the game's main line the default branch.** Push `claude/glydrift-arcade-game-7hznpc`
   (after merging this branch) to `main`, then choose **Settings → General → Default branch → main**.
2. **Edit the files that still assume the `glydrift/` folder.** These are the edits listed at
   the end of `CODEMAGIC_SETUP.md`, under "Moving Glydrift to its own repository later":
   - `codemagic.yaml`: delete `working_directory: glydrift`. Set
     `GLYDRIFT_REPO: 27eydes-blip/glydrift`.
   - `.github/workflows/glydrift.yml`: remove `defaults.run.working-directory: glydrift` and
     the `paths:` filters. Change `cache-dependency-path` to `package-lock.json`. Remove the
     `glydrift/` prefix from the artifact and baseline paths.
   - `.github/workflows/glydrift-release.yml`: change `bash glydrift/scripts/release/…` to
     `bash scripts/release/…`.
   - `scripts/release/require-green-tests.sh`: change the default repo to `27eydes-blip/glydrift`.
   - `LICENSE`: remove the sentence about "the repository that holds this folder".
3. **Hosting:** follow option A (step 4 sets `GLYDRIFT_PAGES_SUBDIR=.`) or option B.
4. **Supabase:** add the new address to the allowed redirect URLs. With option B, also change
   the Site URL.
5. **Codemagic:** add the new repo as an app (see `CODEMAGIC_SETUP.md`, step 3). Copy the
   `glydrift_signing` group (`CERTIFICATE_PRIVATE_KEY`, plus `GH_ACTIONS_READ_TOKEN` for the new
   repo). Update `CODEMAGIC_APP_ID` in the new repo's GitHub variables, and set the
   `CODEMAGIC_API_TOKEN` secret.

---

## Checklist: making it private safely (in this order)

**Before anything goes private**
- [ ] Merge `release-setup`, then `protect-ip`, after the bug sweep is merged.
- [ ] Apply the new server rules to Supabase: `supabase db push`, or paste
      `supabase/migrations/20261105000001_server_checks.sql` into the SQL editor. Then deploy
      the functions:
      `supabase functions deploy verify-purchase` and
      `supabase functions deploy appstore-notifications --no-verify-jwt`.
- [ ] Choose **option A** (Pro, keeps saves, recommended) or **option B** (Cloudflare, free).
- [ ] Decide where the **other games** on the Cheats site (`cbb`, `kadin-koza`, `tandem`, `2`)
      will live: their own repos, or the `27eydes-blip.github.io` user site.

**Move**
- [ ] Create **empty private** repos `cheats-archive` and `glydrift`.
- [ ] Run part 4, steps 1–2. Check that `cheats-archive` shows every branch, and keep the `.bundle` file.
- [ ] In `glydrift`: set the default branch, make the path edits, then push. Check that
      **Actions → Glydrift tests** passes there.
- [ ] Set `GLYDRIFT_CI_SAVER=true` (Settings → Secrets and variables → Actions → Variables).

**Tokens (never in code)**
- [ ] GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained →
      Generate**:
      - Name: `codemagic-test-gate`. Repository access: **only `27eydes-blip/glydrift`**.
      - Permissions: **Actions: Read-only** (and Metadata: Read-only, which is automatic).
      - Expiry: 1 year. Put a reminder in your calendar.
- [ ] Codemagic → the Glydrift app → Environment variables → group `glydrift_signing` → add
      `GH_ACTIONS_READ_TOKEN` (tick **Secret**).
- [ ] The GitHub-side release workflow needs nothing: it uses its own built-in token.

**Go live at the new address**
- [ ] Option A or B, steps 1–5. The game is live at the new address and passes a quick play test.
- [ ] Supabase redirect URLs include the new address.
- [ ] Old-link redirect: the `27eydes-blip.github.io` repo is set up (it does nothing until step 3 below).

**Make the code private**
- [ ] Optional, as extra evidence: on Cheats, **Settings → General → Archive this repository**
      for a few days first. It becomes read-only, keeps every record, and gives you time to
      check the new setup.
- [ ] Delete the public Cheats repo (**Settings → Danger Zone → Delete**), or ask GitHub to
      detach it and then make it private. Deleting also removes its Pages site, so the
      `27eydes-blip.github.io` redirect takes over `/Cheats/glydrift/`.
- [ ] Open `https://27eydes-blip.github.io/Cheats/glydrift/` in a private window. It should
      land on the new address.
- [ ] Push a test commit to `release` in the new repo. Check that the tests run, the release
      workflow starts Codemagic, and Codemagic's test check passes with the token.
