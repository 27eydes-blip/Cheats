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

### How fast it is (measured)

Measured with `node scripts/bench-latency.mjs` against the real Claude API. The old code (the
previous commit) and the new code were run three times each, taking turns, with five typical
turns per run. The numbers are the time from the request reaching the server to Jericho's first
full sentence (the median, in seconds). ElevenLabs and your microphone come on top of these, and
those can only be measured on your PC: the sun panel's Speed readout shows them for every turn.

| Request | Before | After | Why |
|---|---|---|---|
| "What time is it", "volume up", "snooze" | about 0.5 to 2 (a Claude call) | **0.002** | answered locally, no Claude call |
| Simple: greetings, quick sums, weather | 1.28 | **0.52** | the fast model (Claude Haiku 5.5) |
| Complex: explanations, facts, plans | 1.04 | 1.0 to 1.5 | the strong model, as before (within the API's normal ups and downs) |

Other changes you'll feel but that don't show in that table:

- **Sending as soon as you stop talking.** The browser's final transcript can lag a second or
  more. When the words on screen stop changing (450 ms for a short command, up to a second for
  a long sentence, longer if you trail off on "and" or "the"), the request goes at once. If the
  browser's final words turn out longer ("…in the kitchen"), the full sentence replaces the
  early one before anything is said. Not used for yes/no confirmations. Turn it off in the sun
  panel ("Send as soon as I stop talking").
- **Instant feedback.** The orb flashes a gold ring the moment you stop talking (on a PC, from
  the mic level, within about 100 ms). If an answer takes more than 1.5 seconds, Jericho says a
  quick "On it." (or plays a soft sound, or nothing: sun panel, "Slow answers"). The answer
  always waits for it to finish, so they never overlap.
- **The first sentence starts sooner.** Replies are streamed. Each sentence goes to ElevenLabs
  as soon as it's complete, and the next one downloads while the current one plays. A long
  first sentence is spoken from its first comma.
- **Warm connections.** At startup and every 4 minutes (every 25 seconds while a page is open),
  the server touches Claude and ElevenLabs. That covers the DNS lookup, the TLS handshake and
  the keep-alive sockets. DNS answers are kept for 5 minutes. Hearing the wake word warms
  Claude's prompt cache for both models.
- **Weather and calendar are pre-fetched** in the background while a page is open, so those
  tools answer from memory.
- **Smaller requests.** Only the saved memories that match a request are sent with it, not all
  of them (Claude can still look up the rest with `recall`). After 40 messages the
  conversation starts fresh, with a short recap of the last few exchanges.
- **Page loading.** Files are gzipped (app.js is 24 KB instead of about 80 KB) and sent with an
  ETag, so a reload is a tiny "not changed" reply. Fonts are kept for a year and the 3D
  library for a week. The server is answering about 0.2 seconds after it starts; the self-test
  runs afterwards, in its own process.

### Which model answers

The sun panel's **Brain** setting (or `claude.routing` in settings.json) picks it:

- **Auto** (the default): simple everyday requests go to the fastest model, Claude Haiku 5.5.
  That covers greetings, the time, volume, the TV, alarms, the weather, lights and short
  questions. Everything else goes to the strong model, Claude Opus 5.5: anything complex,
  long, vague ("do it"), a search, or anything that might need a risky action.
- **Always strong**: every request goes to the strong model.

Risky actions never reach the small model, through two locks. First, the words: anything about
files, commands, Claude Code, calls, messages, invites, forgetting, cancelling or system
settings goes to the strong model. Second, if the small model asks for a risky tool anyway, its
answer is thrown away, never run or read back, and the strong model redoes that step. The yes
always goes through the strong model. If the small model refuses, errors or isn't available on
your API key, the strong model answers (and keeps answering for 10 minutes).

### Instant local commands (no Claude call)

"What time is it", "what's the date", "volume up" / "volume down" / "mute the volume", and
"snooze" (while an alarm rings) are answered on the spot. They use the same safe-tier tools and
logs as when Claude calls them, and stay in the conversation history so Claude knows about
them. "Stop", "go to sleep" and "mute" work as before: they're handled on the page.

### Voice model

The sun panel's **Voice model** setting overrides `elevenlabs.modelId`. Flash is the fastest and
still sounds natural. Turbo is a little richer; Multilingual is the richest, with the most delay.

### Safety net (it never hangs)

- If ElevenLabs hasn't started a sentence within 3.5 seconds, the browser voice takes over for
  the rest of that reply.
- If Claude goes quiet for 12 seconds, Jericho says a short sorry. After 40 seconds it gives
  up with "Sorry, Claude isn't answering right now", and the conversation carries on.
- If the server sends nothing at all for 30 seconds (it sends a heartbeat every 10 seconds
  while tools run), the page stops waiting and says so.

### The latency readout and logs

Every turn is measured from the end of your speech to each stage:

1. The final transcript.
2. The request sent.
3. Claude's first token.
4. The first full sentence.
5. The first audio byte.
6. Audio playing.

The sun panel's Speed readout shows the last turn and the average of the last 10. Copy
diagnostics includes them too. Each turn is added to `logs/latency.log`, numbers only, never
what was said. Older `timing` lines still go to `logs/actions.log`.

## Phone calls

Jericho can phone any US number for you, one call at a time: a business ("call Luigi's and book
a table for four at seven"), a number you say ("call 248 736 0123 and ask if they're coming
tonight"), or a saved contact ("call Luke"). It works like this:

1. Jericho fills in anything missing. For a business it looks up the number or asks you, and
   never guesses one. For bookings it needs the date, time, party size and name.
2. It checks the call against the rules below. A blocked call is refused straight away, with the
   reason, without asking you anything.
3. It reads the number back digit by digit, says who it'll call and what it'll say, then asks
   "Should I dial?". Nothing is ever dialed without your spoken yes. A no, silence, or a yes said
   over the read-back means no call.
4. Every call to someone who isn't you opens with a fixed line, then says what you want in one
   or two short sentences:
   - "Hey Luke, I'm Jericho, Sammy Eyde's personal assistant." when you named the person or
     they're a saved contact;
   - "Hello, I'm Jericho, Sammy Eyde's personal assistant." for a business or an unknown number.
     Jericho never guesses a name.

   The name is `calls.ownerFullName`. Calls to you keep "Hey Sammy, it's Jericho." If anyone
   asks whether he's a person, a bot or an AI, Jericho answers calmly and honestly that he's an
   AI assistant. That's checked in code on every reply: a dodge gets "I'm an AI assistant."
   added, and a claim to be human is replaced. He never pretends to be you or anyone else.
   Calls aren't recorded. If you explicitly ask ("call Luke and record it"), the read-back says
   so, and the call opens with "This call is being recorded."

   Some places require an AI voice to say it's an AI at the start of a call. To put that in the
   opener ("Sammy Eyde's AI personal assistant"), set `calls.discloseAiUpfront` to `true`.
5. If the person says stop, don't call again, or asks to be taken off a list, Jericho apologises,
   says goodbye and hangs up at once. The number goes on the do-not-call list, `data/dnc.json`,
   which is checked before every call. That's caught in code from their words, and by the call
   agent as well.
6. It speaks with your ElevenLabs voice and listens with Twilio's speech recognition; a Claude
   agent handles the conversation. When the call ends, Jericho tells you how it went (booked,
   "Luke said he's coming around eight", no answer, busy, voicemail, asked not to be called). The
   call is saved to `data/calls.json` and shown on the **Calls** page (`/calls`).

### How Jericho sounds on a call

Calm, reserved, polite and assertive:
- **How he talks:** he says what's needed plainly, asks one thing at a time, and waits for the
  answer. If he's interrupted, he stops and listens.
- **If they push back or stall:** he restates the request once in different words and holds his
  position politely. If they still say no, or say stop, he thanks them once and ends the call.
  He never argues or pressures.
- **If he didn't understand,** he asks once for a repeat.
- **At the end,** he confirms the key detail back ("So that's Thursday at seven, for two."),
  says a brief thanks, and hangs up.
- **Voicemail:** one short, calm message with who he is, what it's about, and that you can be
  reached back.
- **Private details:** none about you (address, school, family, schedule) beyond what the task
  needs.

Code tidies every line he speaks: no "um" or "so basically", no exclamation marks, one thanks
and one sorry at most.

The call voice is steadier and a little slower than the everyday voice. You can tune it in
`settings.json`; the everyday voice is unchanged.

| Setting | Default | What it does |
|---|---|---|
| `calls.voiceStability` | 0.8 | Higher is steadier and calmer (0 to 1) |
| `calls.voiceStyle` | 0 | Lower is less exaggerated (0 to 1) |
| `calls.speakingRate` | 0.92 | Below 1 is slower (0.7 to 1.2) |
| `calls.ownerFullName` | "Sammy Eyde" | The name in the opener |
| `calls.discloseAiUpfront` | false | `true` adds "AI" to the opener |

### Contacts

Say "save Luke's number as 248 736 0123" (Jericho reads it back digit by digit), "who's in my
contacts" (names, and only the last 4 digits of each number), or "delete Luke from contacts"
(asks first). Contacts live in `data/contacts.json`: git-ignored, on your PC only. "Call Luke"
then uses the saved number, and still reads it back in full before asking for your yes.

### Owner calls ("Jericho, call me")

Say "call me", "call my phone" or "give me a call and say hi", and Jericho rings your own cell. That's `MY_PHONE_NUMBER` in `.env`; you never
have to say the number.

- **Only your number.** The owner call tool has no number field. The server dials
  `MY_PHONE_NUMBER` itself, after normalizing it to +1 and 10 digits; it must be a US number.
  Calls to anyone else go through the normal rules above, with the fixed opening line.
- **Still your yes.** Jericho reads the plan back without saying the number, then asks "Should I
  dial?". The daily cap, the per-number cap, `maxMinutes`, US only and the signed-webhook checks
  all apply as usual. The 10-minute cooldown and the 4-an-hour limit don't apply to your own phone, and saying "stop"
  on an owner call just ends it (your number never goes on the do-not-call list).
- **On the call** it opens with "Hey Sammy, it's Jericho," using `calls.ownerName`, then does
  what you asked: reads a message, gives a reminder, or has a short back-and-forth. If it gets
  your voicemail, it leaves the message there. Afterwards it tells you how it went, for example
  "I called your phone. Reminded you about the dentist at three."
- **Your number stays in `.env`.** It isn't stored with the call (the call records "owner"),
  it's blanked out of the log in every way it might be written, and it's hidden on the Calls
  page.
- In test mode nothing rings: Claude plays you picking up.

**Rules (checked in code, in `server/calls/policy.js`):**
- **Numbers:** US only (+1), whatever the settings say. Refused:
  - 911, 988, the other x11 numbers and short codes;
  - premium-rate and toll numbers (900, 976, and the 5xx and 700 service codes);
  - numbers that start with +1 but aren't in the US (Canada, and the Caribbean and Atlantic
    islands, which are billed as international and used by "one ring" scams);
  - in live mode, the fictional 555-01xx numbers.

  Toll-free 800 numbers are fine.
- **What it refuses:** threatening, harassing, scaring or pranking someone; scams, gift cards,
  one-time codes, or anything about money or bank details; deceiving someone about who's
  calling; and impersonating anyone (you, another person, or a business). This is checked by
  keyword in code, then by a quick Claude review, and if that review can't run, the call
  doesn't happen. A refusal is explained out loud.
- **Limits:**
  - `maxCallsPerDay` (10) in total.
  - At most 2 calls a day to the same number (settings can lower this, never raise it).
  - 10 minutes before calling the same number again.
  - At most 4 calls in any hour.
  - One call at a time: several numbers in one request are refused, and there's no bulk or
    scheduled calling.
  - `maxMinutes` (5) per call. Twilio enforces it itself, and the agent starts wrapping up 30
    seconds before.
- **What it won't do on a call:** give card details or agree to a deposit or payment. If a place
  needs that, the outcome is "needs callback".
- **Privacy:** Twilio keys and your number stay in `.env`. They never reach the browser and are
  blanked out of the log. Call records and the do-not-call list keep only the last 4 digits of a
  number, plus a keyed hash (the key is `data/call-key`) so the limits and the list can still
  recognise it. Any phone number in the log or in a saved transcript, however it's written,
  becomes "[phone ...0123]". Full numbers exist only in `data/contacts.json` and, during a call,
  in memory. Every webhook from Twilio must carry Twilio's signature (see "Security through the
  tunnel" below).
- **Trial accounts:** if Twilio refuses because the number isn't verified on a trial account,
  Jericho says "Twilio won't dial unverified numbers on a trial account" instead of a generic
  error.

**Test mode** (`calls.testMode: true`, the default) runs the whole flow without dialing: rules,
read-back, yes, then a pretend restaurant played by Claude. `testScenario` can be `random`,
`booked`, `alternative`, `callback`, `hours`, `no_answer` or `stop` (they ask not to be called again). Calls to people are played by a friendly pretend contact. Test calls cost a few cents in
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
   `JERICHO_ACCESS_TOKEN` in `.env` to a long random value (at least 16 characters). Jericho
   refuses real calls without it, because the page is now reachable from the internet.
6. **Switch on real calls:** set `calls.testMode` to `false` and restart. The startup message
   says `Phone calls: LIVE via Twilio`.
7. **Run the setup check:** `npm run calls:setup`, with Jericho and the tunnel running. It checks:
   - the four Twilio values and the access token in `.env` (only whether each is set and looks
     right: it never prints a key, token or phone number). `MY_PHONE_NUMBER` must be +1 and 10
     digits, because owner calls ring it;
   - `calls.publicUrl` and `calls.testMode`;
   - that the tunnel refuses a stranger: the page without a token, and an unsigned webhook.
     Add `--no-network` to skip this check.

   Then it prints exactly what to enter in the Twilio console for your number. That's under
   Phone Numbers, Manage, Active numbers, your number, Voice configuration:
   - **A call comes in:** Webhook, `https://<your address>/twilio/voice`, HTTP POST.
   - **Call status changes:** `https://<your address>/twilio/status`, HTTP POST.

   Jericho's own outgoing calls send these addresses to Twilio by themselves. The number's
   settings only matter when someone calls your Twilio number. Jericho doesn't take incoming
   calls, so it answers those with a hang-up (after checking the signature).
8. **First real test:** say "Jericho, call my phone to book a table for two at eight". Calling
   your own `MY_PHONE_NUMBER` is allowed as a rehearsal, and you play the restaurant. On a trial
   account, Twilio first plays a short trial notice and asks you to press a key.
9. **Calling real businesses:** you need to upgrade the account (Console, Upgrade, add a card),
   since a trial can only reach verified numbers. Upgrading also removes the trial notice.

### Security through the tunnel

A public tunnel means anyone on the internet can reach Jericho's address, so requests that come
through it are treated as strangers. A request counts as "through the tunnel" if it uses the
`calls.publicUrl` host name, carries a tunnel's forwarding headers, or names a host that isn't
this PC or your home network.

- **Only Twilio's call routes are open without the access token.** That means the voice answer
  (`/twilio/voice` and its follow-up `/twilio/gather`), the status callback (`/twilio/status`),
  and the call audio Twilio plays (`/twilio/audio/<id>`). Everything else needs
  `JERICHO_ACCESS_TOKEN`: the page, the API, memory, PC control and the settings. If no token
  is set, all of it is refused through the tunnel. Requests from this PC and your home network
  work as before.
- **Opening the page through the tunnel:** use `https://<your address>/?token=<your token>`
  once. The page remembers the token and gets a cookie (HttpOnly, Strict, Secure, 30 days) so
  its scripts and styles load. The cookie isn't the token itself. After 10 wrong tokens in 10
  minutes, that address is refused for the rest of the 10 minutes. A visit with no token at all
  doesn't count, so your phone can't lock itself out.
- **Every webhook must carry a valid Twilio signature** (`X-Twilio-Signature`, checked with
  `TWILIO_AUTH_TOKEN`). Unsigned requests are refused before the body is read; wrong
  signatures, changed parameters or a different URL are refused too (403). The call audio's
  address is an unguessable id that exists only during a call. If Twilio signs that fetch, the
  signature must be right too.
- **Rate limits on Twilio's routes:** `calls.webhookRequestsPerMinute` per address (default
  120, far more than a call needs). After 5 bad signatures in 10 minutes, an address is
  refused for 10 minutes (429). The call limits still apply: `maxCallsPerDay`,
  `maxCallsPerNumberPerDay`, `maxMinutes` (enforced by Twilio itself), plus the read-back and
  your yes before every call.
