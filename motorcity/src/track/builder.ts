import { Rng } from '../core/rng';
import { easeIn, easeInOut } from '../core/math';
import { SEG_LEN, FACADE_X, PROP_X, RAIL_X, TUNNEL_X, CLEAR, type Segment, type Section, type Track, type TrackDef, type Zone, type Ground, type SpriteInst, type Facade } from './types';
import { makeFacade, type FacadeStyle } from '../art/facades';

export interface PedDef { seg: number; x: number; kind: string; seed: number }

export interface BuiltTrack extends Track { peds: PedDef[] }

const ZONE_GROUND: Record<Zone, Ground> = {
  city: 'cobble', plaza: 'cobble', park: 'park', bridge: 'bridge', tunnel: 'tunnel', industrial: 'brick', river: 'park',
};

function newSeg(i: number, zone: Zone): Segment {
  const pt = () => ({ x: 0, y: 0, w: 0, s: 0, z: 0 });
  return {
    i, z1: i * SEG_LEN, z2: (i + 1) * SEG_LEN, y1: 0, y2: 0, curve: 0, zone, ground: ZONE_GROUND[zone],
    rails: false, sprites: [], tunnel: zone === 'tunnel', bunting: false, waterL: false, waterR: false, finish: false,
    p1: pt(), p2: pt(), fog: 0, vis: false, clipY: 0, cars: [],
  };
}

export function buildTrack(def: TrackDef): BuiltTrack {
  const segs: Segment[] = [];
  const feats: { at: number; len: number; f: NonNullable<Section['feature']> }[] = [];
  let y = 0;
  const secs = [...def.sections];
  const totalHill = secs.reduce((a, s) => a + (s.hill ?? 0), 0);
  if (Math.abs(totalHill) > 1) secs.push({ len: 60, hill: -totalHill, zone: secs[secs.length - 1].zone, rails: secs[secs.length - 1].rails });

  for (const s of secs) {
    const n = Math.max(3, Math.round(s.len));
    const enter = Math.floor(n * 0.22), leave = Math.floor(n * 0.22), hold = n - enter - leave;
    const zone = s.zone ?? 'city';
    const c = s.curve ?? 0;
    const y0 = y, y1 = y + (s.hill ?? 0);
    if (s.feature) feats.push({ at: segs.length, len: n, f: s.feature });
    for (let k = 0; k < n; k++) {
      const seg = newSeg(segs.length, zone);
      seg.curve = k < enter ? easeIn(0, c, k / enter) : k < enter + hold ? c : easeInOut(c, 0, (k - enter - hold) / leave);
      seg.y1 = easeInOut(y0, y1, k / n);
      seg.y2 = easeInOut(y0, y1, (k + 1) / n);
      seg.rails = !!s.rails && zone !== 'park';
      if (zone === 'bridge') { seg.waterL = seg.waterR = true; }
      if (zone === 'river') seg.waterR = true;
      segs.push(seg);
    }
    y = y1;
  }
  const rng = new Rng(def.seed);
  const peds: PedDef[] = [];
  decorate(def, segs, rng, peds);
  for (const f of feats) applyFeature(def, segs, f, rng, peds);
  finishLine(segs, rng, peds);
  return { def, segs, length: segs.length * SEG_LEN, map: buildMap(segs), peds };
}

function buildMap(segs: Segment[]) {
  let a = 0, x = 0, y = 0;
  const raw: { x: number; y: number }[] = [];
  for (let i = 0; i < segs.length; i++) {
    a += segs[i].curve * 0.0105;
    x += Math.sin(a); y -= Math.cos(a);
    if (i % 8 === 0) raw.push({ x, y });
  }
  // distribute closure error so the loop closes
  const ex = x, ey = y, n = raw.length;
  raw.forEach((p, i) => { p.x -= (ex * i) / n; p.y -= (ey * i) / n; });
  const xs = raw.map((p) => p.x), ys = raw.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1);
  return raw.map((p) => ({ x: (p.x - minX + (span - (maxX - minX)) / 2) / span, y: (p.y - minY + (span - (maxY - minY)) / 2) / span }));
}

const add = (seg: Segment | undefined, s: SpriteInst) => { if (seg) seg.sprites.push(s); };

