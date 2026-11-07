# Glydrift on the App Store with Codemagic (no Mac needed)

Codemagic builds the iOS app on its Macs, signs it, and uploads it to App Store Connect /
TestFlight. You only need a web browser, plus a terminal for one command in step 4
(Windows PowerShell works).

## How a release works (once everything below is set up)

```
you push to "release"
   └─► GitHub Actions: "Glydrift tests"            (all 3 browsers × 7 devices, screenshots)
          └─ every test passed? ─ no ─► stops. Nothing is built.
                 │ yes
                 ▼
       GitHub Actions: "Glydrift iOS release"      (.github/workflows/glydrift-release.yml)
          └─► starts Codemagic "Glydrift iOS → TestFlight"   (codemagic.yaml)
                 1. checks the test result again (a build can't skip the tests)
                 2. npm ci → vite build → cap sync ios
                 3. build number = Codemagic's build counter (version stays 1.0.0)
                 4. automatic code signing
                 5. builds the .ipa → uploads to App Store Connect → TestFlight
```

The tests run on GitHub, where they're free, and not on Codemagic. They take 20–40 minutes,
and Codemagic's free plan includes a limited number of Mac minutes each month (500 when this
was written). Each release then uses only about 10–15 Codemagic minutes.

To release:

```bash
git push origin <the-branch-you-want-to-ship>:release
```

Then watch **GitHub → Actions → Glydrift iOS release**. When it finishes, it links to the Codemagic build.

**What's already set up in the repo:**

| | |
|---|---|
| App name | Glydrift |
| Bundle ID | `com.glydrift.game` (`capacitor.config.json`, Xcode project, `codemagic.yaml`) |
| Version | 1.0.0. The build number goes up automatically. |
| Orientation | Portrait only, on iPhone and iPad |
| Display | Full screen, no status bar, home indicator auto-hides, no iPad split screen (`UIRequiresFullScreen`) |
| Native code | The `GlydriftStore` StoreKit plugin (Drift Pass+) and Sign in with Apple are already wired in. You can skip the Xcode steps in `ios-plugin/README.md`. |
| Encryption | `ITSAppUsesNonExemptEncryption = NO`. The game only uses HTTPS, so App Store Connect won't ask about export compliance on every upload. |
| Icon / splash | Glydrift's own icon (from `scripts/icon/icon.html`) and a dark splash |

---

## Step 1: Register the bundle ID (Apple Developer website)

Do this first. Codemagic could create the ID itself, but not with Sign in with Apple turned
on, and the app needs it.

1. Go to <https://developer.apple.com/account> → **Certificates, IDs & Profiles** → **Identifiers** → **+**.
2. Choose **App IDs**, then **App**, then **Continue**.
3. Description: `Glydrift`. Bundle ID: **Explicit**, `com.glydrift.game`.
4. Under **Capabilities**, tick **Sign In with Apple**. In-App Purchase is already on for every app.
5. **Continue** → **Register**.

## Step 2: Create the app in App Store Connect

1. Go to <https://appstoreconnect.apple.com> → **Apps** → **+** → **New App**.
2. Platform: **iOS**. Name: `Glydrift`. If that name is taken, try something like "Glydrift: Neon Flyer"; the name under the icon stays Glydrift. Primary language: English (U.S.). Bundle ID: pick `com.glydrift.game`. SKU: `glydrift`. User access: Full Access.
3. **Create.**

## Step 3: Create a free Codemagic account and connect the GitHub repo

1. Go to <https://codemagic.io/signup> and choose **Sign up with GitHub**. The free plan is
   enough; no card is needed.
2. When GitHub asks, let the **Codemagic GitHub App** access `27eydes-blip/Cheats`. You can
   limit it to only this repository.
3. In Codemagic: **Add application** → **GitHub** → choose **Cheats** → project type
   **Ionic Capacitor App** (or "Other"; the type doesn't matter because `codemagic.yaml`
   controls the build) → **Finish**.
