/** Pedestrians, police officer, newsboys: 14x30 px figures with idle / wave / jump / tip-hat frames. */
import { canvas, rect, px, hline, vline, S, flipH, type Ctx } from './pixel';
import { register } from './registry';
import { Rng } from '../core/rng';

export type PedKind = 'gent' | 'lady' | 'worker' | 'newsboy' | 'boy' | 'police' | 'parasol';
export const PED_FRAMES = { idle: 0, idle2: 1, wave: 2, jump: 3, tip: 4, point: 5 } as const;
export const PED_UPP = 15;

function hat(ctx: Ctx, kind: PedKind, x: number, y: number, rng: Rng) {
  const dark = S[1];
  switch (kind) {
    case 'gent': // derby or straw boater
      if (rng.chance(0.4)) { rect(ctx, x - 3, y + 2, 8, 1, S[10]); rect(ctx, x - 2, y, 6, 2, S[10]); hline(ctx, x - 2, y + 1, 6, S[3]); }
      else { rect(ctx, x - 3, y + 2, 8, 1, dark); rect(ctx, x - 2, y - 1, 6, 3, dark); hline(ctx, x - 1, y - 1, 4, S[3]); }
      break;
    case 'lady': case 'parasol': // wide plumed hat
      rect(ctx, x - 5, y + 2, 12, 1, S[rng.int(1, 3)]); rect(ctx, x - 2, y, 6, 2, S[2]);
      px(ctx, x + 4, y - 1, S[11]); px(ctx, x + 5, y - 2, S[11]); px(ctx, x + 3, y - 1, S[10]);
      break;
    case 'worker': case 'newsboy': case 'boy': // flat cap
      rect(ctx, x - 2, y + 1, 6, 2, S[rng.int(2, 4)]); rect(ctx, x + 2, y + 2, 3, 1, S[1]);
      break;
    case 'police': // tall custodian helmet
      rect(ctx, x - 2, y - 2, 6, 5, S[1]); rect(ctx, x - 1, y - 3, 4, 1, S[1]); px(ctx, x + 1, y - 4, S[6]);
      rect(ctx, x - 3, y + 2, 8, 1, S[1]); px(ctx, x + 1, y, S[9]);
      break;
  }
}

