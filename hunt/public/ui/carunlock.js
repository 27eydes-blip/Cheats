// The unlock celebration for the 8 unlockable cars, wired to the account: whenever the account's
// progress shows a car this device has not celebrated yet (a coin buy, a trophy milestone, a race
// that met a goal, or an unlock made on another device on the same account), the NEW CAR UNLOCKED
// screen (ui/unlock.js) plays once for it, one car at a time, never during a race. EQUIP makes it
// your car and the account's default car (the server falls back to it when a locked car is asked for).
import * as A from '../account.js';
import { NEW_CARS, PERKS, carUnlocked } from '../race/unlocks.js';
import { showUnlock } from './unlock.js';
import { equippedLook } from './platform.js';

const SEEN_KEY = 'hunt-cars-seen';
const readSeen = () => { try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeSeen = (v) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(v)); } catch {} };

let api = null, busy = false;
// api: {inRace(), setBrawler(id)}
export function watchCarUnlocks(o) {
  api = o;
  A.onUser(() => checkCarUnlocks());
}
// play the celebration for the next car not seen on this device (call again when a race ends)
export function checkCarUnlocks() {
  if (!api || busy || api.inRace()) return;
  const p = A.progress(), seen = readSeen();
  const id = NEW_CARS.find((c) => carUnlocked(p, c) && !seen.includes(c));
  if (!id) return;
  writeSeen([...seen, id]);
  busy = true;
  showUnlock({
    id, look: equippedLook(p, id), perk: PERKS[id],
    onEquip: (car) => { api.setBrawler(car); A.shop({ action: 'carset', car }).catch(() => {}); },
    onClose: () => { busy = false; setTimeout(checkCarUnlocks, 250); },
  });
}