const CITY_STYLES: FacadeStyle[] = ['brick', 'stone', 'arcade', 'store', 'hotel', 'office', 'brick', 'store', 'tenement', 'bank'];
const NY_STYLES: FacadeStyle[] = ['office', 'stone', 'bank', 'hotel', 'tenement', 'store', 'office', 'arcade'];
const PED_KINDS = ['gent', 'lady', 'worker', 'newsboy', 'gent', 'lady', 'boy', 'gent'];

/** Lay buildings along one side of a run of city segments. */
function lineBuildings(def: TrackDef, segs: Segment[], from: number, to: number, side: -1 | 1, rng: Rng, styles: FacadeStyle[]) {
  const cache = new Map<string, Facade>();
  let i = from;
  while (i < to) {
    if (rng.chance(0.13) && i > from + 4) { i += rng.int(3, 6); continue; } // alley / cross street
    const len = Math.min(to - i, rng.int(12, 30));
    if (len < 4) break;
    const style = rng.pick(styles);
    const tall = def.city === 'ny' ? rng.range(5200, 11000) : rng.range(3200, 7600);
    const key = `${style}|${len}|${Math.round(tall / 800)}`;
    let f = cache.get(key);
    if (!f || rng.chance(0.4)) { f = makeFacade(style, len, tall, rng.int(1, 1e9)); cache.set(key, f); }
    for (let k = 0; k < len; k++) {
      const seg = segs[i + k];
      const piece = { f, u0: (k / len) * f.tex.width, u1: ((k + 1) / len) * f.tex.width, start: k === 0, end: k === len - 1, x: FACADE_X };
      if (side < 0) seg.wallL = piece; else seg.wallR = piece;
    }
    i += len;
  }
}

function runs(segs: Segment[], pred: (s: Segment) => boolean) {
  const out: [number, number][] = [];
  let s = -1;
  for (let i = 0; i <= segs.length; i++) {
    const ok = i < segs.length && pred(segs[i]);
    if (ok && s < 0) s = i;
    if (!ok && s >= 0) { out.push([s, i]); s = -1; }
  }
  return out;
}

