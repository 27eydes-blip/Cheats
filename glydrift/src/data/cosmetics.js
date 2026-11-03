// The coin shop: cosmetics (trails, death effects, hats, skins, flap effects, coin skins),
// the Daily Shop, the Mystery Pod, one-run Boosts and themed Collections.
//
// Coins never buy a leaderboard advantage: cosmetics are purely visual, and any run that
// uses a Boost is kept off the worldwide leaderboard and the Daily Challenge.
import { RNG, hashString, todayKey } from "./rng.js";
import { Save } from "./save.js";
import { Analytics } from "../systems/analytics.js";

export const RARITY_ORDER = ["common", "rare", "epic", "legendary"];

/** Shop categories in tab order (Featured, Characters and Boosts are separate tabs). */
export const CATEGORIES = [
  { id: "trail", label: "TRAILS", one: "Trail" },
  { id: "death", label: "DEATH FX", one: "Death effect" },
  { id: "hat", label: "HATS", one: "Hat" },
  { id: "skin", label: "SKINS", one: "Skin" },
  { id: "flap", label: "FLAP FX", one: "Flap effect" },
  { id: "coin", label: "COINS", one: "Coin skin" },
];

// prices sit inside the rarity bands: common 100–300, rare 400–1,200, epic 1,500–5,000,
// legendary 8,000–15,000 (see the economy table in the README)
export const COSMETICS = [
  // trails
  { id: "trail_hearts", cat: "trail", name: "Pixel Hearts", rarity: "common", price: 300 },
  { id: "trail_fire", cat: "trail", name: "Fire", rarity: "rare", price: 600 },
  { id: "trail_lightning", cat: "trail", name: "Lightning", rarity: "rare", price: 800 },
  { id: "trail_glitch", cat: "trail", name: "Glitch", rarity: "rare", price: 1000 },
  { id: "trail_rainbow", cat: "trail", name: "Rainbow", rarity: "epic", price: 2500 },
  { id: "trail_galaxy", cat: "trail", name: "Galaxy", rarity: "epic", price: 3500 },
  { id: "trail_money", cat: "trail", name: "Money Rain", rarity: "legendary", price: 10000 },
  // death effects
  { id: "death_shatter", cat: "death", name: "Pixel Shatter", rarity: "common", price: 250 },
  { id: "death_confetti", cat: "death", name: "Confetti", rarity: "common", price: 300 },
  { id: "death_ghost", cat: "death", name: "Ghost", rarity: "rare", price: 500 },
  { id: "death_firework", cat: "death", name: "Firework", rarity: "rare", price: 700 },
  { id: "death_blackhole", cat: "death", name: "Black Hole", rarity: "legendary", price: 12000 },
  // hats & accessories
  { id: "hat_shades", cat: "hat", name: "Sunglasses", rarity: "common", price: 200 },
  { id: "hat_phones", cat: "hat", name: "Headphones", rarity: "rare", price: 450 },
  { id: "hat_horns", cat: "hat", name: "Devil Horns", rarity: "rare", price: 900 },
  { id: "hat_helmet", cat: "hat", name: "Football Helmet", rarity: "epic", price: 1800 },
  { id: "hat_halo", cat: "hat", name: "Halo", rarity: "epic", price: 3000 },
  { id: "hat_crown", cat: "hat", name: "Crown", rarity: "legendary", price: 15000 },
  // colour skins (work on every hero)
  { id: "skin_frozen", cat: "skin", name: "Frozen", rarity: "rare", price: 700 },
  { id: "skin_shadow", cat: "skin", name: "Shadow", rarity: "rare", price: 1200 },
  { id: "skin_neon", cat: "skin", name: "Neon", rarity: "epic", price: 2000 },
  { id: "skin_chrome", cat: "skin", name: "Chrome", rarity: "epic", price: 4000 },
  { id: "skin_gold", cat: "skin", name: "Gold", rarity: "legendary", price: 8000 },
  // flap effects
  { id: "flap_sparks", cat: "flap", name: "Sparks", rarity: "common", price: 200 },
  { id: "flap_stars", cat: "flap", name: "Stars", rarity: "common", price: 250 },
  { id: "flap_feathers", cat: "flap", name: "Feathers", rarity: "common", price: 300 },
  { id: "flap_notes", cat: "flap", name: "Music Notes", rarity: "rare", price: 400 },
  // coin skins
  { id: "coin_stars", cat: "coin", name: "Star Coins", rarity: "common", price: 300 },
  { id: "coin_gems", cat: "coin", name: "Gems", rarity: "rare", price: 600 },
  { id: "coin_hearts", cat: "coin", name: "Pixel Hearts", rarity: "epic", price: 1500 },
];

