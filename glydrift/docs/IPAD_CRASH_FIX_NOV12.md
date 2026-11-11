# iPad crashes and invisible graphics: cause and fix (12 Nov 2026)

Branch `bugfix/ipad-context-loss`. Reports: players crashing at random scores (2K, 10K, 20K), mostly
on iPad; some saw everything go invisible while hazards still killed them.

## The cause

1. **iPads ran out of graphics memory.** On iPad the game needed an estimated ~200 MB of graphics memory
   (measured in the test browser; real iPads add their own overhead):
   - the canvas: 2.3 M pixels with 4x multisampling (antialias), ~55 MB;
   - the art: 58–70 MB of textures in a run, and Safari keeps a second copy of each one in the
     canvas it was drawn on;
   - every realm border briefly held **five** realms' art (the next realm was built the moment you
     crossed a border, ~4 s before the oldest one was freed);
   - the Abyss darkness overlay (4 MB) made at the start of every run;
   - temporary canvases from building art were only freed whenever the garbage collector ran.
   The peaks come at realm borders, so the crashes look random by score: they depend on where the
   borders fall in a run. (The SQL below shows which realms the iPad crashes cluster at.)
2. **When iOS took the WebGL context away, the game kept running.** The game only logged it: the run
   went on with nothing drawn, so the player died to hazards they couldn't see.
3. **When the context came back, the art came back blank.** Phaser re-uploads each texture from the
   canvas it was drawn on, but iOS wipes those canvases in the same GPU reset. The hero, hazards and
   scenery stayed invisible while their collisions still worked: the "everything invisible" reports.
   If memory stayed short, Safari then killed the page: the crash.

## The fix

1. **Less graphics memory on iPad** (`src/config.js`, `src/main.js`)
   - iPad canvas at most 2x, inside a 2.0 M pixel budget (large iPads draw a little below 2x):
     2.3 M → 2.0 M pixels on an 11" iPad.
   - No multisampled canvas on iPad (`antialiasGL: false`): about 35–40 MB saved. Textures keep
     their smooth filtering; only the edges of drawn shapes (button outlines) are a touch less soft.
   - iPads are detected even though iPadOS Safari says "Macintosh" (touch screen).
2. **Smaller memory spikes at realm borders** (`src/scenes/GameScene.js`, `src/pixel/px.js`,
   `src/pixel/hazardArt.js`)
   - The next realm's art is built once the oldest realm is freed: at most 4 realms in memory
     (was 5). Peak texture memory in a 30K run: 69.8 MB → 60.6 MB.
   - Freed realm art and every temporary canvas give their memory back at once (counts against
     Safari's canvas cap until then).
   - The Abyss darkness overlay is stored at 256×256 and drawn 4x (looks identical): 4 MB → 0.26 MB.
3. **Lost context: pause, rebuild, resume** (`src/systems/contextGuard.js`, `src/gfx/rebuildArt.js`)
   - The moment the context is lost the run pauses (the normal pause; the run is checkpointed) and a
     "Restoring graphics…" note shows.
   - When it's back, every texture is drawn again from scratch: all launch art and every realm in
     memory (same textures, fresh pixels), glows/particles/icons from a saved copy of their pixels,
     every text and tile sprite. Then the PAUSED menu shows: the player taps RESUME.
   - Not in a run: the open screen starts again.
4. **Can't recover: end safely** — no context after 8 s of the game on screen, or the rebuild fails:
   the run ends the normal way (score, coins and distance saved and sent to the leaderboard), a note
   says "Graphics were reset. Your run is saved. Restarting…", and the page reloads to the home screen.
5. **Crash reports** now name iPads "iPad" (they reported as "Mac") and log `contextlost`,
   `contextrebuild` and `contextgiveup`.

## Tests

`tests/e2e/context-loss.spec.js` (@smoke, all three browsers):
- mid-run in Sakura Skies: the context is lost → the run pauses at once, nothing moves for 2 s;
  every canvas is wiped (what iOS does), the context is restored → every texture is rebuilt (none
  missing), the frozen frame looks the same as before (without the rebuild 88% of the screen changes;
  with it a few cells where the rebuilt scenery placed its decorations differently), RESUME carries on;
- the context never comes back → after 8 s the run ends, the score is saved once, the page reloads
  to the home screen;
- lost on the home screen → comes back rebuilt.

## SQL (read-only)

`supabase/queries/ipad_crashes.sql`: what iPads hit, where in the run (realm + score band), lost
graphics by device, iPad vs everyone else since Sakura Skies.

## Still worth doing

- All pixel art is stored 4x upscaled (each art pixel is 4×4 texture pixels): 16x the memory it needs.
  Storing it 1x and drawing it at 4x (as the Abyss overlay now is) would cut ~55 MB of textures to
  ~4 MB, but it touches every sprite, tile sprite and the share card: a bigger, separate change.