4. On the app's page, choose **codemagic.yaml** as the configuration (not the Workflow Editor).
   Codemagic reads `codemagic.yaml` from the root of the repository. If it says the file isn't
   found, pick the `release` branch, or any branch that has the file, in the branch selector.
5. Write down the **app ID**: it's the long code in the browser address bar,
   `https://codemagic.io/app/<APP_ID>/…`. You need it in step 6.

Codemagic shouldn't start builds on its own. `codemagic.yaml` has no `triggering:`
section, and GitHub starts each build after the tests pass. If Codemagic offers to set up
automatic build triggers or a webhook, leave them off.

## Step 4: App Store Connect API key → Codemagic

This key lets Codemagic upload builds and manage signing for you.

**In App Store Connect:**
1. **Users and Access** → **Integrations** tab → **App Store Connect API** → **Team Keys**.
   The first time, click **Request Access** and accept.
2. Click **Generate API Key** (or **+**). Name: `Codemagic`. Access: **App Manager**.
3. Copy the **Issuer ID** (above the table) and the key's **Key ID**.
4. **Download API Key** to get the `AuthKey_XXXXXXXXXX.p8` file. Apple lets you download it
   **only once**, so keep it somewhere safe and never commit it to git.

**In Codemagic:**
1. **Team settings** (or **User settings** on a personal account) → **Team integrations** →
   **Developer Portal** → **Connect** / **Manage keys** → **Add key**.
2. **App Store Connect API key name:** enter exactly `Glydrift App Store Connect`.
   `codemagic.yaml` looks the key up by this name.
3. Paste the **Issuer ID** and **Key ID**, upload the `.p8` file, then **Save**.

## Step 5: Let Codemagic handle code signing automatically

On every build, `codemagic.yaml` runs
`app-store-connect fetch-signing-files com.glydrift.game --type IOS_APP_STORE --create`.
The first time, this creates the **Apple Distribution certificate** and the **App Store
provisioning profile** in your developer account. After that it reuses them, and it makes a
new profile if the old one expires. You don't need Xcode or Keychain.

Codemagic needs one secret from you: a private key that the certificate is made from. It has
to stay the same between builds.

1. Make the key. On **Windows**, open PowerShell. On **Linux** or **ChromeOS**, open a terminal.
   ```bash
   ssh-keygen -t rsa -b 2048 -m PEM -f glydrift_cert_key -q -N ""
   ```
   This creates `glydrift_cert_key`, the private key, and `glydrift_cert_key.pub`, which you can delete.
2. In Codemagic, open the Glydrift app → **Environment variables** tab → **Add variable**:
   - Name: `CERTIFICATE_PRIVATE_KEY`
   - Value: paste the **whole** content of `glydrift_cert_key`, from `-----BEGIN RSA PRIVATE KEY-----` to `-----END RSA PRIVATE KEY-----`
   - Group: type `glydrift_signing` and create it
   - Tick **Secret** → **Add**
3. Keep `glydrift_cert_key` in a password manager. If it's lost, revoke the certificate in the
   developer portal and make a new key. Never commit it.

Apple allows only 2–3 distribution certificates per account. If the build says the limit is
reached, revoke an old, unused one under **Certificates** in the developer portal.

## Step 6: Let GitHub start Codemagic after the tests pass

1. In Codemagic: **Team settings** (or **User settings**) → **Integrations** → **Codemagic API** → **Show** → copy the **API token**.
2. In GitHub: **27eydes-blip/Cheats** → **Settings** → **Secrets and variables** → **Actions**:
   - **Secrets** tab → **New repository secret**: name `CODEMAGIC_API_TOKEN`, value: the token.
   - **Variables** tab → **New repository variable**: name `CODEMAGIC_APP_ID`, value: the app ID from step 3.

## Step 7: First release

```bash
git push origin <the-branch-to-ship>:release
```

1. **GitHub → Actions → Glydrift tests** runs the tests for that commit. If the commit was
   already tested on another branch, that result counts.
2. **Glydrift iOS release** waits for the tests, then prints the link to the Codemagic build.
3. Codemagic builds and uploads in about 10–15 minutes. Apple then takes 5–30 minutes to
   process the build. It then shows up in **App Store Connect → Glydrift → TestFlight**.
