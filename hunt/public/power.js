// BRAWLER POWER 1-11 (per brawler), bought with coins earned by playing (test currency only; nothing
// that affects combat can ever be bought with real money). Each level adds 4% HP and damage.
// Power 7 unlocks a GADGET (an active ability, 3 uses per match); Power 9 a STAR POWER (passive).
// Each brawler has two of each to choose from. Shared by the server (authoritative) and the client.
import { BRAWLER_IDS } from './shared.js';

export const MAX_POWER = 11;
export const GADGET_AT = 7, STAR_AT = 9, GADGET_USES = 3;
// coins to go from level L to L+1 (index L); 4,100 coins from 1 to 11
export const POWER_COST = [0, 40, 70, 110, 160, 230, 320, 440, 590, 780, 1000];
export const clampPower = (L) => Math.max(1, Math.min(MAX_POWER, L | 0 || 1));
export const powerMult = (L) => 1 + 0.04 * (clampPower(L) - 1);
// matchmaking brackets: players meet others of a similar power level
export const powerBracket = (L) => { L = clampPower(L); return L <= 3 ? 1 : L <= 6 ? 2 : L <= 8 ? 3 : 4; };

// fx (gadgets): dash px | slowAoe [radius, s] | armor [less damage, s] | knockAoe [radius, damage]
//   | cloak s | revealAoe [radius, s] | heal (share of max HP) | mine | pull radius
export const GADGETS = {
  volt: [
    { id: 'volt_surge', name: 'Surge Step', desc: 'Dash a short way where you aim.', fx: { dash: 200 } },
    { id: 'volt_jolt', name: 'Jolt Field', desc: 'Slow enemies near you for 1.5s.', fx: { slowAoe: [230, 1.5] } },
  ],
  brick: [
    { id: 'brick_iron', name: 'Iron Skin', desc: 'Take 30% less damage for 2.5s.', fx: { armor: [0.3, 2.5] } },
    { id: 'brick_pound', name: 'Ground Pound', desc: 'Shove enemies near you away (400 damage).', fx: { knockAoe: [190, 400] } },
  ],
  wisp: [
    { id: 'wisp_vanish', name: 'Vanish', desc: 'Turn invisible for 1.5s.', fx: { cloak: 1.5 } },
    { id: 'wisp_mark', name: "Hunter's Mark", desc: 'Reveal enemies within 900 for 3s, even in bushes.', fx: { revealAoe: [900, 3] } },
  ],
  dune: [
    { id: 'dune_mend', name: 'Sand Mend', desc: 'Heal 20% of your HP.', fx: { heal: 0.2 } },
    { id: 'dune_sink', name: 'Quicksand', desc: 'Slow enemies near you for 2s.', fx: { slowAoe: [260, 2] } },
  ],
  rook: [
    { id: 'rook_trap', name: 'Spring Trap', desc: 'Drop a trap at your feet.', fx: { mine: 1 } },
    { id: 'rook_hook', name: 'Chain Hook', desc: 'Pull the nearest enemy within 420 toward you.', fx: { pull: 420 } },
  ],
  flicker: [
    { id: 'flicker_blink', name: 'Blink Step', desc: 'Dash a short way where you aim.', fx: { dash: 230 } },
    { id: 'flicker_smoke', name: 'Smoke Veil', desc: 'Turn invisible for 1s and heal 10%.', fx: { cloak: 1, heal: 0.1 } },
  ],
};
// fx (star powers): speed / reload / charge (super) multipliers, armor (damage taken multiplier),
//   lowHeal (heal once under 25% HP), killHeal (heal on a takedown)
export const STARS = {
  volt: [
    { id: 'volt_overclock', name: 'Overclock', desc: 'Reload 10% faster.', fx: { reload: 1.1 } },
    { id: 'volt_boots', name: 'Spark Boots', desc: 'Move 6% faster.', fx: { speed: 1.06 } },
  ],
  brick: [
    { id: 'brick_bulwark', name: 'Bulwark', desc: 'Take 8% less damage.', fx: { armor: 0.92 } },
    { id: 'brick_wind', name: 'Second Wind', desc: 'Heal 25% once when you drop under 25% HP.', fx: { lowHeal: 0.25 } },
  ],
  wisp: [
    { id: 'wisp_ghost', name: 'Ghost Step', desc: 'Move 6% faster.', fx: { speed: 1.06 } },
    { id: 'wisp_focus', name: 'Cold Focus', desc: 'Your super charges 15% faster.', fx: { charge: 1.15 } },
  ],
  dune: [
    { id: 'dune_drift', name: 'Drifter', desc: 'Move 6% faster.', fx: { speed: 1.06 } },
    { id: 'dune_storm', name: 'Storm Heart', desc: 'Your super charges 15% faster.', fx: { charge: 1.15 } },
  ],
  rook: [
    { id: 'rook_will', name: 'Iron Will', desc: 'Take 8% less damage.', fx: { armor: 0.92 } },
    { id: 'rook_scavenge', name: 'Scavenger', desc: 'Heal 15% when you take someone down.', fx: { killHeal: 0.15 } },
  ],
  flicker: [
    { id: 'flicker_shadow', name: 'Shadow Step', desc: 'Move 6% faster.', fx: { speed: 1.06 } },
    { id: 'flicker_instinct', name: 'Killer Instinct', desc: 'Reload 10% faster.', fx: { reload: 1.1 } },
  ],
};
export const gadgetOf = (brawler, id) => (GADGETS[brawler] || []).find((g) => g.id === id) || null;
export const starOf = (brawler, id) => (STARS[brawler] || []).find((g) => g.id === id) || null;

// the account's power setup for every brawler, validated (what the match server applies)
export function powerSetup(p) {
  const out = {};
  for (const b of BRAWLER_IDS) {
    const L = clampPower(p.power?.[b] || 1);
    const g = L >= GADGET_AT ? gadgetOf(b, p.gadget?.[b]) || GADGETS[b][0] : null;
    const s = L >= STAR_AT ? starOf(b, p.star?.[b]) || STARS[b][0] : null;
    out[b] = { power: L, gadget: g ? g.id : null, star: s ? s.id : null };
  }
  return out;
}
// shop actions (run server-side for accounts)
export function powerAction(p, req) {
  const b = req.brawler;
  if (!BRAWLER_IDS.includes(b)) return { error: 'bad brawler' };
  p.power ||= {}; p.gadget ||= {}; p.star ||= {};
  const L = clampPower(p.power[b] || 1);
  if (req.action === 'upgrade') {
    if (L >= MAX_POWER) return { error: 'Already max power' };
    const cost = POWER_COST[L];
    if (p.coins < cost) return { error: `Need ${cost} coins` };
    p.coins -= cost; p.power[b] = L + 1;
    return { progress: p };
  }
  if (req.action === 'gadget') {
    if (L < GADGET_AT) return { error: `Reach Power ${GADGET_AT} first` };
    if (!gadgetOf(b, req.id)) return { error: 'bad gadget' };
    p.gadget[b] = req.id; return { progress: p };
  }
  if (req.action === 'star') {
    if (L < STAR_AT) return { error: `Reach Power ${STAR_AT} first` };
    if (!starOf(b, req.id)) return { error: 'bad star power' };
    p.star[b] = req.id; return { progress: p };
  }
  return { error: 'unknown action' };
}