const BY_ID = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const getCosmetic = (id) => BY_ID[id] || null;

/** Skin looks: tint multiplies the sprite; extras add a glow / sparkle in the rig. */
export const SKINS = {
  skin_gold: { tint: 0xffd23f, glow: 0xffc83d, sparkle: 0xfff6c0 },
  skin_chrome: { tint: 0xd8e6f4, glow: 0xbfe8ff, sheen: true },
  skin_shadow: { tint: 0x6a5a8a, glow: 0x7a3cff },
  skin_neon: { tint: 0xa8fff0, glow: 0x3ef4ff, neon: true },
  skin_frozen: { tint: 0xbff0ff, glow: 0x9fe8ff, sparkle: 0xffffff },
};

/** Themed sets: own all four pieces → a title and a glow you can equip. */
export const COLLECTIONS = [
  {
    id: "set_void",
    name: "Neon Void Set",
    title: "Void Runner",
    glow: 0x3ef4ff,
    items: ["trail_lightning", "hat_phones", "death_shatter", "skin_neon"],
  },
  {
    id: "set_solar",
    name: "Solar Storm Set",
    title: "Sun Chaser",
    glow: 0xff8a1a,
    items: ["trail_fire", "hat_horns", "death_firework", "skin_gold"],
  },
  {
    id: "set_frozen",
    name: "Frozen Nebula Set",
    title: "Ice Phantom",
    glow: 0x9fe8ff,
    items: ["trail_galaxy", "hat_halo", "death_ghost", "skin_frozen"],
  },
  {
    id: "set_glitch",
    name: "Glitch Realm Set",
    title: "Glitch Lord",
    glow: 0x39ff88,
    items: ["trail_glitch", "hat_shades", "death_blackhole", "skin_chrome"],
  },
  {
    id: "set_prism",
    name: "Prism Rift Set",
    title: "Prism King",
    glow: 0xff7ad9,
    items: ["trail_rainbow", "hat_crown", "death_confetti", "skin_shadow"],
  },
];

// ------------------------------------------------------------------ boosts
/** One run each. Boosted runs never reach the leaderboard or the Daily Challenge. */
export const BOOSTS = [
  { id: "revive", name: "Second Chance", desc: "Revive once when you crash", price: 750 },
  { id: "headstart", name: "Head Start", desc: "Start the run at 200m", price: 300 },
  { id: "magnet", name: "Coin Magnet", desc: "Pull in coins from far away", price: 200 },
  { id: "double", name: "Double Coins", desc: "Every coin counts twice", price: 400 },
];
export const getBoost = (id) => BOOSTS.find((b) => b.id === id) || null;

// ------------------------------------------------------------------ mystery pod
export const POD_PRICE = 500;
export const POD_REFUND = 250;
export const POD_ODDS = { common: 55, rare: 30, epic: 12, legendary: 3 };

// ------------------------------------------------------------------ daily shop
export const DAILY_COUNT = 4;
export const DAILY_DISCOUNT = 0.3;

