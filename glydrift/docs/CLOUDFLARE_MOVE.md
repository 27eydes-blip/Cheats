# Moving Glydrift to glydrift.com (Cloudflare Pages)

Every step works in Safari on a phone. Never paste your Cloudflare token into a chat; it only goes into GitHub's secret box (step 2).

## What's already done (code)

- **Build:** the game builds for `https://glydrift.com/` (Vite base `/`).
- **Deploys:** the CI job "Publish to glydrift.com" uploads the game with Wrangler. It runs only after Chromium, Firefox and WebKit have all passed. It deploys on pushes to the release branch, or when started by hand. It skips quietly until the two secrets below exist.
- **Guest notice:** the old address shows a one-time "WE'RE MOVING · glydrift.com" pop-up asking guests to create an account. It appears only when accounts are open, and never to signed-in players.
- **Redirect, ready but not on yet:** `scripts/redirect-gh-pages.sh` turns the old address into a redirect to glydrift.com. Run it only after glydrift.com is live and tested, and after guests have had time to see the notice.

## 1. Find your Cloudflare Account ID

1. In Safari, go to **dash.cloudflare.com** and log in.
2. Tap **glydrift.com** in your list of domains.
3. On its **Overview** page, scroll all the way down. In the **API** box you'll see **Account ID**, a long mix of letters and numbers. Tap **Click to copy**.

(The Account ID is not a password. It only says which Cloudflare account to use.)

## 2. Add the two GitHub secrets

GitHub's phone app can't do this, so use Safari.

1. Go to **github.com/27eydes-blip/Cheats** and log in.
2. If you don't see a **Settings** tab, tap **aA** in Safari's address bar, then **Request Desktop Website**.
3. Tap **Settings**. This is the repository's settings, in the row of tabs, not your profile settings.
4. In the left menu, tap **Secrets and variables**, then **Actions**.
5. Tap **New repository secret**.
   - **Name:** `CLOUDFLARE_ACCOUNT_ID`
   - **Secret:** paste the Account ID from step 1.
   - Tap **Add secret**.
6. Tap **New repository secret** again.
   - **Name:** `CLOUDFLARE_API_TOKEN`
   - **Secret:** paste your saved Cloudflare API token.
   - Tap **Add secret**.

The token needs the permission **Account → Cloudflare Pages → Edit**. If you made it from Cloudflare's "Edit Cloudflare Workers" template, it already has it.

Then tell Claude "secrets added". The deploy runs again, after all tests pass, and creates the Pages project **glydrift**.

## 3. Connect glydrift.com to the Pages project

Do this after step 2's deploy has finished.

1. At **dash.cloudflare.com**, open the menu (☰) and tap **Workers & Pages**.
2. Tap the project **glydrift**.
3. Tap the **Custom domains** tab.
4. Tap **Set up a custom domain**.
5. Type `glydrift.com` and tap **Continue**.
6. Tap **Activate domain**. Cloudflare adds the DNS record for you, because your nameservers are already on Cloudflare.
7. Wait until it shows **Active**. This usually takes a few minutes.
8. Repeat steps 4–7 with `www.glydrift.com`.

## 4. Make www.glydrift.com go to glydrift.com

1. At **dash.cloudflare.com**, tap **glydrift.com**.
2. Open the menu (☰) and tap **Rules**, then **Overview**.
3. Tap **Create rule**, then **Redirect Rule**.
4. Choose the template **Redirect from WWW to Root**.
5. Leave the settings as they are. It's a 301 redirect, and it keeps the rest of the address.
6. Tap **Deploy**.

## 5. Supabase (login, account emails, Sign in with Apple)

1. Go to **supabase.com/dashboard** and open the Glydrift project.
2. In the left menu (☰), tap **Authentication**, then **URL Configuration**.
3. **Site URL:** change it to `https://glydrift.com` and tap **Save**.
4. **Redirect URLs:** tap **Add URL** and add each of these:
   - `https://glydrift.com/**`
   - `https://www.glydrift.com/**`
5. Keep `https://27eydes-blip.github.io/Cheats/glydrift/**` in the list for now. Emails already sent still point there, and the redirect passes their sign-in tokens on to glydrift.com. Remove it a few weeks after the switch.
6. Tap **Save**.

**Sign in with Apple** needs no change. The iPhone app signs in with Apple's token directly, not with a web redirect, and its Client ID stays `com.glydrift.game`.

These are settings only; nothing about the database or keys changes.

## 6. The switch (later)

Once glydrift.com is live and its tests pass, and guests have had some days to see the notice, tell Claude "do the switch". Claude runs `scripts/redirect-gh-pages.sh`, and the old link starts sending everyone to glydrift.com. Anything after `?` or `#` in the link is kept.
