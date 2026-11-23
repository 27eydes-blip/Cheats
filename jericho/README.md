# Jericho

A personal voice assistant that runs on your laptop. Open the page, tap **Start**, and say
"Jericho, turn on the kitchen lights".

```
 Browser (laptop or phone)               Node server (your laptop)
 ┌──────────────────────────┐            ┌─────────────────────────────────────┐
 │ Ears: Web Speech API     │  /api/ask  │ Brain: Claude API + tool loop       │
 │  wake word "Jericho"      ├───────────►│ Safety: risky tools wait for "yes"  │
 │ Mouth: <audio> stream    │◄───────────┤ Hands: lights, Claude Code,         │
 │  fallback: browser voice │  /api/tts  │        calendar*, music* (*stubs)   │
 └──────────────────────────┘            │ Voice: ElevenLabs (key stays here)  │
                                         │ Log:   logs/actions.log             │
                                         └─────────────────────────────────────┘
```

## Run it

Needs Node 20.18 or newer (tested on Node 22 and Node 26).

```bash
cd jericho
npm install
cp .env.example .env      # then paste your ANTHROPIC_API_KEY and ELEVENLABS_API_KEY
npm start
```

Open **http://localhost:3000** in Chrome or Safari, tap **Start**, allow the microphone and say
**"Jericho"**. You'll hear a beep. Then say what you want. You can also say it in one go:
"Jericho, turn off the bedroom lights". The text box at the bottom works too, which is handy if
speech recognition misbehaves.

After the wake word Jericho stays in a **conversation**: the orb says **Listening** and you can
keep talking without saying its name. The conversation ends, and the orb goes back to **Say
Jericho**, after 30 seconds of quiet (`conversationTimeoutSeconds`), or straight away when you
say "thanks Jericho", "that's all" or "go to sleep" (`endPhrases`). "Turn off the lights, that's
all" does the request first, then ends. The mic is switched off while Jericho is talking, so it
can't answer itself.

Try:

- "Jericho, turn on the kitchen lights": the terminal prints `💡 [MOCK LIGHTS] kitchen -> ON`.
- "Jericho, build a tic tac toe game in a folder called tic-tac-toe": Jericho asks you to confirm,
  you say "yes", Claude Code runs in `~/jericho-projects/tic-tac-toe`, and Jericho tells you when
  it's done. This needs the [Claude Code CLI](https://code.claude.com) installed and logged in.
- "Jericho, what's on my calendar tomorrow?": Jericho says the calendar isn't connected yet.

Run the offline tests (no API keys needed, nothing billed): `npm test`.

### If replies fail or it falls back to the browser voice

When it starts, Jericho checks its connections and prints the result:

```
   Self-test (Node v26.13.1, connections: keep-alive pool):
     Claude      ✅ PASS  191 ms
     ElevenLabs  ✅ PASS  420 ms, voice Qy7xBgqsDA40HK0hK0SY
```

A FAIL line says why: the key was rejected, the voice ID wasn't found, or the connection itself
failed and what lay behind it (for example `ENOTFOUND` means the name couldn't be looked up, and
`ECONNREFUSED` or `ETIMEDOUT` usually mean a firewall or proxy). Run the same check on its own
any time with `npm run selftest`. The Claude check is free; the ElevenLabs check speaks three
characters.

- **Error details:** every failed request logs its real cause in `logs/actions.log`, never just
  "fetch failed". Keys are never written there.
- **Connection pool:** Jericho keeps its connections open between requests for speed. If that
  connection pool ever fails while a plain request works, it switches to Node's built-in fetch by
  itself, prints a warning and logs `net_fallback` once. To switch the pool off entirely, start it
  with `$env:JERICHO_NO_KEEPALIVE = 1; npm start` (PowerShell).

## Using it from your phone

Browsers only allow the microphone on `https://` pages (or `localhost`), so
`http://<laptop-ip>:3000` will load on your phone, but the mic won't work. Pick one:

1. **Tailscale (easiest, private).** Install Tailscale on the laptop and phone, then run
   `tailscale serve 3000` on the laptop. It prints an `https://…ts.net` address that only your
   devices can reach.
2. **Self-signed certificate (same Wi-Fi).** Run `npm run make-cert` and restart. The server
   switches to HTTPS on its own. Open `https://<laptop-ip>:3000` on the phone and accept the
   warning. Android Chrome lets you click through. iPhones make you install and trust the
   certificate first, so option 1 is easier there.

Set `JERICHO_ACCESS_TOKEN` in `.env` before you do either, then open the page once as
`https://…/?token=<your token>`. The phone remembers it, and every API call without it gets
refused. **Without a token, Jericho only answers this PC itself**: other devices get a message
asking for one. Don't expose Jericho to the internet without a token: anyone who can reach it
can run Claude Code on your laptop once they say "yes".

Jericho also refuses requests from other websites (so a web page you visit can't send it
commands or say "yes" for you), and only answers when opened by this PC's name or address, a
home-network address, or a Tailscale `….ts.net` name. If you use another name (for example
your own domain through a tunnel), add it to `"allowedHosts": []` in `settings.json`.

Phone notes: tap **Tap to power on** each time you open the page, because phones only allow audio after a
tap. Keep the screen on, because phones stop listening when the screen locks. Android Chrome
may beep when it restarts listening.

## The presence (what you see)

