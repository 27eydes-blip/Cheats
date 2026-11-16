// Hunt Racers store: the racing cosmetics catalog (skins, underglow, wheels, boost flames, horns,
// boost trails), prices in TEST coins / gems, the daily shop and the buy / equip rules. Shared by
// the server (authoritative: src/accounts.js through catalog.applyPurchase) and the client.
// Cosmetics never touch the race: physics, stats, weapons and hitboxes ignore all of this; the race
// server only forwards the equipped ids so every client can draw everyone's look.
// Every option object (`opt`) uses the shapes makeLook() in looks.js reads.
import { DRIVER_IDS } from './physics.js';
import { own } from '../shared.js';

export const RARITIES = ['common', 'rare', 'epic', 'legendary'];
export const RARITY = {
  common: { name: 'COMMON', col: '#a9a3b8' },
  rare: { name: 'RARE', col: '#3a9bff' },
  epic: { name: 'EPIC', col: '#b45cff' },
  legendary: { name: 'LEGENDARY', col: '#ffc42e' },
};
// equip slots per car, in wire order (the race roster carries them as an array in this order)
export const SLOTS = ['skin', 'glow', 'wheel', 'flame', 'trail', 'horn'];
export const SLOT_NAMES = { skin: 'SKIN', glow: 'UNDERGLOW', wheel: 'WHEELS', flame: 'BOOST FLAME', trail: 'BOOST TRAIL', horn: 'HORN' };
// list price by rarity: coins for common to epic, gems for legendary; skins cost a little more
const LIST = { common: ['coins', 150], rare: ['coins', 450], epic: ['coins', 1000], legendary: ['gems', 60] };
const SKIN_LIST = { rare: ['coins', 650], epic: ['coins', 1400], legendary: ['gems', 90] };
export const DAILY_OFF = 0.3; // the daily shop is 30% off
export const DAILY_SIZE = 6;
export const DAY_MS = 864e5;

const ITEMS_RAW = [];
const add = (kind, id, name, rarity, opt, car) => ITEMS_RAW.push({ id, kind, name, rarity, opt: Object.freeze(opt), ...(car ? { car } : {}) });

// ---- skins: per car two neon colour swaps and one animated legendary pattern
const SKIN_SET = {
  volt: [['arcwire_ultraviolet', 'Ultraviolet', 'rare', { neon: '#8a5cff', neon2: '#d9c9ff' }], ['arcwire_redline', 'Redline', 'epic', { neon: '#ff2d55', neon2: '#ffc2cc', body: '#1c0a10' }], ['arcwire_stormcore', 'Stormcore', 'legendary', { neon: '#2f9bff', neon2: '#ffffff', pattern: 'circuit' }]],
  brick: [['warhog_toxic', 'Toxic Waste', 'rare', { neon: '#7dff3a', neon2: '#e2ffc9' }], ['warhog_icebreaker', 'Icebreaker', 'epic', { neon: '#5fd8ff', neon2: '#e6faff', body: '#0b1620' }], ['warhog_magmaflow', 'Magma Flow', 'legendary', { neon: '#ff5a1a', neon2: '#ffd23f', pattern: 'flow' }]],
  wisp: [['phantom_aurora', 'Aurora', 'rare', { neon: '#5effa8', neon2: '#d6ffe9' }], ['phantom_bloodmoon', 'Blood Moon', 'epic', { neon: '#ff3355', neon2: '#ffd0d8', body: '#180a0e' }], ['phantom_specter', 'Specter Pulse', 'legendary', { neon: '#d8f8ff', neon2: '#8f5cff', pattern: 'pulse' }]],
  dune: [['sandviper_dusk', 'Dusk Rider', 'rare', { neon: '#ff9f43', neon2: '#ffe0bf' }], ['sandviper_reef', 'Reef Runner', 'epic', { neon: '#2ee6d6', neon2: '#c9fff9', body: '#081614' }], ['sandviper_goldscale', 'Goldscale', 'legendary', { neon: '#ffd23f', neon2: '#b6e62e', pattern: 'scales' }]],
  rook: [['cobra_venom', 'Venom', 'rare', { neon: '#3dff8f', neon2: '#d2ffe4' }], ['cobra_frostbite', 'Frostbite', 'epic', { neon: '#7fd4ff', neon2: '#eef9ff', body: '#0b1420' }], ['cobra_eclipse', 'Eclipse Hood', 'legendary', { neon: '#a64dff', neon2: '#ff3fa4', pattern: 'pulse' }]],
  flicker: [['razor_citrus', 'Citrus Edge', 'rare', { neon: '#ffe23a', neon2: '#fff6c2' }], ['razor_glacier', 'Glacier Blade', 'epic', { neon: '#5ff4ff', neon2: '#e3fdff', body: '#08141a' }], ['razor_prism', 'Prism Cut', 'legendary', { neon: '#ff3fa4', neon2: '#5ff4ff', pattern: 'flow' }]],
};
for (const car of DRIVER_IDS) for (const [id, name, r, opt] of SKIN_SET[car]) add('skin', id, name, r, opt, car);