- **Jericho has no media-stream route.** Calls use Twilio's own speech recognition (`<Gather>`),
  not a live audio stream, so there's no WebSocket for anyone to reach.
- **Tailscale Funnel:** once your `*.ts.net` name is `calls.publicUrl`, it counts as the
  tunnel, even from your own devices. Use the token there too.
- Refusals are logged as `tunnel_refused`, `twilio_rejected` and `twilio_rate_limited`, without
  any token or key.

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

**The sound** (settings panel → Alarm sound, with **Preview** and **Stop preview**):
- **Missile strike** (default), built for realism and dread. One cycle (about 17 seconds):
  - **Five missiles**, impacts 1.35 seconds apart. Each starts as a faint, high scream far away that swells and drops in pitch as it passes (Doppler), with rushing air under it. Then the air is sucked out and there's half a second of near-silence (everything else drops to 3%) before the hit. No two missiles are the same: each has its own pitch, stereo path across the field, and distance (far ones are quieter, duller and wetter).
  - **Each impact** is layered: a sharp crack, a deep 50-to-30 Hz sub-bass thud, a heavy mid boom, a pressure-wave whump, a burst of debris and a long rumbling tail. It echoes through a big open city (a synthetic impulse-response reverb), and the echo grows longer with every hit. Distant secondary rumbles and falling-debris crackle follow. Every hit is heavier than the last; the 5th carries almost double the weight of the 1st, and the hits are the loudest moments.
  - **After the 3rd, 4th and 5th hits** your ears ring (a soft 4.6 to 7.4 kHz tone fading over a couple of seconds, never a harsh peak) and everything else is muffled for about a second, like a concussion.
  - **The air-raid siren** is completely silent until the 3rd impact. It's modelled on a mechanical rotary siren across the city: it spins up slowly from a low growl, with a heavy stacked sawtooth/square tone (plus an octave), a little motor noise and an uneven wobble, and plenty of distance echo. At the 4th and 5th hits it jumps higher and louder (up to about 1150 Hz), then holds at full for 7 seconds in long rising and falling swells, with rapid triple warning beeps, sonar pings and distant explosions bleeding underneath. Then it spins down into a short, tense silence, and the cycle repeats.
  - The power comes from low end, layering and contrast; the output ceiling is unchanged (measured peak 0.865 at 100% volume with Max loud).