The page is a full-screen 3D scene made with Three.js, which is installed with npm and served from
`node_modules` by Jericho itself. In the centre is a gold and amber being: a translucent pulsing
core, tilted rings turning at different depths, thousands of orbiting particles, and tendrils that
ripple like a jellyfish, all floating in a starfield.

| State | What it does |
|---|---|
| Always | Gold particles drift, swirl and wander through the whole scene |
| Waiting for "Jericho" | Dim, breathes slowly |
| Listening, while you talk | The moment you start speaking, every particle freezes in place, as if time stopped, and turns deep red with a soft glow, and the core takes a red tint. While you keep talking they tremble very slightly with your voice. When you stop, they ease back to gold and start drifting again within about half a second |
| Thinking | The rings spin faster and arcs of energy crackle between them; the particles drift in gold |
| Speaking | The whole structure pulses with Jericho's actual voice, and the gold particles flare with it |
| On a phone call | Slow teal ripples spread outward, and the status word says "Calling" |

Changes between states always ease in, never snap.

- **Moving around:** drag to rotate, scroll or pinch to zoom. Moving the mouse (or tilting the
  phone) adds a little parallax. A quick tap on the light does what the old start button did.
- **Chat:** the bubbles sit at the bottom; **Hide chat** tucks them away.
- **Settings:** the ✺ button opens a small panel for glow strength, particle amount and quality,
  saved in your browser. The panel shows the level in use, the measured frame rate, the drawing
  resolution and the antialiasing.
- **Image quality:**
  - Rendered in HDR at your screen's full pixel density, up to 2× and never beyond native 4K.
  - Antialiased with MSAA, or FXAA where that isn't available.
  - ACES filmic tone mapping.
  - Bloom with a tight core and a wide soft falloff.
  - Light shafts from the core.
  - A faint lens streak, and chromatic aberration on the brightest parts.
  - Very light film grain so dark gradients don't band.
  - Particles blur gently the further they are from the being.

| Quality | Pixel density | Antialiasing | Effects | Particles |
|---|---|---|---|---|
| Low | up to 1.25× | FXAA | no bloom, grain | 35% |
| Medium | up to 1.5× | 4× MSAA | bloom, lens streak and aberration, grain | 65% |
| High | up to 2× | 4× MSAA | two-layer bloom, light shafts, lens, grain | 100% |
| Ultra | up to 2× (4K cap) | 8× MSAA where supported | the same with finer shafts and core detail | 140% |
| Auto (default) | — | — | measures the frame rate every 2 seconds: drops a level below 50 fps, goes up a level after 6 seconds at 57 fps or more, and won't retry a level that was too slow | — |

  Auto starts at High on computers and Medium on phones (where it stays at Low or Medium).
- **Reduced motion:** with "reduce motion" on in your system settings, everything moves slower
  and calmer. The red freeze still happens, with a gentler drift and tremble.
- **No WebGL:** without it, the earlier 2D gold visualizer is used instead.

### Background, live HUD and startup

- **Background:** a faint perspective grid of light under the orb and thin gold energy lines behind it. When Jericho speaks, ripples of light travel out across the grid with his real voice level. When you talk while he listens, the lines stop and turn red with the particles. Low quality shows the grid only; Medium adds 3 lines, High 5, Ultra 7.
- **Live HUD:** the time and date, the current weather (same Open-Meteo data as the weather tool) and your next calendar event (same iCal link as the calendar tools), refreshed every 5 minutes. A readout that can't be fetched just stays hidden. On phones it collapses to the time.
- **Power on:** the page opens with a single **Tap to power on** prompt (the orb waits as a point of light). That tap plays the power-up, made live with Web Audio (no sound files): a low hum rising for about 2 seconds, rising tones as the rings spin up, a bright metallic chime exactly when the orb flashes, then a soft idle hum. The hieroglyphs light up and the wordmark carves in alongside it. A reload within 10 minutes gets a shorter version. Settings panel (sun icon): **Startup animation**, **Power-up sound**, **Sound volume**, **Idle hum**. With reduced motion only the sound plays.

## Memory and learning how you talk

- "Jericho, remember that I take my coffee black" saves a memory to `data/memory.json`, with the
  text, a topic and the date.
- "What do you remember about coffee?" searches them.
- "Forget the coffee thing": Jericho reads back the memory and waits for your yes, like other risky
  actions.
- Jericho won't store passwords, API keys, card numbers or ID numbers, even if you ask. This is
  checked in code (`server/secrets.js`), not just by Claude. Anything that looks like one is also
  blanked out in the action log.
- After each conversation ends, one small Claude call updates `data/style.json`, under about
  300 words. It covers phrases you use, how long your requests are, how you like replies, and
  words the mic mishears with what you meant. These notes and the 100 most recent memories go
  into Jericho's instructions, so replies fit you and misheard words get understood.
- Open **/memory** (the **Memory** button at the top) to see both files, delete single items, or
  wipe everything.
- `data/` is git-ignored, so none of it is ever committed. Every save, delete and wipe goes in
  the action log.

## Getting to know you

Jericho adapts to how you talk and gets better the more you use it. Everything it learns stays in
`data/`, which is git-ignored, and you can see and delete all of it on the **Memory** page.