function decorate(def: TrackDef, segs: Segment[], rng: Rng, peds: PedDef[]) {
  const styles = def.city === 'ny' ? NY_STYLES : CITY_STYLES;
  for (const [a, b] of runs(segs, (s) => s.zone === 'city' || s.zone === 'plaza')) {
    lineBuildings(def, segs, a, b, -1, rng, styles);
    lineBuildings(def, segs, a, b, 1, rng, styles);
  }
  for (const [a, b] of runs(segs, (s) => s.zone === 'industrial')) {
    lineBuildings(def, segs, a, b, 1, rng, ['factory', 'factory', 'warehouse']);
    lineBuildings(def, segs, a, b, -1, rng, ['warehouse', 'brick', 'factory']);
  }
  segs.forEach((seg, i) => {
    const z = seg.zone;
    if (z === 'city' || z === 'plaza' || z === 'industrial') {
      if (i % 12 === 0) { add(seg, { id: 'lamp', x: -PROP_X, hit: 1, lamp: true }); add(seg, { id: 'lamp', x: PROP_X, hit: 1, lamp: true, flip: true }); }
      if (seg.rails) {
        if (i % 16 === 6) { add(seg, { id: 'trolleyPole', x: -CLEAR - 0.02, hit: 1, pole: 'trolley' }); add(seg, { id: 'trolleyPole', x: CLEAR + 0.02, hit: 1, pole: 'trolley', flip: true }); }
      } else if (i % 18 === 6) add(seg, { id: 'telePole', x: 1.74, hit: 1, pole: 'tele' });
      const hasL = !!seg.wallL, hasR = !!seg.wallR;
      if (rng.chance(z === 'industrial' ? 0.05 : 0.2)) {
        const side = rng.chance(0.5) ? -1 : 1;
        const kind = z === 'industrial' ? rng.pick(['worker', 'worker', 'gent']) : rng.pick(PED_KINDS);
        const x = side * rng.range(1.64, 1.86);
        const ped = peds.length; peds.push({ seg: i, x, kind, seed: rng.int(1, 1e9) });
        add(seg, { id: 'ped', x, ped });
      }
      if (rng.chance(0.03)) add(seg, { id: rng.pick(['hydrant', 'barrel', 'crates', 'mailbox', 'bench']), x: (rng.chance(0.5) ? -1 : 1) * rng.range(1.68, 1.82), hit: 1 });
      if ((!hasL || !hasR) && rng.chance(0.15) && z !== 'industrial') {
        const x = !hasL ? -CLEAR : CLEAR;
        const ped = peds.length; peds.push({ seg: i, x, kind: 'police', seed: rng.int(1, 1e9) });
        add(seg, { id: 'ped', x, ped });
      }
      if (z === 'industrial' && i % 40 === 20) add(seg, { id: 'smokestack', x: rng.chance(0.5) ? 3.2 : -3.4 });
      if (z === 'industrial' && i % 70 === 5) add(seg, { id: 'waterTower', x: -3.0 });
    } else if (z === 'park' || z === 'river') {
      if (i % 5 === 0) add(seg, { id: rng.pick(['elm', 'elm', 'oak', 'poplar']), x: -rng.range(2.0, 3.6), hit: 1, seed: i });
      if (z === 'park' && i % 5 === 2) add(seg, { id: rng.pick(['elm', 'oak', 'oak', 'poplar']), x: rng.range(2.0, 3.6), hit: 1, seed: i });
      if (z === 'river' && i % 8 === 0) add(seg, { id: 'railing', x: RAIL_X });
      if (i % 14 === 0) { add(seg, { id: 'parkLamp', x: -PROP_X, hit: 1, lamp: true }); add(seg, { id: 'parkLamp', x: PROP_X, hit: 1, lamp: true, flip: true }); }
      if (rng.chance(0.1)) {
        const x = (z === 'river' ? -1 : rng.chance(0.5) ? -1 : 1) * rng.range(1.64, 1.9);
        const ped = peds.length; peds.push({ seg: i, x, kind: rng.pick(['lady', 'gent', 'lady', 'boy', 'parasol']), seed: rng.int(1, 1e9) });
        add(seg, { id: 'ped', x, ped });
      }
      if (rng.chance(0.025)) add(seg, { id: 'bench', x: (rng.chance(0.5) ? -1 : 1) * 1.8, hit: 1 });
    } else if (z === 'bridge') {
      if (i % 2 === 0) { add(seg, { id: 'railing', x: -RAIL_X }); add(seg, { id: 'railing', x: RAIL_X, flip: true }); }
      if (i % 20 === 0) { add(seg, { id: 'bridgeLamp', x: -RAIL_X, lamp: true, hit: 1 }); add(seg, { id: 'bridgeLamp', x: RAIL_X, lamp: true, flip: true, hit: 1 }); }
    } else if (z === 'tunnel') {
      if (i % 8 === 0) { add(seg, { id: 'tunnelLamp', x: -TUNNEL_X, y: 1500, lamp: true }); add(seg, { id: 'tunnelLamp', x: TUNNEL_X, y: 1500, lamp: true, flip: true }); }
    }
  });
  // tunnel mouths
  for (const [a, b] of runs(segs, (s) => s.tunnel)) {
    segs[a].portal = { kind: 'tunnel', h: 2600 };
    void b;
  }
}

