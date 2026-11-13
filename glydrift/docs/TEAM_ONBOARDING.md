# Adding a team member to Glydrift (with their own Claude account)

Your employee uses **their own** Claude account and **their own** GitHub account. Never give them
your Claude or GitHub login, and never send keys or passwords in chat or email. Everything below
gives them their own access, which you can take away at any time.

---

## Part A: what YOU (the owner) do (~10 minutes)

### 1. Give them access to the code (GitHub)
1. Ask them for their **GitHub username** (they make a free account at github.com if they don't have one).
2. Go to **github.com/27eydes-blip/Cheats → Settings → Collaborators → Add people**.
3. Type their username and choose **Add to repository**. They get an email and must click **Accept**.

The Claude GitHub app is already installed on this repo (it's what my sessions use), so you
don't need to do anything else on GitHub.

**Important:** the repo's default branch, `main`, does **not** contain Glydrift. The game lives on
`claude/glydrift-arcade-game-7hznpc`. New Claude sessions start from the default branch, so pick
one of these:
- **Easiest:** make the live branch the default. Go to **Settings → General → Default branch →
  ⇄ (switch)** and choose `claude/glydrift-arcade-game-7hznpc`. This changes nothing about
  deploys.
- **Or** your employee starts every session with: "Check out branch
  claude/glydrift-arcade-game-7hznpc first, then make a new branch from it."

**Recommended:** stop anyone else from putting things live.
1. Go to **Settings → Rules → Rulesets → New branch ruleset**.
2. Name it `live and release`, and set Enforcement to **Active**.
3. Under **Target branches → Add target → Include by pattern**, add
   `claude/glydrift-arcade-game-7hznpc`, then add `release/**`.
4. Tick **Restrict updates** and **Restrict deletions**.
5. Under **Bypass list**, add yourself (**Repository admin**), then **Create**.

This way they can build and test anything on their own branches, but only you (or your Claude
sessions) can update glydrift.com or send a build to TestFlight. Your CI already refuses to
deploy anything that hasn't passed the tests on all three browsers.

### 2. Their Claude plan
They need a paid Claude plan that includes **Claude Code** (Pro or Max), on their own email.
Optional: if you want to pay for their seat and manage it, use a **Claude Team** plan
(claude.ai → Settings → Organization) and invite them by email.

### 3. Other services: only if their job needs them
Invite them as a **member** with their own login. Don't share yours:

| Service | When they need it | How to invite (smallest role) |
|---|---|---|
| Supabase (database) | Only if they run SQL or look at crash reports | supabase.com → your org → **Team → Invite**, role **Developer** (or **Read-only**) |
| Cloudflare (website) | Rarely; deploys happen automatically from GitHub | dash.cloudflare.com → **Manage Account → Members → Invite**, a read-only role |
| App Store Connect | Only for TestFlight testing or the listing | **Users and Access → +**, role **Developer** or **Marketing** (not Admin) |
| Codemagic | Only for iOS build problems | **Team settings → Team members → Invite** |
| TestFlight testing only | To try builds on their iPhone | App Store Connect → TestFlight → **Internal Testing → +** add them |

Most work (game features, bug fixes, tests, marketing) needs **only GitHub**.

---

## Part B: what YOUR EMPLOYEE does (~15 minutes)

### 1. Connect GitHub to Claude
1. Accept your GitHub invite (from the email, or at github.com/27eydes-blip/Cheats).
2. Sign in to **claude.ai** with their own account, open **claude.ai/code**.
3. Click **Connect GitHub** (or go to **claude.ai/connect-github**) and sign in with **their** GitHub.
   When GitHub asks which repositories, make sure **27eydes-blip/Cheats** is allowed.

### 2. Create their cloud environment (one time)
In claude.ai/code, open the environment menu → **Add environment** (or **New environment**):
- **Name:** `Glydrift`
- **Network access:** **Limited** (keep "Allow package managers" on), and add these allowed hosts:
  ```
  glydrift.com
  www.glydrift.com
  glydrift.pages.dev
  27eydes-blip.github.io
  cdjcvhywrbsdryagqxqg.supabase.co
  ```
  (The Supabase address is the game's public server. It's safe to list; no key goes here.)
- **Environment variables:** none needed.
- **Setup script** (optional; saves a minute every session):
  ```bash
  if [ -d Cheats/glydrift ]; then (cd Cheats/glydrift && npm ci); fi
  ```
- **Repositories:** add `27eydes-blip/Cheats`.

### 3. Start working
1. New session → repository **27eydes-blip/Cheats** → environment **Glydrift**.
2. Once it's on the game's branch, their Claude reads `glydrift/CLAUDE.md`. It holds all your rules (the
   Sam Eyde III credit, no secret keys, no database writes, tests on all three browsers before
   anything goes live, never commit to `main`).
3. A good first message:
   > Check out branch claude/glydrift-arcade-game-7hznpc (the game isn't on main). Read
   > glydrift/CLAUDE.md, glydrift/README.md and glydrift/APPSTORE_READY.md, then tell me how
   > the project is organised. Work on a new branch for each task, and never push to the live
   > branch.

### 4. How their work gets live
1. They (or their Claude) work on a branch, for example `feature/new-hero` or `fix/shop-button`.
2. They push with `[full]` in the commit message. GitHub Actions runs every test on Chromium,
   Firefox and WebKit.
3. When it's green, they tell you the branch name.
4. You check it (play it, or ask your Claude to review the branch), then merge it into the live
   branch yourself, or ask your Claude session to deploy it.

---

## Part C: what to tell them about the project
- **Game code:** `glydrift/src`. **Tests:** `glydrift/tests/e2e`. **iOS app:** `glydrift/ios`.
  **Database SQL:** `glydrift/supabase`. **Store listing and screenshots:** `glydrift/appstore`.
  **Marketing (TikToks, story ads, profile pictures):** `glydrift/marketing`.
- **Live branch:** `claude/glydrift-arcade-game-7hznpc` → glydrift.com.
- **App Store branch:** `release/appstore-v1` → Codemagic → TestFlight.
- **Status and to-do:** `glydrift/APPSTORE_READY.md` (App Store) and the reports in `glydrift/`.
- **Rules:** `glydrift/CLAUDE.md`. If something there blocks them, they ask you; they don't work around it.

## Removing access later
- GitHub: **Settings → Collaborators → Remove**. This cuts off their Claude too.
- Each other service: remove them from its members page.