function state() {
  const s = Save.data;
  // Boosts were taken out of the shop: refund any that were bought but not used
  if (s.boosts && !s.boostsRefunded) {
    let back = 0;
    for (const [id, n] of Object.entries(s.boosts.owned || {}))
      back += (BOOSTS.find((b) => b.id === id)?.price || 0) * (n || 0);
    s.coins += back;
    s.boosts = { owned: {}, armed: {} };
    s.boostsRefunded = true;
    if (back) Save.write();
  }
  s.cos ||= { owned: {}, equipped: {} };
  s.cos.owned ||= {};
  s.cos.equipped ||= {};
  s.boosts ||= { owned: {}, armed: {} };
  s.boosts.owned ||= {};
  s.boosts.armed ||= {};
  return s;
}

export const Shop = {
  owns(id) {
    return !!state().cos.owned[id];
  },
  equipped(cat) {
    return state().cos.equipped[cat] || null;
  },
  /** Everything equipped right now, e.g. { trail: "trail_fire", hat: null, … , title }. */
  loadout() {
    return { ...state().cos.equipped };
  },
  equip(id) {
    const c = getCosmetic(id);
    if (!c || !Shop.owns(id)) return false;
    state().cos.equipped[c.cat] = id;
    Save.write();
    return true;
  },
  unequip(cat) {
    delete state().cos.equipped[cat];
    Save.write();
  },

  /** Today's price (the Daily Shop deal is 30% off). */
  priceOf(id) {
    const c = getCosmetic(id);
    if (!c) return Infinity;
    const deal = Shop.daily().deal;
    return deal === id ? Math.round((c.price * (1 - DAILY_DISCOUNT)) / 10) * 10 : c.price;
  },

  buy(id, where = "shop") {
    const s = state();
    const c = getCosmetic(id);
    if (!c || Shop.owns(id)) return false;
    const price = Shop.priceOf(id);
    if (s.coins < price) return false;
    s.coins -= price;
    s.cos.owned[id] = true;
    Save.write();
    Analytics.log("item_purchased", { item: id, price, category: c.cat, where });
    return true;
  },

  // ---------------------------------------------------------------- daily shop
  /** 4 items picked from the date (same for everyone that day), one of them 30% off. */
  daily(key = todayKey()) {
    const rng = new RNG(hashString(`glydrift-shop-${key}`));
    const pool = COSMETICS.slice();
    const items = [];
    while (items.length < DAILY_COUNT && pool.length) {
      const i = Math.floor(rng.next() * pool.length);
      items.push(pool.splice(i, 1)[0].id);
    }
    // the deal is never a common (a 30% cut on 100 coins isn't much of a deal)
    const pricey = items.filter((id) => getCosmetic(id).rarity !== "common");
    const pickFrom = pricey.length ? pricey : items;
    const deal = pickFrom[Math.floor(rng.next() * pickFrom.length)];
    return { items, deal };
  },
  /** ms until the Daily Shop refreshes (local midnight). */
  msToRefresh(now = new Date()) {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return next - now;
  },

  // ---------------------------------------------------------------- mystery pod
  /**
   * Spend POD_PRICE on a random cosmetic you don't own. Rolls a rarity by POD_ODDS; if
   * everything of that rarity is already yours you get POD_REFUND coins back instead.
   * @returns {{ item: object|null, rarity: string, refund: number } | null}
   */
  openPod({ free = false } = {}) {
    const s = state();
    if (!free && s.coins < POD_PRICE) return null;
    if (!free) s.coins -= POD_PRICE;
    let r = Math.random() * 100;
    let rarity = "common";
    for (const k of RARITY_ORDER) {
      r -= POD_ODDS[k];
      if (r < 0) {
        rarity = k;
        break;
      }
    }
    const left = COSMETICS.filter((c) => c.rarity === rarity && !s.cos.owned[c.id]);
    let out;
    if (!left.length) {
      s.coins += POD_REFUND;
      out = { item: null, rarity, refund: POD_REFUND };
    } else {
      const item = left[Math.floor(Math.random() * left.length)];
      s.cos.owned[item.id] = true;
      out = { item, rarity, refund: 0 };
    }
    Save.write();
    Analytics.log("pod_opened", { rarity, item: out.item?.id || null, refund: out.refund, free });
    return out;
  },

  // ---------------------------------------------------------------- daily drift drop
  /** One free Mystery Pod per day. */
  dropReady(key = todayKey()) {
    return state().dailyDrop !== key;
  },
  claimDrop(key = todayKey()) {
    if (!Shop.dropReady(key)) return null;
    state().dailyDrop = key;
    Save.write();
    return Shop.openPod({ free: true });
  },

  // ---------------------------------------------------------------- boosts
  boostCount(id) {
    return state().boosts.owned[id] || 0;
  },
  isArmed(id) {
    return !!state().boosts.armed[id] && Shop.boostCount(id) > 0;
  },
  buyBoost(id) {
    const s = state();
    const b = getBoost(id);
    if (!b || s.coins < b.price) return false;
    s.coins -= b.price;
    s.boosts.owned[id] = (s.boosts.owned[id] || 0) + 1;
    s.boosts.armed[id] = true; // bought for the next run
    Save.write();
    Analytics.log("item_purchased", { item: id, price: b.price, category: "boost" });
    return true;
  },
  toggleBoost(id) {
    const s = state();
    if (!Shop.boostCount(id)) return false;
    s.boosts.armed[id] = !s.boosts.armed[id];
    Save.write();
    return s.boosts.armed[id];
  },
  armedBoosts() {
    return BOOSTS.filter((b) => Shop.isArmed(b.id)).map((b) => b.id);
  },
  /** Called when a normal (non-daily) run starts: uses up the armed boosts. */
  consumeBoosts() {
    const s = state();
    const used = Shop.armedBoosts();
    for (const id of used) {
      s.boosts.owned[id] -= 1;
      if (s.boosts.owned[id] <= 0) delete s.boosts.armed[id];
      Analytics.log("boost_used", { boost: id });
    }
    if (used.length) Save.write();
    return used;
  },

  // ---------------------------------------------------------------- biome bundles
  /** A Collection's trail + hat + death effect as one offer, 25% off what you still need. */
  bundle(setId) {
    const set = COLLECTIONS.find((c) => c.id === setId);
    const items = set.items.filter((id) => getCosmetic(id).cat !== "skin");
    const need = items.filter((id) => !Shop.owns(id));
    const full = need.reduce((a, id) => a + getCosmetic(id).price, 0);
    return { set, items, need, full, price: Math.round((full * 0.75) / 10) * 10 };
  },
  /** Today's two featured bundles (rotate daily, same for everyone). */
  bundlesToday(key = todayKey()) {
    const rng = new RNG(hashString(`glydrift-bundles-${key}`));
    const ids = COLLECTIONS.map((c) => c.id);
    const a = ids.splice(Math.floor(rng.next() * ids.length), 1)[0];
    const b = ids[Math.floor(rng.next() * ids.length)];
    return [a, b];
  },
  buyBundle(setId) {
    const s = state();
    const b = Shop.bundle(setId);
    if (!b.need.length || s.coins < b.price) return false;
    s.coins -= b.price;
    for (const id of b.need) s.cos.owned[id] = true;
    Save.write();
    Analytics.log("item_purchased", { item: setId, price: b.price, category: "bundle" });
    return true;
  },

  // ---------------------------------------------------------------- collections
  setComplete(set) {
    return set.items.every((id) => Shop.owns(id));
  },
  completedSets() {
    return COLLECTIONS.filter((c) => Shop.setComplete(c));
  },
  /** The equipped collection (title + glow), only while its set is still complete. */
  activeSet() {
    const id = Shop.equipped("title");
    const set = COLLECTIONS.find((c) => c.id === id);
    return set && Shop.setComplete(set) ? set : null;
  },
  equipTitle(setId) {
    const set = COLLECTIONS.find((c) => c.id === setId);
    if (!set || !Shop.setComplete(set)) return false;
    state().cos.equipped.title = setId;
    Save.write();
    return true;
  },
};
