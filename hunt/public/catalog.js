// Cosmetics catalog + Hunt Pass.
// TEST CURRENCY ONLY: "Hunt Coins (test)". There are no real payments anywhere in the game.
// Cosmetics never touch gameplay: the server only forwards ids to clients for drawing;
// hitboxes and stats come from shared.js BRAWLERS + moveStats and ignore cosmetics.

export const CURRENCY = 'Hunt Coins (test)';
export const PREMIUM_PRICE = 950;
export const PASS_TIERS = 30;
export const PASS_XP_PER_TIER = 120;

// Skins: palette overrides + an accessory drawn on top. Two per brawler.
export const SKINS = {
  volt_storm: { brawler: 'volt', name: 'Stormcell', color: '#b48cff', dark: '#6a3fd0', accent: '#5ff4ff', acc: 'cloud', price: 400 },
  volt_solar: { brawler: 'volt', name: 'Solar Pop', color: '#ff9f43', dark: '#c4581a', accent: '#ff4d5e', acc: 'shades', price: 400 },
  brick_granite: { brawler: 'brick', name: 'Granite', color: '#9aa5b8', dark: '#5d6678', accent: '#2b4a7a', acc: 'moss', price: 400 },
  brick_magma: { brawler: 'brick', name: 'Magma Core', color: '#ff5a3c', dark: '#8a1f12', accent: '#2a1a1a', acc: 'horns', price: 500 },
  wisp_frost: { brawler: 'wisp', name: 'Frostveil', color: '#dff6ff', dark: '#8fc7e8', accent: '#4a7aff', acc: 'snowflake', price: 400 },
  wisp_ember: { brawler: 'wisp', name: 'Ember Shade', color: '#ffb36b', dark: '#c46a1a', accent: '#3a1f2e', acc: 'flame', price: 500 },
  dune_night: { brawler: 'dune', name: 'Night Dune', color: '#5b5fbf', dark: '#2e2f7a', accent: '#d9d9ff', acc: 'moon', price: 400 },
  dune_jade: { brawler: 'dune', name: 'Jade Oasis', color: '#5fd18b', dark: '#2a8a52', accent: '#ffd23f', acc: 'leaf', price: 400 },
  rook_arctic: { brawler: 'rook', name: 'Arctic Ops', color: '#eef6ff', dark: '#9fb6cc', accent: '#2bc4cf', acc: 'antenna', price: 400 },
  rook_rust: { brawler: 'rook', name: 'Rustbucket', color: '#c4703a', dark: '#7a3f1e', accent: '#4a4a5e', acc: 'bolt', price: 400 },
  flicker_neon: { brawler: 'flicker', name: 'Neon Fang', color: '#2b2b44', dark: '#141426', accent: '#5ff4ff', acc: 'visor', price: 500 },
  flicker_petal: { brawler: 'flicker', name: 'Petal Blade', color: '#ffb3d1', dark: '#d1588a', accent: '#ffffff', acc: 'flower', price: 400 },
};
export const KILL_FX = {
  sparks: { name: 'Sparks', price: 250 }, stars: { name: 'Starburst', price: 300 }, confetti: { name: 'Confetti', price: 300 },
  ghost: { name: 'Little Ghost', price: 350 }, bolt: { name: 'Thunder Mark', price: 350 },
};
export const TITLES = {
  tracker: 'Tracker', bounty_hunter: 'Bounty Hunter', apex: 'Apex Hunter', sharpshooter: 'Sharpshooter', night_owl: 'Night Owl',
  sand_strider: 'Sand Strider', crate_crusher: 'Crate Crusher', squad_leader: 'Squad Leader', unstoppable: 'Unstoppable', lay_low: 'Bush Whisperer',
};
export const TITLE_PRICE = 150;
// kept for the trophy road labels
export const CATALOG = { titles: TITLES, fx: Object.fromEntries(Object.entries(KILL_FX).map(([k, v]) => [k, v.name])), skins: SKINS };

// 30-tier pass. Each tier: one free + one premium reward.
const coins = (n) => ({ coins: n });
export const PASS = Array.from({ length: PASS_TIERS }, (_, i) => {
  const t = i + 1;
  const free = t % 10 === 0 ? { title: ['night_owl', 'crate_crusher', 'lay_low'][t / 10 - 1] } : t % 5 === 0 ? { fx: t === 5 ? 'confetti' : 'ghost' } : coins(t % 2 ? 40 : 60);
  const premSkins = ['dune_night', 'rook_rust', 'flicker_neon', 'brick_magma', 'wisp_ember', 'volt_solar'];
  const premium = t % 5 === 0 ? { skin: premSkins[t / 5 - 1] } : t === 3 ? { fx: 'bolt' } : t === 12 ? { title: 'sand_strider' } : t === 24 ? { title: 'unstoppable' } : coins(80);
  return { tier: t, free, premium };
});
export const passTier = (xp) => Math.min(PASS_TIERS, Math.floor((xp || 0) / PASS_XP_PER_TIER));
export const itemId = (r) => r.skin || r.fx || r.title || null;
export function priceOf(id) {
  if (SKINS[id]) return SKINS[id].price;
  if (KILL_FX[id]) return KILL_FX[id].price;
  if (TITLES[id]) return TITLE_PRICE;
  return null;
}
function grant(p, r) {
  if (r.coins) p.coins += r.coins;
  const id = itemId(r);
  if (id && !p.owned.includes(id)) p.owned.push(id);
}

// All progression-changing shop actions. Runs on the server for accounts (authoritative).
export function applyPurchase(p, req) {
  switch (req.action) {
    case 'equip': {
      const { slot, id } = req;
      if (!['title', 'fx'].includes(slot) && !/^skin:(volt|brick|wisp|dune|rook|flicker)$/.test(slot || '')) return { error: 'bad slot' };
      if (id) {
        if (!p.owned.includes(id)) return { error: 'not owned' };
        if (slot === 'title' && !TITLES[id]) return { error: 'not a title' };
        if (slot === 'fx' && !KILL_FX[id]) return { error: 'not an effect' };
        if (slot.startsWith('skin:') && SKINS[id]?.brawler !== slot.slice(5)) return { error: 'wrong brawler' };
      }
      p.equipped[slot] = id || null;
      return { progress: p };
    }
    case 'buy': {
      const price = priceOf(req.id);
      if (price == null) return { error: 'not for sale' };
      if (p.owned.includes(req.id)) return { error: 'already owned' };
      if (p.coins < price) return { error: `Not enough ${CURRENCY}` };
      p.coins -= price; p.owned.push(req.id);
      return { progress: p };
    }
    case 'premium': {
      if (p.pass.premium) return { error: 'already unlocked' };
      if (p.coins < PREMIUM_PRICE) return { error: `Not enough ${CURRENCY}` };
      p.coins -= PREMIUM_PRICE; p.pass.premium = true;
      return { progress: p };
    }
    case 'passClaim': {
      const t = req.tier | 0, track = req.track;
      const row = PASS[t - 1];
      if (!row || !['free', 'premium'].includes(track)) return { error: 'bad tier' };
      if (passTier(p.pass.xp) < t) return { error: 'tier locked' };
      if (track === 'premium' && !p.pass.premium) return { error: 'premium locked' };
      const key = `${track}:${t}`;
      if (p.pass.claimed.includes(key)) return { error: 'already claimed' };
      p.pass.claimed.push(key);
      grant(p, row[track]);
      return { progress: p };
    }
  }
  return { error: 'unknown action' };
}
