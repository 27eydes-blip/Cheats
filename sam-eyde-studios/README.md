# Sam Eyde Studios

A private, mobile-first recording studio that runs entirely in the browser
(Vite + React + TypeScript + Web Audio). There is no backend and no account:
every project and recording stays in the browser's storage on your own device.

## Run it

```bash
cd sam-eyde-studios
npm install
npm run dev        # local development (prints a URL you can open)
npm run build      # production build in dist/
npm run preview    # serve the production build
```

The microphone only works on `https://` (or `localhost`), so to use it on an
iPhone, host the `dist/` folder on any static HTTPS host and open that URL in
Safari. Then use **Share → Add to Home Screen** to install it as "SE Studios";
installed, it works offline and iOS keeps its storage.

## What's inside

| Folder | What it does |
| --- | --- |
| `src/audio` | Engine (transport, playback, metronome), mic recorder, shared mix graph |
| `src/autotune` | YIN pitch detection, scale snapping, TD-PSOLA, Web Worker + cache |
| `src/effects` | Vocal effect chain, presets, generated reverb, master bus |
| `src/export` | Offline render, WAV + MP3 encoders, save / share |
| `src/storage` | IndexedDB projects + audio, single-file backup / restore |
| `src/studio` | Controller and project session (autosave) tying it together |
| `src/ui` | React components |

## Tests

```bash
npm test                              # DSP unit tests (vitest)
npm run build && npm run preview &    # then, with Playwright installed globally:
NODE_PATH=$(npm root -g) node tests/e2e/phase1.mjs   # … phase2 – phase6
```

The end-to-end scripts drive a phone-sized Chromium with a fake microphone.
