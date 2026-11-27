# The Reaping Floor

A dark, single-player dynasty sports game for phones (works on desktop too). One file: `index.html`.
No libraries, no network calls, no image, font or audio files: every crest, the logo, the arena and the
music are drawn or synthesized at runtime.

Open `index.html` in a browser. Tap to begin (this unlocks audio), pick one of fifty cities, and play.

## The sport: SLAM

Five a side on a walled 40 x 90 yard floor with one hoop per team.

- **Score:** dunk inside the ring = 2, mid shot = 3, deep shot past the ash line = 5.
- **Chain:** carry (C), throw (T), kick (K) and wall bounce (W) in one possession multiply the score (x1 to x4).
- **Pulse:** hold the ball 3 seconds and it pops loose.
- **ON FIRE:** two scores in a row: +10% accuracy, +7% speed until the other team scores.
- **Checks** strip the carrier; **fouls** cost 30 seconds in the sin bin.
- **Fury** (the Scrap and the Ruins): fills as you take hits and concede; 10 seconds of red rage.

Controls: left thumb moves (the stick appears where you touch). SHOOT (it checks when you defend), THROW, KICK,
CHECK, SWITCH, and pause. Push the stick at a side wall while passing to bank it off the boards.
Keyboard: WASD/arrows, J shoot, K throw, L kick, `;` check, Q switch, P/Esc pause.

## Dynasty

16-game seeded schedule, an 8-team bracket ending in The Grand Slam, 18-man rosters with salaries under a
district cap (Citadel 250M down to Ruins 40M), a yearly draft with fuzzy scouting and a lottery that favours the
poor districts, free agency where rich teams can outbid you, aging and progression, promotion and relegation
between districts, a one-per-year player creator, and the Uprising meter whose story ends with the wall coming
down. Saved in `localStorage` under `slamline_dynasty_v2` (a v1 save is migrated automatically).

## Code layout

`index.html` holds one `<style>` and one `<script>`. The script has two marked sections:

- `//==ENGINE START` ... `//==ENGINE END`: the sport simulation, AI, quick-sim and all dynasty logic. No DOM.
- `//==UI START` ... `//==UI END`: canvas art, WebAudio, menu screens, the game renderer and input.

## Tests

```
node reaping-floor/tests/engine.test.mjs           # AI vs AI on all quarter lengths, OT, balance, 3-year dynasty, saves
node reaping-floor/tests/engine.test.mjs --quick
node reaping-floor/tests/shots.mjs [outDir]        # headless Chrome 390x780 @2x screenshots + console-error check
```