- **Air raid siren**, **Sonar ping**, or **Classic beeps** (the old tone). If you'd picked the earlier "Missile alert", you get Missile strike now.
- Preview plays one whole cycle (about 15 seconds) at your current volume; Stop preview ends it.
- It starts at 60% of the alarm volume and ramps to full over 20 seconds, so it wakes you hard without a sudden blast, and each cycle hits harder than the last (with the other sounds: faster sweeps, pings and beeps the longer it rings).
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

- **Jericho stopped by itself?** Start it with **`npm run start:safe`** instead of `npm start`: if the server stops unexpectedly, it's started again (up to 5 times; the count resets after 10 minutes of running fine). Ctrl+C still stops it for good. Every start, exit, error and stop signal (with the reason and exit code) is written to **`logs/crash.log`**, and the console says plainly when the server is about to stop and why.
- **The startup self-test runs in its own process**, detached from the server's console window, with a 40-second limit, so a hanging or failing check (for example the Claude Code check) can never stop or slow the server. On Windows, a program sharing the console can deliver a Ctrl+C or Ctrl+Break to everything in it, which is what could silently end the server a few seconds after the self-test; the checks no longer share it. The Claude Code check is skipped (not run) if Claude Code isn't signed in, and is never retried.
- **On a weak laptop** (integrated graphics or software rendering): Auto quality starts at Low and steps up only if the frame rate stays high. Low skips the background grid, the wordmark's light sweep and the rotating glyphs. The 3D scene pauses when the tab is hidden.
- **While an alarm rings** the 3D scene drops to Low at 30 frames a second (back to your setting afterwards), the alarm screen uses no repaint-heavy effects, and if the graphics still can't keep up, the scene draws one frame a second so Stop, Snooze and "Jericho, stop" always answer right away.
- **Alarm performance** (settings panel): the alarm sound is pre-rendered once per cycle (off the page's main thread) and played as a single buffer, so ringing costs very little. **Full** has every layer and the city reverb; **Smooth** has fewer layers, a short echo instead of the reverb, and the same timing; **Auto** picks Smooth when the page runs under about 20 frames a second, the audio has underruns, or rendering the sound was slow. When an alarm is set, the first cycle is prepared ahead of time so it starts at once.
- **Health line** (settings panel): the frame rate, the quality level, and whether the alarm sound is Smooth. **Copy diagnostics** copies a short text summary (browser, graphics, quality, audio, alarm settings, recent page errors; no token, keys, links, labels or anything you said) to paste into a chat.

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
| `claude.model` / `claude.effort` | The strong model: `claude-opus-5-5` at `low` effort, which keeps spoken replies quick. |
| `claude.routing` | `auto` (default): simple requests go to `claude.fastModel`. `always-strong`: everything goes to the strong model. The sun panel's Brain setting overrides it per browser. |
| `claude.fastModel` / `claude.fastEffort` | The fast model for simple requests: `claude-haiku-5-5` at `low` effort. It never handles risky actions. |
| `claude.maxHistoryMessages` | After this many messages (default 40), the conversation starts fresh with a short recap. |
| `claude.stallApologySeconds` / `claude.stallAbortSeconds` | If Claude goes quiet: a short sorry after 12 seconds, and giving up after 40. |
| `claude.hardModel` / `claude.hardEffort` | The stronger model for hard questions: `claude-fable-5-2` at `high` effort. Jericho decides when to use it (a `deep_think` tool) and says "Let me think that through" first. |
| `claude.webSearch` | Lets Jericho look things up, such as a restaurant's number or hours. About 1 cent per search. |
| `claude.fallbacks` | On by default. If the main model declines a request on safety grounds, the API retries it on a fallback model inside the same call. Set to `false` to turn it off. |
| `lights.provider` / `lights.rooms` | `mock` for now. `hue` and `kasa` are stubs with setup notes inside. |
| `claudeCode.path` | Full path to `claude.exe` or `claude.cmd` (or its folder), if Jericho can't find it on its own. Empty = search automatically. |
| `claudeCode.projectsDir` | Claude Code only runs in folders inside this directory. |
| `claudeCode.permissionMode` | Passed to `claude --permission-mode`. `acceptEdits` lets it write files but not run arbitrary shell commands. Add `"extraArgs": ["--allowedTools", "Bash(npm *)"]` to allow specific commands. |
| `confirmation.yesWords` / `timeoutSeconds` | What counts as yes, and how long a risky action waits. |
| `calls.*` | Phone calls, see below. `testMode` is on by default. `webhookRequestsPerMinute` (120) limits Twilio's routes per address. |

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
server/net.js             keep-alive connections, DNS caching and warm-up pings
server/router.js          which model answers (fast for simple requests, strong otherwise)
server/quick.js           instant local commands: time, date, volume, snooze
server/static.js          static files: gzip, ETag, cache headers
public/latency.js         the per-turn latency stages, the 10-turn average, the readout
public/endpoint.js        when you've finished talking (sending early)
scripts/bench-latency.mjs measures real Claude latency for a few typical turns
server/calls/policy.js    what may be called: numbers, purposes, limits, safety screen
server/calls/agent.js     the Claude agent on the phone, and the pretend business for test mode
server/calls/manager.js   test calls, Twilio calls and webhooks, data/calls.json, announcements
server/tools/calls.js     make_call, call_owner ("call me"), contacts and recent_calls tools
server/contacts.js        data/contacts.json: save, find, delete contacts
server/calls/dnc.js       the do-not-call list (data/dnc.json) and the "stop calling" phrases
server/tools/deepThink.js sends hard questions, plans and decisions to the stronger model
server/tools/learning.js  save_lesson + what_ive_learned tools
server/tools/pc.js        PC control tools (apps, links, volume, media, timers, clipboard, files, commands)
server/pc/policy.js       what may be touched: allowed folders, secret files, blocked commands and apps
server/cancel.js          the kill switch: everything running registers here
server/tunnel.js          the public-tunnel gate: access token for everything but Twilio's routes
server/ratelimit.js       sliding-window rate limits (webhooks, wrong tokens)
scripts/calls-setup.mjs   `npm run calls:setup`: checks the call setup, prints the Twilio console settings
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
