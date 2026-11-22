# Jarvis

A personal voice assistant that runs on your laptop. Open the page, tap **Start**, and say
"Jarvis, turn on the kitchen lights".

```
 Browser (laptop or phone)               Node server (your laptop)
 ┌──────────────────────────┐            ┌─────────────────────────────────────┐
 │ Ears: Web Speech API     │  /api/ask  │ Brain: Claude API + tool loop       │
 │  wake word "Jarvis"      ├───────────►│ Safety: risky tools wait for "yes"  │
 │ Mouth: <audio> stream    │◄───────────┤ Hands: lights, Claude Code,         │
 │  fallback: browser voice │  /api/tts  │        calendar*, music* (*stubs)   │
 └──────────────────────────┘            │ Voice: ElevenLabs (key stays here)  │
                                         │ Log:   logs/actions.log             │
                                         └─────────────────────────────────────┘
```

## Run it

Needs Node 20.12 or newer.

```bash
cd jarvis
npm install
cp .env.example .env      # then paste your ANTHROPIC_API_KEY and ELEVENLABS_API_KEY
npm start
```

Open **http://localhost:3000** in Chrome or Safari, tap **Start**, allow the microphone and say
**"Jarvis"**. You'll hear a beep. Then say what you want. You can also say it in one go:
"Jarvis, turn off the bedroom lights". The text box at the bottom works too, which is handy if
speech recognition misbehaves.

Try:

- "Jarvis, turn on the kitchen lights": the terminal prints `💡 [MOCK LIGHTS] kitchen -> ON`.
- "Jarvis, build a tic tac toe game in a folder called tic-tac-toe": Jarvis asks you to confirm,
  you say "yes", Claude Code runs in `~/jarvis-projects/tic-tac-toe`, and Jarvis tells you when
  it's done. This needs the [Claude Code CLI](https://code.claude.com) installed and logged in.
- "Jarvis, what's on my calendar tomorrow?": Jarvis says the calendar isn't connected yet.

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

Set `JARVIS_ACCESS_TOKEN` in `.env` before you do either, then open the page once as
`https://…/?token=<your token>`. The phone remembers it, and every API call without it gets
refused. Don't expose Jarvis to the internet without a token: anyone who can reach it can run
Claude Code on your laptop once they say "yes".

Phone notes: tap **Start** each time you open the page, because phones only allow audio after a
tap. Keep the screen on, because phones stop listening when the screen locks. Android Chrome
may beep when it restarts listening.

## Settings (`settings.json`)

None of these are secret. Keys live only in `.env`.

| Setting | What it does |
|---|---|
| `elevenlabs.voiceId` | The ElevenLabs voice. Copy any voice ID from your ElevenLabs Voices page. Changes apply on the next reply, no restart needed. |
| `elevenlabs.modelId` | `eleven_flash_v2_5` is the fastest. Use `eleven_multilingual_v2` for higher quality but more delay. |
| `wakeWords` | Words that count as "Jarvis". Add the ones the browser mishears it as. |
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
- When Claude picks a risky tool, nothing runs yet. Jarvis says what it's about to do ("Should I
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
public/                   the web page (index.html, app.js, style.css)
test/brain.test.js        offline tests with a fake Claude client
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