function person(kind: PedKind, frame: number, seed: number): HTMLCanvasElement {
  const rng = new Rng(seed);
  const W = 18, H = 38;
  const [c, ctx] = canvas(W, H);
  const jump = frame === PED_FRAMES.jump;
  const oy = jump ? -3 : 0;
  const cx = 8;
  const skin = S[10], skinD = S[8];
  const coat = kind === 'police' ? S[1] : kind === 'worker' ? S[rng.int(3, 5)] : kind === 'lady' || kind === 'parasol' ? S[rng.pick([2, 6, 9, 10, 11])] : S[rng.int(1, 4)];
  const coatD = S[Math.max(0, S.indexOf(coat) - 2)];
  const trous = kind === 'worker' ? S[3] : S[rng.int(1, 3)];
  const small = kind === 'boy' || kind === 'newsboy';
  const top = (small ? 15 : 10) + oy;
  // legs / skirt
  if (kind === 'lady' || kind === 'parasol') {
    for (let y = top + 11; y < H - 1; y++) {
      const w = 5 + Math.floor((y - top - 11) / 2.4);
      hline(ctx, cx - Math.floor(w / 2) + 1, y, w, (y + 1) % 4 ? coat : coatD);
    }
    hline(ctx, cx - 2, H - 1, 2, S[0]); hline(ctx, cx + 2, H - 1, 2, S[0]);
  } else {
    const spread = jump ? 2 : 0;
    const legTop = top + (small ? 12 : 15);
    const legH = H - 1 - legTop;
    rect(ctx, cx - 1 - spread, legTop, 3, legH, trous);
    rect(ctx, cx + 2 + spread, legTop, 3, legH, trous);
    vline(ctx, cx + 1 - spread, legTop, legH, S[0]);
    if (small) { hline(ctx, cx - 1 - spread, legTop + 3, 2, S[9]); hline(ctx, cx + 2 + spread, legTop + 3, 2, S[9]); }
    rect(ctx, cx - 2 - spread, H - 1 + oy, 3, 1, S[0]); rect(ctx, cx + 2 + spread, H - 1 + oy, 3, 1, S[0]);
  }
  // torso
  const tH = small ? 7 : 10;
  rect(ctx, cx - 2, top + 5, 7, tH, coat);
  vline(ctx, cx - 2, top + 5, tH, coatD);
  vline(ctx, cx - 1, top + 5, tH, coatD);
  if (kind === 'gent' || kind === 'police') { px(ctx, cx + 1, top + 5, S[11]); px(ctx, cx + 1, top + 6, S[0]); } // collar + tie
  if (kind === 'police') { for (let y = top + 7; y < top + 14; y += 2) px(ctx, cx + 2, y, S[8]); hline(ctx, cx - 1, top + 12, 5, S[3]); rect(ctx, cx - 1, top + 14, 5, 3, S[1]); }
  if (kind === 'worker') { rect(ctx, cx, top + 6, 3, tH - 1, S[5]); }
  if (kind === 'newsboy') { for (let i = 0; i < 6; i++) px(ctx, cx - 1 + i, top + 5 + i, S[6]); rect(ctx, cx + 3, top + 10, 3, 4, S[6]); }
  // head
  rect(ctx, cx - 1, top, 4, 5, skin); vline(ctx, cx - 1, top, 5, skinD); hline(ctx, cx - 1, top + 4, 4, skinD);
  px(ctx, cx + 2, top + 1, S[3]);
  if (kind === 'gent' && rng.chance(0.5)) hline(ctx, cx, top + 3, 3, S[3]); // moustache
  // arms
  const armC = coat;
  const hand = (x: number, y: number) => px(ctx, x, y, kind === 'police' ? S[12] : skin);
  const armDown = (x: number) => { vline(ctx, x, top + 6, small ? 6 : 8, armC); vline(ctx, x + (x < cx ? -1 : 1), top + 6, small ? 5 : 7, armC); hand(x, top + (small ? 12 : 14)); };
  const armUp = (x: number, high = 6) => { vline(ctx, x, top + 6 - high, high + 2, armC); hand(x, top - high - 1 + 6); };
  const hatOnHead = frame !== PED_FRAMES.wave && frame !== PED_FRAMES.tip;
  switch (frame) {
    case PED_FRAMES.wave: {
      armDown(cx - 2);
      armUp(cx + 4, 8);
      hat(ctx, kind, cx + 4, top - 6, rng); // hat waved overhead
      break;
    }
    case PED_FRAMES.tip: {
      armDown(cx - 2);
      vline(ctx, cx + 4, top + 1, 6, armC); hand(cx + 4, top);
      hat(ctx, kind, cx + 1, top - 5, rng); // hat lifted
      break;
    }
    case PED_FRAMES.jump:
      armUp(cx - 3, 6); armUp(cx + 5, 6);
      break;
    case PED_FRAMES.point:
      armDown(cx - 2);
      hline(ctx, cx + 4, top + 6, 6, armC); px(ctx, cx + 10, top + 6, S[12]);
      break;
    default:
      armDown(cx - 2);
      if (frame === PED_FRAMES.idle2 && kind !== 'police') armUp(cx + 4, 1); else armDown(cx + 4);
  }
  if (hatOnHead) hat(ctx, kind, cx + 1, top - 3, rng);
  if (kind === 'newsboy' && frame !== PED_FRAMES.jump) {
    // paper held aloft
    rect(ctx, cx + 4, top - 4, 5, 6, S[12]); hline(ctx, cx + 5, top - 3, 3, S[3]); hline(ctx, cx + 5, top - 1, 3, S[5]); vline(ctx, cx + 4, top + 2, 4, armC);
  }
  if (kind === 'parasol') {
    vline(ctx, cx + 4, top - 6, 14, S[1]);
    for (let i = 0; i < 5; i++) hline(ctx, cx + 4 - 6 + i, top - 7 + i, 13 - i * 2, i === 4 ? S[7] : S[11 - (i >> 1)]);
  }
  if (kind === 'gent' && rng.chance(0.3) && frame === PED_FRAMES.idle) vline(ctx, cx - 3, top + 12, 9, S[1]); // cane
  return c;
}

export const PED_KINDS: PedKind[] = ['gent', 'lady', 'worker', 'newsboy', 'boy', 'police', 'parasol'];
export const PED_VARIANTS = 4;

export function buildPeople() {
  for (const k of PED_KINDS) {
    for (let v = 0; v < PED_VARIANTS; v++) {
      const frames = [0, 1, 2, 3, 4, 5].map((f) => {
        const img = person(k, f, 1000 + v * 97 + k.length * 13);
        return { img, upp: PED_UPP, flip: flipH(img) };
      });
      register(`ped:${k}:${v}`, frames);
    }
  }
}
