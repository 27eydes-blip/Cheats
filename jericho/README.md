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

Needs Node 20.12 or newer.

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
refused. Don't expose Jericho to the internet without a token: anyone who can reach it can run
Claude Code on your laptop once they say "yes".

Phone notes: tap **Start** each time you open the page, because phones only allow audio after a
tap. Keep the screen on, because phones stop listening when the screen locks. Android Chrome
may beep when it restarts listening.

## The visualizer

The circle in the middle is drawn live on a canvas:

- **Say Jericho** (waiting): small dim bars, the core breathes slowly.
- **Listening**: brighter core, the bars twitch with your microphone. On phones, the bars react
  to what speech recognition hears instead, because a second mic stream can upset recognition.
- **Thinking**: the outer ring spins faster and the bars ripple round the circle.
- **Speaking**: the bars and core follow Jericho's actual ElevenLabs audio, through a Web Audio
  analyser. With the browser's built-in voice there's no audio to measure, so they pulse smoothly.

With "reduce motion" switched on in your phone or computer settings, it moves slower and less.

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

Risky today: `claude_code` and `calendar_add_event`, because it can email invites. When you add a
tool that deletes files, runs shell commands, spends money or sends messages, set `risky: true`.

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
server/style.js           the after-conversation call that updates style notes
server/secrets.js         detects passwords, keys, card and ID numbers
server/speech.js          sentence splitter + clean-up for natural speech
server/net.js             keep-alive connections and warm-up pings
server/calls/policy.js    what may be called: numbers, purposes, limits, safety screen
server/calls/agent.js     the Claude agent on the phone, and the pretend business for test mode
server/calls/manager.js   test calls, Twilio calls and webhooks, data/calls.json, announcements
server/tools/calls.js     make_call + recent_calls tools
server/tools/deepThink.js sends hard questions to the stronger model
public/                   the web page (index.html, app.js, visualizer.js, style.css)
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