- **Matching your mood and pace:** each request carries a short note on how you said it: how
  many words, how fast you spoke, or that you typed it. Jericho reads your mood from that and your
  words, and matches it:
  - rushed: a few words;
  - relaxed or joking: casual;
  - frustrated: calm and direct;
  - "go deep": more detail, up to about a minute.

  Its fixed replies come in several wordings, so it doesn't repeat itself.
- **Profile (`data/profile.json`):** after each conversation, one small Claude call updates your
  projects, goals, people, preferences, routines, the topics you keep coming back to, and short
  summaries of recent conversations. It also updates the style notes and lessons.
  - **Only what you said:** every new item has to quote your own words, or it's rejected.
  - **No guesses:** guesses and anything about health, personality or private life are refused in
    code, as are passwords, keys, card and ID numbers.
  - **Kept short:** duplicates are merged and stale items dropped, keeping it under about 500
    words.
- **Anticipating:** with the profile and recent conversations it works out what vague requests
  mean ("get that going"). It may offer one obvious next step, never more than one per reply,
  and never when you're rushed or frustrated.
- **Thinking:** plans, decisions and comparisons go to the stronger model (`claude.hardModel`),
  which works through them step by step. Jericho says a short "let me think" line first. Quick
  questions stay on the fast model.
- **Lessons (`data/lessons.json`):** when you correct it ("no, I meant...", "that's wrong",
  "stop doing that"), it saves a lasting rule straight away, quoting your words, and follows it
  from then on.
- **Ask it:** "what have you learned about me?" gets a short spoken summary.
- **The log:** every change goes in the action log as IDs and counts only, never the personal text.

## Controlling your PC

Jericho can work with your PC, Windows first.

| Tier | What | How |
|---|---|---|
| Runs straight away | open an app or a web page, volume, play/pause/next, timers, read or write the clipboard, list, read and search files | at once |
| Needs your yes | write a file, move or rename, delete (to the Recycle Bin, never permanently), run a command, start Claude Code, phone calls | Jericho reads back exactly what will happen, e.g. "Should I run this command in Cheats: git status?" |
| Never | anything outside your allowed folders, system, registry or security changes, `.env`, keys and other secret files | refused before you're even asked |

- **Allowed folders:** set in `settings.json` under `pc.allowedFolders`. The defaults are
  Desktop, Documents, Downloads and the Cheats folder. OneDrive copies of Desktop and Documents
  count too. Paths are said starting with the folder name: "Documents/notes.txt".
- **Commands are kept separate from your words:** apps and files are passed as data, never pasted
  into a command line. Commands never see Jericho's API keys. Secret-looking lines in files, the
  clipboard and command output are hidden before they're spoken.
- **Claude Code:** start it in a project folder ("todo-app", or a path inside an allowed folder
  such as "Cheats/jericho"). Ask how it's going, or "what did Claude Code do?" to hear the result.
- **Kill switch:** "Jericho, stop", "cancel everything", the Stop button or Esc stops speech, the
  reply in progress, running commands (including anything they started), timers, Claude Code
  jobs and calls, and clears any waiting yes/no. On a computer the mic stays on while Jericho
  talks, but only to hear "stop". On phones the mic still switches off while it speaks, so use
  the Stop button there.
- **Log:** every action goes in `logs/actions.log`, with secrets redacted and file text recorded
  only as its length. The **Memory** page has a **Control** section with your allowed folders and
  the last 20 actions.

## Speed

- Claude's reply is streamed. Each sentence is sent to ElevenLabs as soon as it's complete, and
  the next sentence starts downloading while the current one plays.
- The thinking animation starts about 0.6 seconds after you stop talking, before the browser has
  finished writing down what you said.
- While a page is open, the server keeps its connections to Claude and ElevenLabs open. When it
  hears the wake word, it gets Claude's prompt cache ready for the request that's coming.
- Every reply adds a `timing` line to `logs/actions.log`:
  - `listeningMs`: how long you talked.
  - `stoppedTalkingToFinalMs`: how long the browser took to finish the transcript.
  - `thinkingMs`: from your words to Jericho's first sentence.
  - `firstAudioMs`: from your words to the first sound.
  - `stoppedTalkingToAudioMs`: the delay you actually feel.
  - `server`: Claude's own timings and which models answered.

## Phone calls

"Jericho, call Luigi's and book a table for four at seven" works like this:

1. Jericho fills in anything missing. It looks up the number, or asks you, and never guesses one.
   For bookings it needs the date, time, party size and name.
2. It checks the call against the rules below. A blocked call is refused straight away, without
   asking you anything.
3. It reads back the number digit by digit, the goal, and what it will say, then asks "Should I
   dial?". Nothing is dialed without your yes.
4. On the call it always opens with "Hi, I'm an AI assistant calling on behalf of Sammy". The
   opening is written into the code, and it never claims to be human. It speaks with your
   ElevenLabs voice and listens with Twilio's speech recognition. A Claude agent handles the
   conversation.
5. When the call ends, Jericho tells you the outcome out loud: booked, no answer, busy, they need
   a callback, or voicemail. The call is saved to `data/calls.json` and shown on the **Calls**
   page (`/calls`), with a transcript.

**Rules (checked in code, in `server/calls/policy.js`):**
- **What it calls for:** only reservations, checking hours, appointments or one simple question.
  No emergency or short numbers (911, 988, the x11 numbers), no premium-rate numbers (900, 976),
  and only countries listed in `allowedCountryCodes`.
