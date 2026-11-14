// Cosmetics catalog + Hunt Pass. TEST CURRENCY ONLY ("Hunt Coins (test)") — no real payments.
// Cosmetics never touch gameplay: skins only change colours/accessories in render.js.
export const CATALOG = {
  titles: { tracker: 'Tracker', bounty_hunter: 'Bounty Hunter', apex: 'Apex Hunter' },
  fx: { sparks: 'Sparks', stars: 'Starburst' },
  skins: { volt_storm: { brawler: 'volt', name: 'Stormcell' } },
};
export function applyPurchase(p, req) {
  if (req.action === 'equip') {
    const { slot, id } = req;
    if (!['title', 'fx'].includes(slot) && !/^skin:/.test(slot || '')) return { error: 'bad slot' };
    if (id && !p.owned.includes(id)) return { error: 'not owned' };
    p.equipped[slot] = id || null;
    return { progress: p };
  }
  return { error: 'unknown action' };
}