// ---- underglow
for (const [id, name, r, color, style] of [
  ['glow_icewater', 'Ice Water', 'common', '#5ff4ff', 'pool'], ['glow_lime', 'Lime Light', 'common', '#7dff3a', 'pool'],
  ['glow_sunset', 'Sunset Twins', 'rare', '#ff7a1a', 'twin'], ['glow_violet', 'Violet Pool', 'rare', '#a64dff', 'pool'],
  ['glow_ghostmist', 'Ghost Mist', 'epic', '#d8f8ff', 'mist'], ['glow_crimson', 'Crimson Twins', 'epic', '#ff2d55', 'twin'],
  ['glow_goldrush', 'Gold Rush Mist', 'legendary', '#ffd23f', 'mist'],
]) add('glow', id, name, r, { color, style });

// ---- wheel rims
for (const [id, name, r, rim, spokes] of [
  ['rim_chrome', 'Chrome Fives', 'common', '#e8eef8', 5], ['rim_mint', 'Mint Sixes', 'common', '#4be0c8', 6],
  ['rim_blaze', 'Blaze Star', 'rare', '#ff7a1a', 5], ['rim_violet', 'Violet Mesh', 'rare', '#b48cff', 8],
  ['rim_tri', 'Tri-Blade', 'epic', '#ff3fa4', 3], ['rim_goldspin', 'Gold Spinners', 'legendary', '#ffd23f', 7],
]) add('wheel', id, name, r, { rim, spokes });

// ---- boost flames
for (const [id, name, r, core, outer] of [
  ['flame_blue', 'Blue Jet', 'common', '#e8fbff', '#2f9bff'], ['flame_green', 'Green Burner', 'common', '#f4ffd0', '#4be06e'],
  ['flame_plasma', 'Plasma', 'rare', '#ffffff', '#a64dff'], ['flame_inferno', 'Inferno', 'rare', '#fff3b0', '#ff3d1f'],
  ['flame_frost', 'Frost Fire', 'epic', '#ffffff', '#5ff4ff'], ['flame_solar', 'Solar Flare', 'legendary', '#ffffff', '#ffd23f'],
]) add('flame', id, name, r, { core, outer });

// ---- boost trails
for (const [id, name, r, color, style] of [
  ['trail_white', 'White Line', 'common', '#ffffff', 'line'], ['trail_cyan', 'Cyan Line', 'common', '#5ff4ff', 'line'],
  ['trail_pink', 'Pink Ribbon', 'rare', '#ff3fa4', 'ribbon'], ['trail_lime', 'Lime Ribbon', 'rare', '#b6e62e', 'ribbon'],
  ['trail_gold', 'Gold Sparks', 'epic', '#ffd23f', 'sparks'], ['trail_comet', 'Comet Tail', 'legendary', '#a64dff', 'sparks'],
]) add('trail', id, name, r, { color, style });

// ---- horns: short original tones, synthesized (sound.js horn()). notes: [Hz, seconds] in order.
for (const [id, name, r, wave, notes] of [
  ['horn_beep', 'Double Beep', 'common', 'square', [[520, 0.1], [0, 0.05], [520, 0.14]]],
  ['horn_chirp', 'Chirp', 'common', 'triangle', [[620, 0.07], [880, 0.12]]],
  ['horn_hauler', 'Big Hauler', 'rare', 'sawtooth', [[147, 0.55]]],
  ['horn_arcade', 'Arcade Up', 'rare', 'square', [[523, 0.07], [659, 0.07], [784, 0.07], [1047, 0.14]]],
  ['horn_bubble', 'Bubble Pop', 'epic', 'sine', [[1200, 0.08], [900, 0.08], [680, 0.16]]],
  ['horn_siren', 'Night Siren', 'epic', 'triangle', [[700, 0.12], [950, 0.12], [700, 0.12], [950, 0.16]]],
  ['horn_victory', 'Victory Lap', 'legendary', 'square', [[392, 0.09], [523, 0.09], [659, 0.09], [784, 0.28]]],
]) add('horn', id, name, r, { wave, notes });

const priceFor = (it) => {
  const [cur, n] = (it.kind === 'skin' ? SKIN_LIST : LIST)[it.rarity] || LIST.common;
  return Object.freeze({ cur, n });
};
export const ITEMS = Object.freeze(Object.fromEntries(ITEMS_RAW.map((it) => [it.id, Object.freeze({ ...it, price: priceFor(it) })])));
export const ITEM_IDS = Object.keys(ITEMS);
export const itemsOf = (kind, car = null) => ITEM_IDS.map((id) => ITEMS[id]).filter((it) => it.kind === kind && (!car || !it.car || it.car === car));
export const itemOf = (id) => own(ITEMS, id) || null;