- **What it refuses:** anything that looks like impersonation, harassment, pranks, scams, sales,
  or paying money. This is checked by keyword and then by a quick Claude review. If that review
  can't run, the call doesn't happen.
- **Limits:** `maxCallsPerDay` (3), `maxCallsPerNumberPerDay` (2), and `maxMinutes` (5). Twilio
  enforces the time limit itself, and the agent starts wrapping up 30 seconds before it.
- **What it won't do on a call:** give card details or agree to a deposit. If the place needs
  that, the outcome is "needs callback".
- **Privacy:** Twilio keys and your number stay in `.env`. They never reach the browser and are
  blanked out of the log. Every webhook from Twilio must carry Twilio's signature.

**Test mode** (`calls.testMode: true`, the default) runs the whole flow without dialing: rules,
read-back, yes, then a pretend restaurant played by Claude. `testScenario` can be `random`,
`booked`, `alternative`, `callback`, `hours` or `no_answer`. Test calls cost a few cents in
Claude usage and no Twilio money.

### Setting up Twilio (real calls)

1. **Make an account** at twilio.com. Verify your email and your own mobile number when it asks.
   That number becomes your first *verified caller ID*.
2. **Get a number:** in the Console, go to Phone Numbers, Buy a number. Pick a local US number
   with **Voice**. The trial gives you one free.
3. **Copy your keys:** the Console home page shows the **Account SID** and **Auth Token**. Put
   them in `.env` along with the number you bought and your own mobile:
   ```
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_PHONE_NUMBER=+1...
   MY_PHONE_NUMBER=+1...
   ```
4. **Verify more numbers (trial only):** a trial account can only call verified numbers. To add
   one, go to Phone Numbers, Manage, Verified Caller IDs, Add a new Caller ID. Twilio texts a
   code to that phone.
5. **Give Twilio a way to reach Jericho.** Twilio needs a public https address for your laptop.
   Pick one:
   - **Tailscale Funnel:** `tailscale funnel 3000` gives you `https://<laptop>.<tailnet>.ts.net`.
   - **ngrok:** install it, claim the free static domain, then run
     `ngrok http --url=<your-name>.ngrok-free.app 3000`.

   Put the address in `settings.json` as `calls.publicUrl`, with no trailing slash. Also set
   `JERICHO_ACCESS_TOKEN` in `.env`. Jericho refuses real calls without it, because the page is
   now reachable from the internet.
6. **Switch on real calls:** set `calls.testMode` to `false` and restart. The startup message
   says `Phone calls: LIVE via Twilio`.
7. **First real test:** say "Jericho, call my phone to book a table for two at eight". Calling
   your own `MY_PHONE_NUMBER` is allowed as a rehearsal, and you play the restaurant. On a trial
   account, Twilio first plays a short trial notice and asks you to press a key.
8. **Calling real businesses:** you need to upgrade the account (Console, Upgrade, add a card),
   since a trial can only reach verified numbers. Upgrading also removes the trial notice.

**What it costs** (US prices; check twilio.com/en-us/voice/pricing/us before relying on them):

| Item | Price |
|---|---|
| Twilio phone number | about $1.15 a month |
| Outbound call | about $0.014 a minute, billed per started minute |
| Twilio speech recognition | roughly 2 cents per reply it transcribes |
| Claude (agent and safety review) | roughly 10 to 20 cents for a typical 2 to 3 minute call |
| ElevenLabs | a few hundred characters per call, from your plan |

A typical booking call comes to roughly 25 to 50 cents in total. The trial credit covers a lot of
practice. Test mode costs only the Claude part.

**Legal note:** Jericho tells every business up front that it's an AI and doesn't record audio.
Rules for automated and AI-voice calls vary by country and state. Calling businesses for your own
bookings is the ordinary case, but check what applies where you live.

## Web search, "Hey Jericho" and the morning briefing

