# Turning on Glydaway's accounts and world leaderboard

You need to do this once. It takes about 20 minutes. Everything here fits within free tiers.

## 1. Create a Supabase project just for Glydaway (free)
Use a **new** project, not Glydrift's. That keeps the two games' players, emails and settings apart. It also means "Delete my data" in Glydaway can never touch a Glydrift login.

1. Go to supabase.com, then **New project**. Name it `glydaway`, pick a region near your players, and save the database password somewhere safe (the game never needs it).
2. When it's ready, open the **SQL Editor**, paste in all of `glydaway/supabase/schema.sql` and press **Run**. You can run it again later; it's safe to repeat.

## 2. Sign-in settings (Authentication)
1. **Sign In / Providers**: turn on **Allow anonymous sign-ins**. Check that **Email** is enabled, and set **Confirm email** on.
2. **Emails, then templates**: the game asks players to type a **code**, so the templates must show it.
   - In **Magic Link**, **Confirm signup** and **Change Email Address**, include `{{ .Token }}`.
   - For example: *"Your Glydaway code is {{ .Token }}. It expires in 10 minutes."*
3. **SMTP Settings**: Supabase's built-in email is only for testing. It sends very few emails, only to your own team's addresses. For real players, connect a sending service.
   - Resend (3,000 emails a month free), Brevo or Amazon SES all work.
   - This is the one outside account you need. Pick one and tell me if you'd like help.
4. **Rate Limits**: the defaults are fine. You can lower "emails per hour" or "OTP verifications" if you see abuse.
5. **URL Configuration**: set the Site URL to `https://glydaway.com`.

## 3. Give the deploy the public address and key
In Supabase, go to **Project Settings, then API Keys**:
- Copy the **Project URL**.
- Copy the **publishable** key (it starts with `sb_publishable_`, or the legacy `anon` key).
- **Never** use the `secret` / `service_role` key. The deploy refuses it.

On GitHub, open the repository, then **Settings, then Secrets and variables, then Actions, then the Variables tab**. Add:
- `GLYDAWAY_SUPABASE_URL`: the Project URL, for example `https://abcd1234.supabase.co`
- `GLYDAWAY_SUPABASE_KEY`: the publishable key

These are *variables*, not secrets, because this key is public by design (it ends up in every player's browser). What protects the data is the database rules in `schema.sql`.

## 4. Deploy
Merge to `main` as usual. The workflow runs the tests, fills in the two values and publishes glydaway.com. Then check:
- The game asks for a name on its first launch.
- After a run, Leaderboard, then WORLD shows you.
- Settings, then Account, then Save my account emails you a code.

## Running it from your own computer
The page reads its server settings from `window.GLYDAWAY_CONFIG` if it's set, otherwise from the values the deploy fills in. Without either, the game runs fully offline, and the world tabs say so.