function applyFeature(def: TrackDef, segs: Segment[], f: { at: number; len: number; f: string }, rng: Rng, peds: PedDef[]) {
  const at = f.at, mid = at + Math.floor(f.len / 2);
  switch (f.f) {
    case 'bridge': {
      // two great stone towers the road passes through
      const t1 = at + Math.floor(f.len * 0.25), t2 = at + Math.floor(f.len * 0.75);
      segs[t1].portal = { kind: 'tower', h: 10500 };
      segs[t2].portal = { kind: 'tower', h: 10500 };
      const top = 9600, low = 1500;
      for (let i = at; i < at + f.len; i++) {
        let hgt: number;
        if (i < t1) hgt = low + (top - low) * Math.pow((i - at) / Math.max(1, t1 - at), 1.6);
        else if (i <= t2) { const u = (i - t1) / Math.max(1, t2 - t1); hgt = top - (top - low * 1.4) * Math.sin(u * Math.PI); }
        else hgt = low + (top - low) * Math.pow(1 - (i - t2) / Math.max(1, at + f.len - t2), 1.6);
        segs[i].cable = hgt;
      }
      // the deck arches up to mid-span
      for (let i = at; i < at + f.len; i++) {
        const u0 = (i - at) / f.len, u1 = (i + 1 - at) / f.len;
        segs[i].y1 += Math.sin(u0 * Math.PI) * 1800;
        segs[i].y2 += Math.sin(u1 * Math.PI) * 1800;
      }
      break;
    }
    case 'arch':
      segs[mid].portal = { kind: 'arch', h: 6800 };
      break;
    case 'trestle':
      for (let i = at; i < at + f.len; i += 6) segs[i].portal = { kind: 'trestle', h: 3800 };
      break;
    case 'depot': {
      const len = Math.min(f.len, 60);
      const fac = makeFacade('depot', len, 9800, rng.int(1, 1e9));
      for (let k = 0; k < len; k++) segs[at + k].wallR = { f: fac, u0: (k / len) * fac.tex.width, u1: ((k + 1) / len) * fac.tex.width, start: k === 0, end: k === len - 1, x: FACADE_X + 0.5 };
      for (let k = 0; k < len; k += 4) {
        const ped = peds.length; peds.push({ seg: at + k, x: rng.range(1.66, 2.3), kind: rng.pick(PED_KINDS), seed: rng.int(1, 1e9) });
        add(segs[at + k], { id: 'ped', x: peds[ped].x, ped });
      }
      break;
    }
    case 'flatiron': {
      const len = Math.min(f.len, 40);
      const fac = makeFacade('flatiron', len, 13000, rng.int(1, 1e9));
      for (let k = 0; k < len; k++) segs[at + k].wallL = { f: fac, u0: (k / len) * fac.tex.width, u1: ((k + 1) / len) * fac.tex.width, start: k === 0, end: k === len - 1, x: FACADE_X };
      break;
    }
    case 'ford': {
      const len = Math.min(f.len, 90);
      const fac = makeFacade('ford', len, 5200, rng.int(1, 1e9));
      for (let k = 0; k < len; k++) segs[at + k].wallR = { f: fac, u0: (k / len) * fac.tex.width, u1: ((k + 1) / len) * fac.tex.width, start: k === 0, end: k === len - 1, x: FACADE_X + 0.3 };
      for (let k = 0; k < len; k += 18) add(segs[at + k], { id: 'smokestack', x: 4.2 });
      break;
    }
    case 'fountain':
      add(segs[mid], { id: 'fountain', x: -2.9, hit: 1 });
      break;
    case 'stands':
      standsAt(segs, at, f.len, rng, peds);
      break;
  }
  void def;
}

function standsAt(segs: Segment[], at: number, len: number, rng: Rng, peds: PedDef[]) {
  const fac = makeFacade('stands', len, 2600, rng.int(1, 1e9));
  for (let k = 0; k < len; k++) {
    const seg = segs[at + k];
    if (!seg) continue;
    seg.bunting = true;
    const piece = (side: number) => ({ f: fac, u0: ((side < 0 ? k : len - 1 - k) / len) * fac.tex.width, u1: ((side < 0 ? k + 1 : len - k) / len) * fac.tex.width, start: k === 0, end: k === len - 1, x: FACADE_X });
    seg.wallL = piece(-1); seg.wallR = piece(1);
    if (k % 2 === 0) {
      for (const side of [-1, 1]) {
        const ped = peds.length; peds.push({ seg: at + k, x: side * rng.range(1.64, 1.84), kind: rng.pick(['gent', 'lady', 'boy', 'newsboy', 'gent', 'worker']), seed: rng.int(1, 1e9) });
        add(seg, { id: 'ped', x: peds[ped].x, ped });
      }
    }
    if (k % 10 === 0) { add(seg, { id: 'flagpole', x: -PROP_X, seed: k, hit: 1 }); add(seg, { id: 'flagpole', x: PROP_X, seed: k + 3, flip: true, hit: 1 }); }
  }
}

function finishLine(segs: Segment[], rng: Rng, peds: PedDef[]) {
  const n = segs.length;
  segs[0].finish = true; segs[1].finish = true;
  segs[2].portal = { kind: 'banner', h: 3600 };
  for (let k = -24; k < 30; k++) segs[(k + n) % n].bunting = true;
  // crowd lining the finish straight
  for (let k = -16; k < 20; k += 2) {
    const i = (k + n) % n;
    for (const side of [-1, 1]) {
      const x = side * rng.range(1.64, 1.82);
      const ped = peds.length; peds.push({ seg: i, x, kind: rng.pick(['gent', 'lady', 'boy', 'newsboy', 'worker']), seed: rng.int(1, 1e9) });
      add(segs[i], { id: 'ped', x, ped });
    }
  }
  add(segs[4], { id: 'flagman', x: -CLEAR - 0.04 });
}