- **Web search:** ask about news, scores, prices or opening hours. Jericho searches (at most 3 searches per question), answers briefly and names the source out loud ("according to ESPN"). It never reads links aloud: they appear as buttons under the answer in the chat panel. If web search isn't enabled for your API key, Jericho says so and carries on without it (turn it on in the Anthropic Console, under privacy settings).
- **Wake word:** "Jericho", "Jer", the misheard spellings, and the same with "hey", "hi", "ok" or "okay" in front ("hey jericho", "hey jer", "okay jericho"). The greeting and wake word are removed before your request reaches the brain.
- **Morning briefing:** say "good morning", "morning briefing" or "brief me". You get your calendar (today, plus tomorrow's first event), the weather, and the direction of S&P 500, Nasdaq and Dow futures plus Bitcoin, in under 45 seconds, plus a Briefing card in the chat panel. Each part is fetched separately and cached for 5 minutes; if one fails, Jericho skips it and says so. Market moves are information only, not advice.
  - Calendar: put your calendar's private iCal link in `.env` as `CALENDAR_ICS_URL` (see `.env.example`). It's read-only, needs no sign-in, and the link is never spoken or logged.
  - Weather: Open-Meteo (free, no key). Set `location` in `settings.json` (default Birmingham, Michigan).
  - Markets: Yahoo Finance, with Stooq and CoinGecko as fallbacks.
  - `briefing.autoTime` (for example `"07:00"`, empty by default): on your first wake after that time each day, Jericho offers the briefing. `briefing.name` sets the name it greets you with (defaults to `calls.ownerName`).

## Linking your Google Calendar (for the briefing and "what's on my calendar")

Jericho only reads your calendar, through its secret iCal link. No sign-in is needed.

1. On your PC, open [calendar.google.com](https://calendar.google.com) in a browser (this isn't available in the phone app).
2. Click the gear icon (top right), then **Settings**.
3. In the left column under **Settings for my calendars**, click your calendar (usually your name).
4. Click **Integrate calendar** (or scroll down to it).
5. Find **Secret address in iCal format** and click the copy icon next to it. It starts with `https://calendar.google.com/calendar/ical/` and ends with `/basic.ics`. Don't use the "Public address", which only works for public calendars.
6. Open `.env` in the `jericho` folder (in Notepad: File → Open, set the file type to **All files**, then choose `.env`). Add a line with the link right after the `=`:
   ```
   CALENDAR_ICS_URL=https://calendar.google.com/calendar/ical/.../private-.../basic.ics
   ```
   Save it as `.env`, not `.env.txt`.
7. Restart Jericho (Ctrl+C, then `npm start`). The startup self-test should show `Calendar ✅ PASS  N events today`.

Then say "check my calendar" at any time: Jericho runs the same test and tells you the result.

- Spaces around the link, quotes around it, and `webcal://` links are all fixed automatically. `.env` files saved by Notepad as "Unicode", with a byte order mark, or accidentally named `.env.txt` are read too, and the self-test tells you to fix the file.
- The link can also go in `settings.json` as `briefing.calendarIcsUrl`, but `.env` is better because it stays out of git. If both are set, `.env` wins.
- If the self-test says **not set**, the line is missing or empty, or Jericho wasn't restarted. **Link unreachable** means Google refused the link (copy it again; resetting it in Google makes the old one stop working) or there's no internet. **Not a valid calendar** means a different link was pasted (for example the embed or public address).
- Treat the link like a password. Jericho never prints, logs or says it.

## Claude Code on Windows

Jericho finds the `claude` command by itself: first `claudeCode.path` in `settings.json`, then your PATH, then the usual install folders:
`%USERPROFILE%\.local\bin\claude.exe` (the official installer), `%APPDATA%\npm\claude.cmd` (npm) and `%LOCALAPPDATA%\Programs\claude`.
A `claude.cmd` is run through `cmd.exe /c` with fixed, escaped arguments, and your task is sent on its input, so nothing you say can turn into a command.

The startup self-test shows `Claude Code ✅ PASS` with where it was found and its version. If it says FAIL:
1. Install Claude Code: in PowerShell run `irm https://claude.ai/install.ps1 | iex`, then run `claude` once to log in.
2. Restart Jericho.
3. If it's installed somewhere unusual, find it with `where.exe claude` in PowerShell and put that path in `settings.json`, e.g. `"path": "C:\\Users\\you\\.local\\bin\\claude.exe"` under `claudeCode` (backslashes doubled in JSON).

If Claude Code is missing when you ask for a job, Jericho says so and tells you the fix instead of asking for a yes.

## Weather

Ask "what's the weather tomorrow", "will it rain this weekend", "weather for Friday" or "what's the next few days look like". Jericho answers with the high and low, the rain chance and a short tip, from Open-Meteo for the location in `settings.json` (`location`). The forecast goes 7 days ahead and is cached for 5 minutes. The morning briefing includes tomorrow in one short sentence.

## Always listening

After the one tap, Jericho listens for his name ("Jericho", "Jer", "hey Jericho"…) nonstop; no more clicks. After he answers he keeps listening for follow-ups (conversation mode), then goes back to waiting for his name.

- **Listening indicator** (under the state word): `Mic live` (red dot) when the microphone is really on, `Mic paused` while he speaks (so he never hears himself; the echo tail and echo matching still apply), `Muted`, or `Mic lost · tap to reconnect`.
- **Mute:** the small gold mic button, the **M** key, or say "Jericho, go to sleep". Muted means nothing is listened to at all (the browser's mic light goes off); the orb dims and the idle hum rests. Tap the light, the button, or press M to unmute.
- **Auto-recover:** if speech recognition stops or errors, it restarts on its own (250 ms, backing off to 5 s if it keeps failing). If the microphone is unplugged or blocked, the page says so and one tap reconnects it.
- **Stopping:** there's no Start or Stop button any more. Esc and "Jericho, stop" stop everything as before. Tapping the light while he talks cuts him off and listens; while he's thinking or waiting for a yes, it stops everything (what the Stop button did).
- **Far-field** (settings panel): **Wake sensitivity** Low (the name must come first), Normal, or High (also checks the recognizer's second and third guesses and near-misses like "Jerichow"; best from across the room). **Room mode** lowers the voice level needed to interrupt him and boosts the mic level the orb reacts to. **Calibrate room**: stay quiet for a moment, then say "Jericho" a few times from where you sit; the threshold is set between the room's noise and your voice.

## Alarms

Say "Jericho, set an alarm for 7 AM", "wake me at 6:45 on weekdays for the gym" or "set a daily alarm for 6:30". Times are US Eastern (`alarms.timezone`, default America/Detroit), with daylight saving handled: if the time has already passed today it's set for tomorrow, a time that doesn't exist on the spring-forward night (like 2:30 AM) rings at 3:30, and on the fall-back night 1:30 rings the first time. Jericho says the exact day and time back. "What alarms do I have?" lists them; "cancel alarm 2", "cancel the gym alarm" or "cancel all alarms" (that one asks for your yes) removes them. Alarms are saved in `data/alarms.json` (not in git) and survive restarts; one-time alarms missed by more than 30 minutes are dropped and repeating ones move on.

**When one rings** it overrides mute and any conversation: a loud alarm sound (made live with Web Audio, no sound files) with Jericho reading the label between rings, the orb pulsing red and gold, and a big Stop / Snooze screen. Stop it with "Jericho, stop", Esc, tapping the light or the Stop button; snooze with "Jericho, snooze" (9 minutes by default) or "snooze for 15 minutes". No wake word is needed while it rings; your voice dips the alarm so you're heard, and Jericho's own voice reading the label is ignored. The kill switch stops it too. It gives up after 30 minutes (`alarms.maxRingMinutes`).

**The sound** (settings panel → Alarm sound, with a 3-second **Preview**):
- **Missile alert** (default): an air-raid siren sweeping 400 to 1200 Hz on a detuned sawtooth/square pair, sonar pings with a left-right echo, a deep rumble with distant blasts, rapid triple warning beeps on top, and now and then an incoming-missile whoosh that lands in a low thud. Slight drive and stereo width make it big without sounding cartoonish.
- **Air raid siren**, **Sonar ping**, or the **Classic beeps** from before.
- It starts at 60% of the alarm volume and ramps to full over 20 seconds, so it wakes you hard without a sudden blast, and it gets more intense the longer it rings (faster sweeps and beeps, more frequent missiles).
- **Loudness, safely:** everything goes through one output chain: a glue compressor, a brick-wall limiter, and a final hard stop that physically can't go past 0.97 of the 0.92 output ceiling (about 89% of full scale), so it can't clip or overdrive speakers. The volume slider sets how loud; **Max loud** raises the cap a little and drives the limiter harder, under the same hard ceiling in the code.
- When you talk over it, the whole alarm dips for a moment so "stop" or "snooze" is heard, as before.

**If the browser blocks sound** (the page just opened with no tap), the page says "Tap to dismiss" and the PC plays a native Windows alarm sound (the looping Windows alarm with rapid triple warning beeps on top, getting faster) until you stop it. It plays at your PC's own volume; Jericho never changes the system volume; stopping from the page stops that sound too. The native sound also starts if no Jericho page is open within 10 seconds.

**Waking the laptop (Windows):** for each alarm Jericho creates a Scheduled Task called `Jericho Alarm <number>` with "Wake the computer to run this task" on, 2 minutes early (`alarms.wakeLeadMinutes`). It runs only `scripts/alarm-wake.ps1`, which starts Jericho if it isn't running and opens the page; no labels or secrets go into the task, and Jericho only ever touches tasks with that exact name. Cancelling or finishing an alarm removes its task, and leftovers are cleaned up when Jericho starts. Nothing runs as admin: if Windows refuses, Jericho tells you and gives you the one-line command to run yourself.
- Wake timers must be allowed: Control Panel → Power Options → Change plan settings → Change advanced power settings → Sleep → **Allow wake timers** → Enable (on battery and plugged in). Jericho checks this the first time you set an alarm and tells you if it's off.
- Waking only works from **sleep**, not when the laptop is shut down (or hibernating on some laptops), and it's most reliable when **plugged in**.
- Turn the tasks off with `"wakeTasks": false` under `alarms` in `settings.json`.

**Settings panel (sun icon):** alarm volume, default snooze minutes, and the list of upcoming alarms with a Cancel button for each.

## Roku TV

Jericho can control a Roku TV (or Roku stick/box) on your home network, using Roku's own External Control Protocol (plain HTTP on port 8060). No account or app needed.

- "Turn on the TV", "turn the TV off", "TV volume up 5", "mute the TV", "press home / back / select / play / rewind / fast forward / replay / info" (and up, down, left, right), "open Netflix on the TV", "open Disney+", "search Netflix for Breaking Bad", "what's playing on the TV?", "what apps are on the TV?"
- App names are matched loosely against the apps actually installed ("disney" → Disney Plus, "HBO Max" → Max, "prime" → Prime Video).
- **Finding the TV:** Jericho asks the network (SSDP discovery) and remembers the address in `data/roku.json` (not in git). If the TV's address changes, it finds it again. To pin it, set `ROKU_IP=192.168.1.50` in `.env` (the TV shows its address under Settings > Network > About); that overrides discovery.
- **Safety:** only home-network addresses (192.168.x, 10.x, 172.16-31.x), and only a device that identifies itself as a Roku. Every request times out after 2.5 seconds, and every TV action is written to `logs/actions.log` (search words only as their length).
- **If it says "The TV isn't on the network"**: check that the TV is on and on the same Wi-Fi as the PC.
- **If the TV refuses** (403): on the TV, Settings > System > Advanced system settings > Control by mobile apps > Network access, set to Default or Permissive.
- **Turning it on:** works when the TV is in standby. A Roku TV that's fully off can only be woken over the network if Settings > System > Power > Fast TV start is on; a Roku stick or box can't turn the TV itself on. Jericho says so when it can't.
- "What's playing" names the app; the title only when the app shares it (many don't).

## Interrupting Jericho (barge-in)

So Jericho never hears himself through the speakers:

- **Speech recognition is paused while he talks.** On a PC a separate mic stream (with the browser's echo cancellation, noise suppression and auto gain) only measures the level. When your voice is clearly above the threshold for about a quarter second, he fades out within about a tenth of a second, stops the rest of the reply, and recognition starts again. Your words from that point on are your next request (no wake word needed). Words from before that point are never transcribed.
- **Echo tail:** after he finishes, the mic stays deaf for 700 ms more (`bargeIn.echoTailMs`), so room echo isn't transcribed.
- **Text check:** anything heard during his speech, in the tail, or in the first 400 ms of a new utterance is compared with his last 3 sentences (case and punctuation ignored, small recognition slips allowed). If 60% or more of the words are his, it's dropped as echo and never sent to the brain. One- or two-word replies like "yes" are only dropped if they repeat a whole sentence of his.
- **Ducking:** while the mic listens for interruptions, his voice plays at 85% (`bargeIn.duckTo`) to reduce leakage.
- **Calibration:** for the first 1.5 seconds of each reply Jericho measures his own echo, and the threshold is at least 1.8× that. The loudest echo measured is kept for the session, so a quiet reply doesn't lower the bar. Press **Re-calibrate** in the settings panel to measure again (after changing the volume or switching to headphones).
- **Debug line** in the settings panel (sun icon): the mic level, the current threshold, how many transcripts were dropped as echo, and whether the ears are paused, in the echo tail or listening. The dropped text itself only goes to the browser console (`[jericho] echo ignored`).
- Settings panel → **Interrupt while talking**: Off, Speakers (stricter, the default) or Headphones (more sensitive). Saved in your browser. With Off, talking loudly over him only turns on listening for "Jericho, stop".
- `settings.json` → `bargeIn`: `enabled`, `minLevel` (0.15), `minMs` (270), `calibrateMs` (1500), `echoTailMs` (700), `duckTo` (0.85). If he still cuts himself off, raise `minLevel` or press Re-calibrate; if he misses you, lower it or choose Headphones.
- Phones keep the mic off while he talks: tap the light (or press Stop) to cut him off and start listening.
- Interrupting only stops his reply. Running tools, Claude Code jobs and calls keep going, and something said over him never counts as a "yes" to a confirmation. "Jericho, stop", the Stop button and Esc still stop everything. While he's talking, "Jericho, stop" works like this: your voice cuts him off first, then the "stop" is heard. If the first word gets clipped, say "stop" again or press Esc.

## Troubleshooting

- **The startup self-test** prints one line each for Claude, ElevenLabs, Calendar and Claude Code. It runs in the background after the server is already answering, all checks side by side, and any check that takes longer than 15 seconds (20 for Claude Code) is reported as FAIL instead of holding things up. It never stops Jericho from starting.
- **Jericho seems stuck "Thinking"**: say "Jericho, stop" or press Esc. That stops the request and anything it started; the next request starts clean.
- **He stopped talking mid-sentence**: if the ElevenLabs voice stalls for 8 seconds, he finishes the reply in the browser voice instead of waiting forever.
- **The page lost its connection** (Wi-Fi drop, server restart): it reconnects by itself, and checks for a ringing alarm the moment it's back.
- **The mic indicator says "Mic reconnecting…" for a long time**: another app or tab may be using the microphone; close it, or tap the light.
- **Battery and fan**: while muted, before the first tap, or idle in a window you're not using, the 3D scene draws 30 frames a second instead of 60; it pauses completely when the tab is hidden. Quality "Low" in the settings panel saves the most.
- **Errors are logged** in `logs/actions.log` (with secrets and personal text removed). A background error is logged and Jericho keeps running.

## Settings (`settings.json`)

None of these are secret. Keys live only in `.env`.

| Setting | What it does |
|---|---|
| `elevenlabs.voiceId` | The ElevenLabs voice. Copy any voice ID from your ElevenLabs Voices page. Changes apply on the next reply, no restart needed. |
| `elevenlabs.modelId` | `eleven_flash_v2_5` (default) is the lowest-latency natural voice. `eleven_turbo_v2_5` is a bit richer, `eleven_multilingual_v2` richer still, with more delay. |
| `elevenlabs.stability` / `similarityBoost` / `style` / `speed` / `useSpeakerBoost` | Voice settings. Lower stability is more expressive, higher is steadier. `speed` runs from 0.7 to 1.2. All of these apply on the next sentence, no restart needed. |
| `audioCache` | Short phrases (up to `maxWords` words) that come up `minRepeats` times are saved in `data/audio-cache` and replayed from disk. At most `maxFiles` are kept. |
| `conversationTimeoutSeconds` | How long Jericho keeps listening without the wake word after you or it last spoke. Default 30. A pending yes/no question waits its own 60 seconds. |
| `endPhrases` | Phrases that end the conversation right away. Add your own. |
| `wakeWords` | Words that wake the assistant: "jericho", "jer" and common mishearings ("jerico", "jerry co", "jerr"…). Add more to the array any time; a space also matches a hyphen or no gap, so "jerry co" covers "jerry-co" and "jerryco". Whole words only: "Jerry", "Jeremy" and "jersey" don't trigger it. Reload the page after editing. |
| `claude.model` / `claude.effort` | The model for normal requests: `claude-opus-5-5` at `low` effort, which keeps spoken replies quick. |
| `claude.hardModel` / `claude.hardEffort` | The stronger model for hard questions: `claude-fable-5-2` at `high` effort. Jericho decides when to use it (a `deep_think` tool) and says "Let me think that through" first. |
| `claude.webSearch` | Lets Jericho look things up, such as a restaurant's number or hours. About 1 cent per search. |
| `claude.fallbacks` | On by default. If the main model declines a request on safety grounds, the API retries it on a fallback model inside the same call. Set to `false` to turn it off. |
| `lights.provider` / `lights.rooms` | `mock` for now. `hue` and `kasa` are stubs with setup notes inside. |
| `claudeCode.path` | Full path to `claude.exe` or `claude.cmd` (or its folder), if Jericho can't find it on its own. Empty = search automatically. |
| `claudeCode.projectsDir` | Claude Code only runs in folders inside this directory. |
| `claudeCode.permissionMode` | Passed to `claude --permission-mode`. `acceptEdits` lets it write files but not run arbitrary shell commands. Add `"extraArgs": ["--allowedTools", "Bash(npm *)"]` to allow specific commands. |
| `confirmation.yesWords` / `timeoutSeconds` | What counts as yes, and how long a risky action waits. |
| `calls.*` | Phone calls, see below. `testMode` is on by default. |

Most settings are read at startup, so restart the server after changing them. The voice settings
are the exception.

## Safety layer

- Each tool declares whether it's `risky`. The server checks that flag, not Claude, so Claude
  can't skip it.
- When Claude picks a risky tool, nothing runs yet. Jericho says what it's about to do ("Should I
  run Claude Code in the tic-tac-toe folder to…? Say yes to confirm.") and waits.
- Only a clear yes runs it: "yes", "yeah", "confirm", "go ahead" and similar. Anything with "no",
  "don't", "cancel", "stop" or "wait" in it is a no. So is saying something else, staying quiet
  for 60 seconds, or tapping **No**.
- Every request, tool call, confirmation, refusal, result and error is appended to
  `logs/actions.log` as one JSON line.

Risky today: `claude_code`, `calendar_add_event` (it can email invites), phone calls, PC actions
that write, move, delete or run commands, forgetting memories, and cancelling more than one
alarm. When you add a tool that deletes files, runs shell commands, spends money or sends
messages, set `risky: true`.

- The blocklist of commands that read secret files (`.env` and similar) in `run_command` is a
  best-effort extra: a determined command can get around it, which is why every command needs
  your yes and its output is scrubbed of keys before it's shown or spoken.
- Child processes (commands, Claude Code, scheduled tasks) never get Jericho's keys, the access
  token, your phone number, the calendar link or the TV's address. Claude Code only gets
  `ANTHROPIC_API_KEY`, in case it needs it to sign in.

## Files

```
server/index.js           HTTP(S) server, access token, API routes
server/brain.js           Claude conversation + tool loop + confirmation holding
server/safety.js          yes/no detection
server/tts.js             ElevenLabs streaming proxy
server/logger.js          logs/actions.log
server/tools/index.js     tool registry (add new tools here)
server/tools/lights.js    lights tool → lights/mock.js | hue.js | kasa.js
server/tools/claudeCode.js  runs `claude -p` in a project folder, announces when done
server/tools/placeholders.js  calendar + music stubs
server/tools/memory.js    remember / recall / forget tools
server/memory.js          data/memory.json + data/style.json (read, save, delete, wipe)
server/style.js           the after-conversation learning call (style notes, profile, lessons, summary)
server/secrets.js         detects passwords, keys, card and ID numbers
server/speech.js          sentence splitter + clean-up for natural speech
server/net.js             keep-alive connections and warm-up pings
server/calls/policy.js    what may be called: numbers, purposes, limits, safety screen
server/calls/agent.js     the Claude agent on the phone, and the pretend business for test mode
server/calls/manager.js   test calls, Twilio calls and webhooks, data/calls.json, announcements
server/tools/calls.js     make_call + recent_calls tools
server/tools/deepThink.js sends hard questions, plans and decisions to the stronger model
server/tools/learning.js  save_lesson + what_ive_learned tools
server/tools/pc.js        PC control tools (apps, links, volume, media, timers, clipboard, files, commands)
server/pc/policy.js       what may be touched: allowed folders, secret files, blocked commands and apps
server/cancel.js          the kill switch: everything running registers here
public/                   the web page (index.html, app.js, style.css)
public/presence/          the 3D presence: scene.js (Three.js scene), postfx.js (quality levels and effects),
                          index.js (loading, fallback, HUD, settings)
public/presence.css       full-screen layout, HUD and dock
public/visualizer.js      the 2D fallback visualizer
public/memory.html, memory.js  the /memory page
public/calls.html, calls.js    the /calls page
data/                     your memories and style notes (git-ignored)
test/                     offline tests with a fake Claude client
```

## Adding a tool

```js
export const weatherTool = {
  risky: false,
  definition: {
    name: "weather",
    description: "Current weather for a city.",
    input_schema: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
      additionalProperties: false,
    },
  },
  async run({ city }) {
    return { ok: true, summary: "12°C and cloudy" }; // call a real API here
  },
};
```

Then add it to the list in `server/tools/index.js`.
