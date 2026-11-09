// LOCKER ROOM data: everything the player can own, one list per tab, with what's owned, what's
// worn and how to get the rest. Pure data (no Phaser), so the home screen can show the counts
// and the tests can check them. Equipping here calls exactly what the old menus called
// (Shop.equip / Titles.equip / Save.data.selected), so a look worn from the Locker is the same
// save as one worn from the hero editor, the Titles screen or Settings.
import { Save } from "./save.js";
import { COSMETICS, forSale, Shop } from "./cosmetics.js";
import { ALL_MIGHTY, TITLES, Titles } from "./titles.js";
import { Progression, SPIN_EVERY } from "./progression.js";
import { Seasons } from "./seasons.js";
import { FREE_TRACK } from "./driftPass.js";
import { plusEntitled } from "./plusGate.js";
import { plusRewardFor } from "./passPlus.js";
import { plusTrackS1 } from "./seasonDefs.js";
import { getCharacter, onSale, saleLeft, visibleCharacters } from "../player/characterDefs.js";

/** Tabs in order. `cats`: the cosmetic slots a tab shows (a hero's own skins sit with SKINS). */
export const LOCKER_TABS = [
  { id: "heroes", label: "HEROES", one: "Hero" },
  { id: "skin", label: "SKINS", one: "Skin", cats: ["skin", "dskin", "tskin"] },
  { id: "hat", label: "HATS", one: "Hat", cats: ["hat"] },
  { id: "trail", label: "TRAILS", one: "Trail", cats: ["trail"] },
  { id: "death", label: "DEATH FX", one: "Death effect", cats: ["death"] },
  { id: "pose", label: "POSES", one: "Victory pose", cats: ["pose"] },
  { id: "flap", label: "FLAP FX", one: "Flap effect", cats: ["flap"] },
  { id: "coin", label: "COINS", one: "Coin skin", cats: ["coin"] },
  { id: "titles", label: "TITLES", one: "Title" },
  // banners & badges: the Drift Pass+ flair shown with your name (and the Abyss home look)
  { id: "badges", label: "BADGES", one: "Flair", cats: ["name", "badge", "theme"] },
];
export const lockerTab = (id) => LOCKER_TABS.find((t) => t.id === id) || null;

const KIND = {
  skin: "SKIN · every hero",
  dskin: "DAWSON SKIN · only on DAWSON",
  tskin: "TUNG SKIN · only on TUNG",
  hat: "HAT",
  trail: "TRAIL",
  death: "DEATH EFFECT · plays when a run ends",
  pose: "VICTORY POSE · plays on a NEW BEST",
  flap: "FLAP EFFECT",
  coin: "COIN SKIN",
  name: "GOLD NAME · on both leaderboards",
  badge: "FOREVER BADGE · always shown by your name",
  theme: "HOME THEME · the Abyss home screen",
  banner: "SEASON BANNER",
};

// ------------------------------------------------------------------ how to unlock
/**
 * How to unlock a hero you don't own: the hero screen's button label/colour/state and the
 * line(s) under it. One source for HEROES and the Locker, so the two always agree.
 * @returns {{ label, color, enabled, alt, list, tag, route }}
 *   tag: a short word for a Locker tile · route: where to go to get it ("Characters" / "Spin" / "Pass")
 */
