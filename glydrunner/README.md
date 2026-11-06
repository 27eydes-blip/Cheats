# Glydrunner

An endless side-scrolling runner set in the Glydrift universe. It's one self-contained file (`index.html`) with no build step: open it in a browser or serve the folder from any static host.

## Controls
| Action | Touch | Keyboard |
|---|---|---|
| Jump | Tap | Space / ↑ / W |
| Glide | Hold, in the air | Hold Space |
| Pause | ⏸ button | P / Esc |
| Mute | 🔊 button | M |

The glide meter shows above the bird, and it refills while the bird runs on the ground.

## Obstacles
- **Spikes**: jump over them.
- **Gaps**: jump the short ones. Wider pits only appear after about 140 m and need a glide.
- **Low ceilings**: hanging rocks that kill on touch, so don't jump under them.
- **Floating walls**: wide crystal slabs from about 100 m. A plain jump can't clear them, so glide across.

Coins are placed along the ideal jump or glide path for each obstacle.

## Notes for development
- All colors live in `THEME` (script) and the `:root` CSS variables. Fonts are in `--font`. Swap these to match Glydrift's palette.
- The level generator simulates the real jump and glide physics for each obstacle, so every layout can be cleared.
- `?bot=1` starts a run with the built-in autopilot. The same autopilot plays the attract mode behind the start screen.
- The best score is kept in `localStorage` (`glydrunner.best`).
