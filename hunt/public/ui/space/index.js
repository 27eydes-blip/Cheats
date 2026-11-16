// Space lobby building blocks (phase 1: self-contained; the lobby wires them in later).
// Styles: ui/space/space.css (scoped to .sp). Fonts: loadSpaceFonts(). Live data: src/space-feed.js.
export { SpaceBackground } from './background.js';
export { createDock, DOCK_ITEMS } from './dock.js';
export { createCarousel, MODE_CARDS } from './carousel.js';
export { createHoloPad } from './pad.js';
export { createCrew } from './pods.js';
export { createLaunch } from './launch.js';
export { createMissionOrbit } from './orbit.js';
export { createRadar } from './radar.js';
export { createTicker } from './ticker.js';
export { tickerItems, tickItems, fmtCount, fmtCountdown, fmtLap } from './feed-items.js';
export { lightSweep, slideIn } from './transition.js';
export { chime, CHIME_IDS } from './chimes.js';
export { startAmbient, stopAmbient, duckAmbient, setAmbientVolume, ambientPlaying, ambientDucked, ambientLevel } from './ambient.js';
export { startPresence, fetchFeed } from './presence.js';
export { loadSpaceFonts } from './fonts.js';
export { applyQuality, quality } from './quality.js';
export { spIcon } from './icons.js';
export { createHexBadge } from './badges.js';
export { onFrame, offFrame } from './loop.js';