export function heroUnlock(def) {
  const s = Save.data;
  const season = Seasons.active();
  // season heroes: a pass tier now, coins once their season has ended
  const passTier = season ? season.pass.tiers.findIndex((t) => t.hero === def.id) + 1 : 0;
  const cost = def.cost || Seasons.afterPrice(def.id);
  if (def.passPlus) {
    // DRIFT PASS+ heroes: only from their tier of the paid track, never for coins
    const live = season?.id === def.passPlus;
    return {
      label: live ? `DRIFT PASS+ · TIER ${def.passTier}` : "DRIFT PASS+",
      color: 0xc8102e,
      enabled: live,
      alt: live
        ? `Exclusive to the Season ${season.number} Drift Pass+ (tier ${def.passTier}).\nNever sold for coins.`
        : "A Season 1 Drift Pass+ exclusive. It never comes back to the shop.",
      tag: "PASS+",
      route: live ? "Pass" : null,
    };
  }
  if (def.limited) {
    const live = onSale(def);
    const ms = saleLeft(def);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return {
      label: live ? `UNLOCK  ${def.cost}` : "GONE",
      color: live ? 0xff3a8a : 0x8a80b0,
      enabled: live && s.coins >= def.cost,
      alt: live
        ? `LIMITED · leaves in ${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s\nOwn it forever once unlocked`
        : "This limited hero has left the shop",
      tag: live ? `${def.cost}` : "GONE",
      coins: live,
      route: live ? "Characters" : null,
    };
  }
  if (!cost && def.challenge) {
    // challenge-only heroes (Abyss / Prism / streak animals): progress shown clearly
    const cur = Math.min(Progression.statOf(def.challenge.stat), def.challenge.value);
    let alt = `Unlock: ${def.challenge.text}`;
    if (passTier) alt += `\nor reach tier ${passTier} of the Season ${season.number} Drift Pass`;
    return {
      label: `CHALLENGE  ${cur}/${def.challenge.value}`,
      color: 0x8a80b0,
      enabled: false,
      alt,
      tag: "CHALLENGE",
      route: null,
    };
  }
  if (def.lottery) {
    return {
      label: "LUCKY SPIN",
      color: 0xff7ad9,
      enabled: true,
      alt: `Only from the Lucky Spin\nEarn a spin every ${SPIN_EVERY} points · you have ${s.spins || 0}`,
      tag: "SPIN",
      route: "Spin",
    };
  }
  const reqOk = Progression.requirementsMet(def);
  const bits = [];
  // must-do goals (all of them) before the coins can be spent
  for (const r of def.requires || []) {
    const cur = Math.min(Progression.statOf(r.stat), r.value);
    bits.push(`${cur >= r.value ? "✓" : "✗"} ${r.text} (${cur}/${r.value})`);
  }
  if (def.requires) bits.push(`${s.coins >= cost ? "✓" : "✗"} ${cost} coins`);
  if (def.spinPool) bits.push("or win him on the Lucky Spin");
  if (def.shards) bits.push(`${s.shards?.[def.id] || 0}/${def.shards} shards (daily streak & levels)`);
  if (def.challenge) {
    const cur = Math.min(Progression.statOf(def.challenge.stat), def.challenge.value);
    const shown = def.challenge.stat === "maxBiome" ? "" : ` (${cur}/${def.challenge.value})`;
    bits.push(`or challenge: ${def.challenge.text}${shown}`);
  }
  return {
    label: reqOk ? `UNLOCK  ${cost}` : `LOCKED · ${cost}`,
    color: def.requires ? (reqOk ? 0x39ff6a : 0x8a80b0) : 0xffc83d,
    enabled: reqOk && s.coins >= cost,
    alt: bits.join("\n"),
    list: !!def.requires,
    tag: `${cost}`,
    coins: true,
    route: "Characters",
  };
}

/** Where a cosmetic comes from, in plain words. @returns {{ text, tag, coins, route, tab }} */
export function cosmeticUnlock(c) {
  const only = c.forHero ? ` · only on ${getCharacter(c.forHero).name}` : "";
  if (c.hero) {
    const h = getCharacter(c.hero);
    return { text: `Comes with ${h.name}: unlock the hero to get it`, tag: h.name, route: "Characters", hero: h.id };
  }
  if (c.plusBonus)
    return { text: `Comes with the Season 1 Drift Pass+${only}`, tag: "PASS+", route: "Pass" };
  if (c.plus) {
    const r = plusRewardFor(c.id);
    return {
      text: r ? `Drift Pass+ · Season 1, tier ${r.tier}${only}` : `A Drift Pass+ exclusive${only}`,
      tag: "PASS+",
      route: "Pass",
    };
  }
  if (c.event === "levels") {
    const text = c.id === "trail_lv_master" ? "Beat level 50 in LEVELS" : "Earn 15 level stars in LEVELS";
    return { text, tag: "LEVELS", route: null };
  }
  if (c.event) return { text: "Founding Drifter event: the move to glydrift.com", tag: "EVENT", route: null };
  // the classic free Drift Pass (between seasons) or this season's pass can hand it out too
  const track = Seasons.active()?.pass.tiers || FREE_TRACK;
  const tier = track.findIndex((t) => t.item === c.id) + 1;
  const pass = tier ? ` · or Drift Pass tier ${tier}` : "";
  if (c.season) {
    const sn = Seasons.byId(c.season)?.number;
    return forSale(c)
      ? { text: `Season shop: ${Shop.priceOf(c.id)} coins while the season runs${pass}`, tag: `${Shop.priceOf(c.id)}`, coins: true, route: "Shop" }
      : { text: `A Season ${sn || ""} shop exclusive`.replace("  ", " "), tag: "SEASON", route: null };
  }
  const pod = c.forHero ? "" : " · or a Mystery Pod";
  return {
    text: `Shop: ${Shop.priceOf(c.id)} coins${pod}${pass}${only}`,
    tag: `${Shop.priceOf(c.id)}`,
    coins: true,
    route: "Shop",
  };
}