// ---------------------------------------------------------------- daily shop
export const shopDay = (now = Date.now()) => Math.floor(now / DAY_MS);
export const msToShopRefresh = (now = Date.now()) => DAY_MS - (((now % DAY_MS) + DAY_MS) % DAY_MS);
export const dealPrice = (p) => Object.freeze({ cur: p.cur, n: p.cur === 'gems' ? Math.max(1, Math.round(p.n * (1 - DAILY_OFF))) : Math.max(10, Math.round((p.n * (1 - DAILY_OFF)) / 10) * 10) });
// 6 items for a UTC day, the same for everyone and fixed for that day: one featured skin (epic or
// legendary), two more skins, three other cosmetics of different kinds
export function dailyShop(day = shopDay()) {
  let s = (Math.imul(day | 0, 2654435761) ^ 0x5bd1e995) >>> 0;
  const rnd = (n) => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) % n; };
  const take = (list) => list.splice(rnd(list.length), 1)[0];
  const skins = itemsOf('skin'), big = skins.filter((it) => it.rarity === 'epic' || it.rarity === 'legendary');
  const out = [take(big)];
  const rest = skins.filter((it) => it !== out[0]);
  out.push(take(rest), take(rest));
  const kinds = ['glow', 'wheel', 'flame', 'trail', 'horn'];
  for (let i = 0; i < 3; i++) out.push(take(itemsOf(take(kinds))));
  return out.map((it) => Object.freeze({ id: it.id, price: dealPrice(it.price), was: it.price }));
}

// ---------------------------------------------------------------- ownership and equipping
export const owns = (p, id) => !!itemOf(id) && Array.isArray(p.owned) && p.owned.includes(id);
// the equipped ids for one car, only those still valid and owned (null = the car's default)
export function equippedOf(p, car) {
  const raw = p && p.race && p.race.cos && typeof p.race.cos === 'object' ? own(p.race.cos, car) : null;
  const out = {};
  for (const slot of SLOTS) {
    const id = raw && typeof raw === 'object' ? own(raw, slot) : null, it = itemOf(id);
    out[slot] = it && it.kind === slot && (!it.car || it.car === car) && owns(p, id) ? id : null;
  }
  return out;
}
// the race roster carries this per racer: SLOTS order, 0 = default (short on the wire)
export const cosRow = (p, car) => { const e = equippedOf(p, car); return SLOTS.map((s) => e[s] || 0); };
// ids (object by slot, or a roster row) -> option objects for makeLook(car, opts) (+ horn)
export function resolveCos(ids, car = null) {
  const out = { skin: null, glow: null, wheel: null, flame: null, trail: null, horn: null };
  if (!ids) return out;
  SLOTS.forEach((slot, i) => {
    const it = itemOf(Array.isArray(ids) ? ids[i] : own(ids, slot));
    if (it && it.kind === slot && (!car || !it.car || it.car === car)) out[slot] = it.opt;
  });
  return out;
}

// buy / equip (server-authoritative; same code on the client for display). -> {progress} | {error}
//   {action: 'gbuy', id, daily?: true}   buy at the list price, or at today's daily shop price
//   {action: 'gequip', car, slot, id}    id null = back to the car's default
export function garageAction(p, req, now = Date.now()) {
  if (req.action === 'gbuy') {
    const it = itemOf(req.id);
    if (!it) return { error: 'not for sale' };
    if (owns(p, it.id)) return { error: 'already owned' };
    let price = it.price;
    if (req.daily) {
      const deal = dailyShop(shopDay(now)).find((d) => d.id === it.id);
      if (!deal) return { error: 'That deal has ended: the daily shop just refreshed' };
      price = deal.price;
    }
    const have = price.cur === 'gems' ? p.gems | 0 : p.coins | 0;
    if (have < price.n) return { error: price.cur === 'gems' ? 'Not enough gems (test)' : 'Not enough coins (test)' };
    if (price.cur === 'gems') p.gems -= price.n; else p.coins -= price.n;
    p.owned.push(it.id);
    return { progress: p, price };
  }
  if (req.action === 'gequip') {
    const { car, slot } = req, id = req.id || null;
    if (!DRIVER_IDS.includes(car)) return { error: 'bad car' };
    if (!SLOTS.includes(slot)) return { error: 'bad slot' };
    if (id) {
      const it = itemOf(id);
      if (!it || it.kind !== slot) return { error: 'wrong item for that slot' };
      if (it.car && it.car !== car) return { error: 'that skin is for another car' };
      if (!owns(p, id)) return { error: 'not owned' };
    }
    p.race = p.race && typeof p.race === 'object' ? p.race : {};
    p.race.cos = p.race.cos && typeof p.race.cos === 'object' ? p.race.cos : {};
    const cur = own(p.race.cos, car);
    p.race.cos[car] = { ...(cur && typeof cur === 'object' ? cur : {}), [slot]: id };
    return { progress: p };
  }
  return { error: 'unknown action' };
}
