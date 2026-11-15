// Heroes that can be switched off without deleting them (their code and art stay in the game).
//
// WASP LORD is OFF (15 Nov 2026): he's out of the shop, the Heroes screen, the locker, spins,
// rewards and reveals, nobody can fly as him, and the server rejects his scores
// (supabase/migrations/20261116000001_wasp_lord_off.sql). Players who bought him get their
// 55,000 coins back once (see waspRefund.js). To bring him back: set `wasplord: true` here AND
// switch him on in the server's glydrift_hero_switches table.
//
// Test builds can switch him on with ?wasplord, so his own tests keep running.
import { TEST } from "../systems/testFlags.js";

export const HERO_SWITCHES = {
  wasplord: TEST.on && typeof location !== "undefined" && new URLSearchParams(location.search).has("wasplord"),
};

/** Is this hero id switched on? (Heroes without a switch always are.) */
export const heroOn = (id) => HERO_SWITCHES[id] !== false;

export const WASP_REFUND = 55000;

/** The hero a player flew with most, among those they own (not a switched-off one). */
function mostPlayed(d) {
  const runs = d.stats?.heroRuns || {};
  let best = null;
  for (const [id, n] of Object.entries(runs))
    if (heroOn(id) && d.unlocked?.[id] && Number(n) > 0 && (!best || n > runs[best])) best = id;
  return best;
}

/**
 * Take switched-off heroes out of a save (on every load and every cloud merge). Never throws:
 * a damaged save just loses the hero. A save that owned WASP LORD is marked as owed his refund
 * (paid once, see waspRefund.js); his selection goes back to the player's usual hero.
 */
export function stripSwitchedOff(d) {
  if (!d || typeof d !== "object") return d;
  d.waspRefund = {
    owed: !!d.waspRefund?.owed,
    paid: !!d.waspRefund?.paid,
  };
  if (heroOn("wasplord")) return d;
  if (d.unlocked && typeof d.unlocked === "object" && "wasplord" in d.unlocked) {
    if (d.unlocked.wasplord && !d.waspRefund.paid) d.waspRefund.owed = true;
    delete d.unlocked.wasplord;
  }
  if (d.shards && typeof d.shards === "object") delete d.shards.wasplord;
  if (d.unlocked && typeof d.unlocked === "object") d.unlocked.volt = true;
  if (d.selected === "wasplord") d.selected = mostPlayed(d) || "volt";
  // his scores still waiting to upload: the server refuses them now, so they go
  if (Array.isArray(d.lbQueue))
    d.lbQueue = d.lbQueue.filter((op) => !(op && op.type === "score" && op.character === "wasplord"));
  if (d.ghostChar === "wasplord") d.ghostChar = "volt";
  if (d.daily && d.daily.ghostChar === "wasplord") d.daily.ghostChar = "volt";
  return d;
}
