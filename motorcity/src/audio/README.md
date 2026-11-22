# audio/

All sound for Motor City 1915 is synthesized with the Web Audio API. There are no audio files and no dependencies.

```ts
import { audio } from './audio/audio';

// 1. From the first user gesture (tap/click/keydown). Calling it again is safe.
button.addEventListener('pointerdown', () => audio.init());

// 2. Every frame (60 Hz). These calls only ramp AudioParams.
const gear = audio.engine(speedPct, { on, boost, offroad, spin }); // returns 1..4
audio.skid(skidAmount);   // 0..1
audio.crowd(crowdAmount); // 0..1
audio.rivals(nearPct);    // 0..1
audio.rain(isRaining);    // boolean; it only does work when the value changes

// 3. One-shots
audio.horn(); audio.backfire(); audio.crash(); audio.bump(); audio.scrape();
audio.cheer(); audio.whinny(); audio.clop(); audio.trolleyBell(); audio.steam();
audio.countdown(false); audio.countdown(true); audio.click(); audio.coin(); audio.gearShift();

// 4. Music: 'title' | 'race' | 'results' | 'garage' | 'night' | null
audio.music('race');         // crossfades from the current track
audio.musicEnabled = false;  // mutes the music bus and stops scheduling notes

// 5. Mixing and lifecycle
audio.setVolumes(master, sfx, music); // each 0..1
document.addEventListener('visibilitychange', () =>
  document.hidden ? audio.suspend() : audio.resume());
```

## Notes

- **Before `init()`** every method is a no-op. `engine()` still returns the correct gear, because the gearbox model does not depend on audio. A `music(id)` or `rain(on)` call made before `init()` is remembered and starts when `init()` runs.
- **iOS:** `init()` creates the context (with a `webkitAudioContext` fallback), resumes it and plays a silent buffer to unlock audio. After init, any `pointerdown`, `touchend` or `keydown` re-resumes a context that iOS interrupted, unless the game called `suspend()` itself.
- **Gears:** gear bands by `speedPct` are 0–0.24, 0.24–0.48, 0.48–0.73 and 0.73–1, with hysteresis. Within a gear the RPM climbs, then drops at each shift. `engine()` plays the shift clunk and a rev dip by itself. Call `gearShift()` only for extra or manual shifts.
- **Mix chain:** sfx bus and music bus → master gain → DynamicsCompressor → destination. One-shots are rate-limited per effect, and at most about 14 overlap; the horn, crash, cheer, countdown and similar effects get priority.
- **Music:** original ragtime pieces, generated from a fixed seed for each id. The form is intro, A A B B A, then a trio in the subdominant played twice (C C), and it loops back to A. Notes are scheduled 150 ms ahead by a 25 ms interval timer. The piano voice is capped at 24 voices, sounds like an old upright through a gramophone, and has surface crackle.

## Files

| file | contents |
|---|---|
| `audio.ts` | public API (`audio`, `Audio`, `MusicId`) |
| `core.ts` | context lookup, cached noise buffers and shaper curves, node helpers, `ParamCache` |
| `engine.ts` | `GearBox`, the player engine voice, the rival engine bed |
| `layers.ts` | skid, crowd and rain beds |
| `sfx.ts` | one-shot effects |
| `music.ts` | ragtime generator, scheduler and piano voice |