/** The Shop tab a cosmetic is sold in (as the old hero editor's SHOP button chose). */
export const shopTabFor = (cat) =>
  ["death", "flap", "coin"].includes(cat) ? "effects" : cat === "dskin" || cat === "tskin" ? "skin" : cat;

// ------------------------------------------------------------------ the lists
const bannerOwned = (id) => !!Save.data.banners?.owned?.[id] && plusEntitled("s1");

/** A cosmetic is listed if it's yours, or can still be got (old season shop items drop out). */
const listed = (c) => Shop.owns(c.id) || !c.season || forSale(c);

/**
 * Everything on one tab, owned first (each part in catalogue order). Entries:
 * { key, kind: "hero"|"cos"|"title"|"banner"|"none", id, cat, name, rarity, owned, equipped,
 *   color, kindLabel, unlock: { text, tag, coins, route } | null }
 */
export function lockerEntries(tabId) {
  const s = Save.data;
  const tab = lockerTab(tabId);
  if (!tab) return [];
  let list = [];
  if (tabId === "heroes") {
    const sel = Progression.selectedHero();
    list = visibleCharacters(s.unlocked).map((d) => {
      const owned = Progression.isUnlocked(d.id);
      return {
        key: `hero:${d.id}`,
        kind: "hero",
        id: d.id,
        name: d.name,
        rarity: d.rarity,
        color: d.color,
        owned,
        equipped: owned && d.id === sel,
        kindLabel: `HERO · ${d.title}`,
        unlock: owned ? null : (() => {
          const u = heroUnlock(d);
          return { text: u.alt || `Unlock in HEROES for ${u.tag} coins`, tag: u.tag, coins: u.coins, route: u.route, hero: d.id };
        })(),
      };
    });
  } else if (tabId === "titles") {
    const on = Titles.equippedId();
    list = TITLES.map((t) => {
      const owned = Titles.owns(t.id);
      return {
        key: `title:${t.id}`,
        kind: "title",
        id: t.id,
        name: t.name,
        title: t,
        owned,
        // ALL MIGHTY is worn by itself while the server says you're the world's #1 (never picked)
        equipped: t.id === ALL_MIGHTY ? owned : owned && on === t.id,
        auto: t.id === ALL_MIGHTY,
        kindLabel: t.id === ALL_MIGHTY ? "WORLD #1 · WORN AUTOMATICALLY" : t.style ? "ANIMATED TITLE" : "TITLE",
        unlock: owned
          ? null
          : { text: t.how, tag: t.source === "plus" ? "PASS+" : t.id === ALL_MIGHTY ? "#1" : "", route: t.source === "plus" ? "Pass" : null },
      };
    });
  } else {
    const cos = COSMETICS.filter((c) => tab.cats.includes(c.cat) && listed(c));
    list = cos.map((c) => {
      const owned = Shop.owns(c.id);
      // the forever badge always shows once it's yours (nothing to switch)
      const equipped = owned && (c.cat === "badge" || Shop.equipped(c.cat) === c.id);
      return {
        key: `cos:${c.id}`,
        kind: "cos",
        id: c.id,
        cat: c.cat,
        name: c.name,
        rarity: c.rarity,
        forHero: c.forHero || null,
        owned,
        equipped,
        kindLabel: `${KIND[c.cat] || "ITEM"}`,
        unlock: owned ? null : cosmeticUnlock(c),
      };
    });
    if (tabId === "badges") {
      // the Season 1 banner (from the Drift Pass+ track) sits with the badges
      const tier = plusTrackS1({ banner: "crimson" }).findIndex((r) => r.banner) + 1;
      const owned = bannerOwned("crimson");
      list.unshift({
        key: "banner:crimson",
        kind: "banner",
        id: "crimson",
        cat: "banner",
        name: "Crimson Banner",
        rarity: "epic",
        owned,
        equipped: owned && s.banners?.equipped === "crimson",
        kindLabel: KIND.banner,
        unlock: owned
          ? null
          : { text: `Drift Pass+ · Season 1, tier ${tier}`, tag: "PASS+", route: "Pass" },
      });
    }
  }
  const owned = list.filter((e) => e.owned);
  const locked = list.filter((e) => !e.owned);
  // "nothing" first on the slot tabs (the old editors' NONE), counted in neither number
  const none =
    tabId === "heroes" || tabId === "badges"
      ? []
      : [
          {
            key: `none:${tabId}`,
            kind: "none",
            id: null,
            cat: tabId === "titles" ? "title" : tab.cats[0],
            name: "None",
            owned: true,
            equipped:
              tabId === "titles" ? !Titles.equippedId() : !Shop.equipped(tab.cats[0]),
            kindLabel: tabId === "titles" ? "Show only your name" : `No ${tab.one.toLowerCase()}`,
            unlock: null,
          },
        ];
  return [...none, ...owned, ...locked];
}

