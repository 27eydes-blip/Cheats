# Glydrunner

An endless side-scrolling runner spin-off of **Glydrift**, starring Volt the Storm Bird. It's one self-contained file (`index.html`) with no build step and no image assets.

## Controls
| Action | Touch | Keyboard |
|---|---|---|
| Jump | Tap | Space / ↑ / W |
| Glide | Hold, in the air | Hold Space |
| Pause | ⏸ button | P / Esc |
| Retry | Tap anywhere after a crash | Space |
| Mute | Pause menu | M |

## Biomes (switch every 1000 m, then loop)
| Distance | Biome | New hazard |
|---|---|---|
| 0–999 m | Sky Meadow | **Thorn seeds** roll toward you. Jump them. |
| 1000–1999 m | Sunset Canyon | **Mesa hops**: chains of 2–4 stepping stones over a chasm, with no rest between hops. |
| 2000 m + | Neon Night | **Pulse orbs** bob on a rail. Jump them when they're low, run under them when they're high. |

Every biome also has spikes, gaps, low ceilings, floating walls (glide over) and wide pits (glide across).
The level generator simulates the real jump and glide physics for every obstacle, including moving ones, so every layout can be cleared.

## Glydrift look
Glydrunner uses Glydrift's art (source: `glydrift/` on the `feature/levels` branch, and the `gh-pages` build):
- **Volt sprite and coin sprite** are copied verbatim from `glydrift/src/pixel/common.js` and `px.js`, with the same `PixelCanvas`, dark outline and white rim.
- **Fonts:** Orbitron (titles), Rajdhani (numbers and body text), Silkscreen (buttons).
- **Colors:** Glydrift's UI tokens: cyan `#3ef4ff`, mint, lavender and gold `#ffc83d`. Hazards use the danger colors red `#ff2a3d`, orange `#ff6a1a` and pink `#ff2d78`.
- **Hazard style:** dark body, inner tint, neon outline, soft glow and a white core line.
- **Backdrop:** dark skies, a pixel city skyline and a Tron grid in Neon Night.

## Juice
- Squash and stretch on jump and landing (a spring that wobbles; harder landings squash more).
- A glide trail: a ribbon in Volt's trail colors plus pixel sparkles and gold bolt sparks.
- Coin pickups: a burst and a ring, a chime that rises in pitch with each coin in a streak, and a bump on the HUD counter.
- On death: a hit-stop, a white flash, screen shake, a feather burst and a vibration on phones.
- Quick restart: a tap from about 0.3 s after a crash restarts the run.
- Three parallax layers per biome (far sky, mid silhouettes, near details), crossfading between biomes, plus a biome banner.

## Development
- `?bot=1` starts a run with the autopilot that also plays the attract mode.
- The best score is kept in `localStorage` (`glydrunner.best`).
