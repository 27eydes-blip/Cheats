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

## Settings (`settings.json`)

None of these are secret. Keys live only in `.env`.

| Setting | What it does |
|---|---|
| `elevenlabs.voiceId` | The ElevenLabs voice. Copy any voice ID from your ElevenLabs Voices page. Changes apply on the next reply, no restart needed. |
| `elevenlabs.modelId` | `eleven_flash_v2_5` is the fastest. Use `eleven_multilingual_v2` for higher quality but more delay. |
| `conversationTimeoutSeconds` | How long Jericho keeps listening without the wake word after you or it last spoke. Default 30. A pending yes/no question waits its own 60 seconds. |
| `endPhrases` | Phrases that end the conversation right away. Add your own. |
| `wakeWords` | Words that wake the assistant: "jericho", "jer" and common mishearings ("jerico", "jerry co", "jerr"…). Add more to the array any time; a space also matches a hyphen or no gap, so "jerry co" covers "jerry-co" and "jerryco". Whole words only: "Jerry", "Jeremy" and "jersey" don't trigger it. Reload the page after editing. |
| `claude.model` / `claude.effort` | Default is `claude-opus-5-5` at `low` effort, which keeps spoken replies quick. Raise effort to `medium` if answers feel too shallow. |
| `claude.fallbacks` | On by default. If the main model declines a request on safety grounds, the API retries it on a fallback model inside the same call. Set to `false` to turn it off. |
| `lights.provider` / `lights.rooms` | `mock` for now. `hue` and `kasa` are stubs with setup notes inside. |
| `claudeCode.projectsDir` | Claude Code only runs in folders inside this directory. |
| `claudeCode.permissionMode` | Passed to `claude --permission-mode`. `acceptEdits` lets it write files but not run arbitrary shell commands. Add `"extraArgs": ["--allowedTools", "Bash(npm *)"]` to allow specific commands. |
| `confirmation.yesWords` / `timeoutSeconds` | What counts as yes, and how long a risky action waits. |

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
public/                   the web page (index.html, app.js, visualizer.js, style.css)
public/memory.html, memory.js  the /memory page
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