4. Install **TestFlight** on your iPhone and add yourself as an internal tester (see the
   checklist below).

Each later push to `release` makes a new TestFlight build: 1.0.0 (2), 1.0.0 (3), and so on.
When you want version 1.0.1, change `MARKETING_VERSION` in `ios/App/App.xcodeproj/project.pbxproj`.
It appears twice; change both.

### If something goes wrong

| Message | Fix |
|---|---|
| GitHub: *Codemagic isn't connected yet* | Step 6 isn't done, or the secret or variable name has a typo. |
| GitHub: *no test run found for this commit* | Tests only run when a push changes files under `glydrift/`. Push a commit that touches `glydrift/` to `release`. |
| GitHub: *Glydrift tests did not pass* | Working as intended. Fix the failing test, then push again. |
| Codemagic: *App Store Connect API key … not found* | The key's name in Codemagic must be exactly `Glydrift App Store Connect` (step 4). |
| Codemagic: *Variable CERTIFICATE_PRIVATE_KEY … not set* | Step 5: the variable must be in the group named `glydrift_signing`. |
| Codemagic: provisioning profile doesn't include *com.apple.developer.applesignin* | Sign In with Apple isn't ticked on the identifier (step 1). Tick it, delete the old Glydrift profile under **Profiles**, and build again. |
| Codemagic: *release moved on* | A newer commit reached `release` while this one was waiting. The newer commit's own run builds it. |
| Upload: *bundle version must be higher* | Something else uploaded with a higher build number. In Codemagic, start one build by hand per number you need to skip, or change the build-number step to a fixed offset, for example `$((BUILD_NUMBER + 100))`. |

---

## Moving Glydrift to its own repository later

If `glydrift/` becomes the root of a new repo, for example `27eydes-blip/Glydrift`:

1. **`codemagic.yaml`:** move it into the new repo's root. Delete the line
   `working_directory: glydrift`. Paths like `ios/App/App.xcodeproj`, `build/ios/ipa/*.ipa`
   and `scripts/release/…` are already relative to the game folder, so they keep working.
2. **`.github/workflows/glydrift-release.yml`** and **`.github/workflows/glydrift.yml`:**
   move both into the new repo's `.github/workflows/`.
   - In `glydrift.yml`, remove `defaults.run.working-directory: glydrift` and the `paths:`
     filters. Change `cache-dependency-path` to `package-lock.json` and the artifact paths
     `glydrift/playwright-report` → `playwright-report`. In the baselines job, change
     `-C glydrift` / `glydrift/tests/...` to the root paths.
   - In `glydrift-release.yml`, change `bash glydrift/scripts/release/require-green-tests.sh`
     to `bash scripts/release/require-green-tests.sh`.
3. **`scripts/release/require-green-tests.sh`:** change the default `GLYDRIFT_REPO` from
   `27eydes-blip/Cheats` to the new repo. The GitHub workflow already passes its own repo name,
   but Codemagic uses the default.
4. **Codemagic:** **Add application** for the new repo, set `CERTIFICATE_PRIVATE_KEY` in a
   `glydrift_signing` group again, and update `CODEMAGIC_APP_ID` in the new repo's GitHub
   settings. The API key integration (step 4) is team-wide and stays as it is. So do the
   certificate and profile in your Apple account, as long as you reuse the same private key.
5. **GitHub:** add `CODEMAGIC_API_TOKEN` and `CODEMAGIC_APP_ID` to the new repo, and give the
   Codemagic GitHub App access to it.
6. **GitHub Pages:** `scripts/deploy-gh-pages.sh` and the web URL
   `https://27eydes-blip.github.io/Cheats/glydrift/` change with the move. That URL is in
   `src/online/account.js` as the Sign in with Apple redirect, and in the Supabase redirect
   URLs. Update them if you also move the web version.

Nothing in the iOS project (`ios/`) or `capacitor.config.json` depends on being inside Cheats.