/** Owned / total for one tab (the NONE tile isn't an item). */
export function lockerCount(tabId) {
  const list = lockerEntries(tabId).filter((e) => e.kind !== "none");
  return { owned: list.filter((e) => e.owned).length, total: list.length };
}

/** Owned / total for every tab: { heroes: { owned, total }, … }. */
export function lockerCounts() {
  return Object.fromEntries(LOCKER_TABS.map((t) => [t.id, lockerCount(t.id)]));
}

/**
 * Wear an entry (or take it off: tapping what you already wear, where a slot can be empty).
 * The same calls the old menus made. @returns "equipped" | "unequipped" | "locked" | null
 */
export function lockerEquip(e) {
  const s = Save.data;
  if (!e) return null;
  if (!e.owned) return "locked";
  switch (e.kind) {
    case "hero":
      if (s.selected === e.id) return null;
      s.selected = e.id; // as HEROES' SELECT does
      Save.write();
      return "equipped";
    case "title":
      if (e.equipped || e.auto) return null; // (ALL MIGHTY can't be picked: it's worn by itself)
      Titles.equip(e.id);
      return "equipped";
    case "banner":
      s.banners ||= { owned: {}, equipped: null };
      s.banners.equipped = e.equipped ? null : e.id;
      Save.write();
      return e.equipped ? "unequipped" : "equipped";
    case "none":
      if (e.cat === "title") Titles.equip(null);
      else Shop.unequip(e.cat);
      return "unequipped";
    case "cos": {
      if (e.cat === "badge") return null; // always shown
      // hero skins / flair have no NONE tile: tapping the worn one takes it off
      if (e.equipped) {
        if (["dskin", "tskin", "name", "theme"].includes(e.cat)) {
          Shop.unequip(e.cat);
          return "unequipped";
        }
        return null;
      }
      return Shop.equip(e.id) ? "equipped" : null;
    }
  }
  return null;
}

/** For the MORE sheet: everything owned across the Locker, and the total. */
export function lockerTotals() {
  const c = lockerCounts();
  let owned = 0;
  let total = 0;
  for (const v of Object.values(c)) {
    owned += v.owned;
    total += v.total;
  }
  return { owned, total, heroes: c.heroes };
}

// test builds only
import { TEST } from "../systems/testFlags.js";
if (TEST.on && typeof window !== "undefined")
  window.__glyLocker = { LOCKER_TABS, lockerEntries, lockerCount, lockerCounts, lockerEquip, heroUnlock, cosmeticUnlock };
