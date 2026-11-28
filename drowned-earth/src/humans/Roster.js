// Who people are. Hand-made heroes with fixed faces, plus a seeded generator
// that makes any number of distinct, repeatable raft-folk from parts.
//
// A person: { seed, name, sex 0..1, age (years), muscle 0..1, weight 0..1,
//   race {african, asian, caucasian} (sums to 1), height (scale), dials
//   {target: weight} for face/head shape, skin (MakeHuman skin set), eyes
//   (iris colour), brow, lash, hair (style) + look.hairColor, clothes [],
//   clothTints [], look {tone, beard, stubble, buzz, freckles, blush,
//   underEye, weathered, scar, tattoo, salt, wear, patches}, emotion, tier }

export const HAIR = {
  black: [0.035, 0.03, 0.028], darkBrown: [0.09, 0.06, 0.045], brown: [0.2, 0.13, 0.08], auburn: [0.32, 0.12, 0.06],
  blond: [0.55, 0.42, 0.25], ash: [0.38, 0.34, 0.3], grey: [0.5, 0.49, 0.47], white: [0.78, 0.77, 0.74],
};
const H = HAIR;

export const HEROES = {
  wren: {
    name: 'Wren Calloway-Ashe', sex: 0.42, age: 24, muscle: 0.62, weight: 0.38, race: { caucasian: 0.5, asian: 0.3, african: 0.2 }, height: 0.99,
    dials: { 'nose/nose-hump-incr': 0.25, 'chin/chin-prominent-incr': 0.2, 'cheek/l-cheek-bones-incr': 0.3, 'cheek/r-cheek-bones-incr': 0.3, 'eyes/l-eye-scale-incr': 0.15, 'eyes/r-eye-scale-incr': 0.15, 'asym/asym-nose-1-l': 0.3 },
    skin: 'young_asian_female', eyes: 'bluegreen', brow: 'brow7', lash: 'lash2', hair: 'short02',
    look: { hairColor: H.darkBrown, tone: [0.86, 0.76, 0.66], freckles: 0.8, weathered: 0.6, scar: [[0.035, -0.035], [0.052, -0.062]], salt: 0.7, wear: 0.7, patches: 1 },
    clothes: ['female_sportsuit01', 'shoes05'], clothTints: [[0.42, 0.38, 0.32], [0.3, 0.28, 0.26]], emotion: 'calm', tier: 7,
  },
  teo: {
    name: 'Teo', sex: 0.85, age: 29, muscle: 0.75, weight: 0.4, race: { caucasian: 0.5, asian: 0.3, african: 0.2 }, height: 1.03,
    dials: { 'nose/nose-hump-incr': 0.4, 'chin/chin-jaw-drop-incr': 0.2, 'head/head-square': 0.3, 'eyes/l-eye-bag-incr': 0.3, 'eyes/r-eye-bag-incr': 0.3 },
    skin: 'young_asian_male', eyes: 'bluegreen', brow: 'brow3', lash: 'lash1', hair: 'long01',
    look: { hairColor: H.darkBrown, stubble: 0.9, beard: 0.15, weathered: 0.6, underEye: 0.7, salt: 0.8, wear: 0.8, patches: 2 },
    clothes: ['male_casualsuit04', 'shoes01'], clothTints: [[0.25, 0.3, 0.32], [0.2, 0.18, 0.16]], emotion: 'tired', tier: 7,
  },
  oru: {
    name: 'Madam Oru Vance', sex: 0.05, age: 58, muscle: 0.45, weight: 0.62, race: { african: 0.7, asian: 0.2, caucasian: 0.1 }, height: 1.0,
    dials: { 'nose/nose-scale-horiz-incr': 0.3, 'mouth/mouth-scale-horiz-incr': 0.2, 'cheek/l-cheek-bones-incr': 0.5, 'cheek/r-cheek-bones-incr': 0.5, 'eyes/l-eye-height2-decr': 0.3, 'eyes/r-eye-height2-decr': 0.3, 'chin/chin-prominent-incr': 0.3 },
    skin: 'middleage_african_female', eyes: 'brown', brow: 'brow10', lash: 'lash3', hair: 'bob02',
    look: { hairColor: H.grey, tone: [0.92, 0.88, 0.85], underEye: 0.6, weathered: 0.4, blush: 0.2, salt: 0.2, wear: 0.25 },
    clothes: ['female_casualsuit02', 'shoes03'], clothTints: [[0.62, 0.26, 0.12], [0.18, 0.12, 0.08]], emotion: 'suspicious', tier: 4,
  },
  koa: {
    name: 'Elder Tamsin Koa', sex: 0.08, age: 71, muscle: 0.3, weight: 0.42, race: { asian: 0.6, caucasian: 0.4 }, height: 0.96,
    dials: { 'eyes/l-eye-epicanthus-in': 0.4, 'eyes/r-eye-epicanthus-in': 0.4, 'nose/nose-scale-vert-decr': 0.2, 'head/head-oval': 0.4, 'mouth/mouth-lowerlip-volume-decr': 0.3 },
    skin: 'old_asian_female', eyes: 'brownlight', brow: 'brow12', lash: 'lash1', hair: 'braid01',
    look: { hairColor: H.white, weathered: 0.75, freckles: 0.3, underEye: 0.4, salt: 0.3, wear: 0.6, patches: 1 },
    clothes: ['female_casualsuit01', 'shoes06'], clothTints: [[0.34, 0.45, 0.3], [0.25, 0.2, 0.15]], emotion: 'calm', tier: 5,
  },
  bram: {
    name: 'Bram Hollis', sex: 1, age: 52, muscle: 0.85, weight: 0.75, race: { caucasian: 0.8, african: 0.2 }, height: 1.05,
    dials: { 'nose/nose-scale-horiz-incr': 0.5, 'nose/nose-hump-incr': 0.5, 'head/head-square': 0.6, 'neck/neck-scale-horiz-incr': 0.5, 'chin/chin-width-incr': 0.4, 'eyes/l-eye-bag-incr': 0.5, 'eyes/r-eye-bag-incr': 0.5 },
    skin: 'middleage_caucasian_male', eyes: 'grey', brow: 'brow2', lash: 'lash1', hair: null,
    look: { hairColor: H.ash, beard: 0.95, buzz: 0.8, weathered: 0.85, underEye: 0.6, scar: [[-0.034, 0.03], [-0.018, -0.024]], tattoo: { bone: 'lowerarm01.R', style: 1 }, salt: 0.4, wear: 0.9, patches: 2 },
    clothes: ['male_worksuit01', 'shoes02'], clothTints: [[0.72, 0.6, 0.18], [0.22, 0.18, 0.12]], emotion: 'tired', tier: 5,
  },
  keeper: {
    name: 'The Keeper', sex: 0.0, age: 82, muscle: 0.2, weight: 0.3, race: { caucasian: 0.6, african: 0.4 }, height: 0.93,
    dials: { 'head/head-age-incr': 0.6, 'nose/nose-point-down': 0.4, 'mouth/mouth-lowerlip-volume-decr': 0.4, 'eyes/l-eye-bag-incr': 0.6, 'eyes/r-eye-bag-incr': 0.6, 'cheek/l-cheek-volume-decr': 0.5, 'cheek/r-cheek-volume-decr': 0.5 },
    skin: 'old_caucasian_female', eyes: 'ice', brow: 'brow11', lash: 'lash4', hair: 'long01',
    look: { hairColor: H.white, tone: [0.9, 0.86, 0.82], weathered: 0.6, underEye: 0.8, blush: 0.1, salt: 0.2, wear: 0.5 },
    clothes: ['female_casualsuit01', 'shoes06'], clothTints: [[0.8, 0.78, 0.72], [0.3, 0.28, 0.25]], emotion: 'tired', tier: 6,
  },
  marlow: {
    name: 'Captain Marlow', sex: 0.95, age: 46, muscle: 0.6, weight: 0.48, race: { african: 0.45, caucasian: 0.55 }, height: 1.04,
    dials: { 'chin/chin-cleft-incr': 0.4, 'cheek/l-cheek-bones-incr': 0.4, 'cheek/r-cheek-bones-incr': 0.4, 'eyebrows/eyebrows-angle-up': 0.3, 'mouth/mouth-scale-horiz-incr': 0.2 },
    skin: 'middleage_african_male', eyes: 'brownlight', brow: 'brow4', lash: 'lash1', hair: 'short02',
    look: { hairColor: H.black, stubble: 1, beard: 0.25, weathered: 0.5, underEye: 0.7, scar: [[0.05, 0.034], [0.056, -0.012]], salt: 0.5, wear: 0.4 },
    clothes: ['male_casualsuit02', 'shoes02'], clothTints: [[0.12, 0.15, 0.24], [0.1, 0.09, 0.08]], emotion: 'amused', tier: 3,
  },
  ondine: {
    name: 'Madame Ondine', sex: 0.02, age: 41, muscle: 0.4, weight: 0.45, race: { caucasian: 0.5, asian: 0.5 }, height: 1.02,
    dials: { 'eyes/l-eye-corner2-up': 0.4, 'eyes/r-eye-corner2-up': 0.4, 'mouth/mouth-upperlip-volume-incr': 0.4, 'cheek/l-cheek-bones-incr': 0.6, 'cheek/r-cheek-bones-incr': 0.6, 'nose/nose-scale-horiz-decr': 0.3 },
    skin: 'young_asian_female', eyes: 'deepblue', brow: 'brow9', lash: 'lash4', hair: 'long01',
    look: { hairColor: H.black, blush: 0.6, underEye: 0.3, weathered: 0.1, salt: 0.0, wear: 0.1 },
    clothes: ['female_casualsuit02', 'shoes04'], clothTints: [[0.35, 0.08, 0.14], [0.08, 0.06, 0.06]], emotion: 'amused', tier: 4,
  },
  calloway: {
    name: 'Chancellor Idris Calloway', sex: 1, age: 63, muscle: 0.45, weight: 0.55, race: { african: 0.35, caucasian: 0.65 }, height: 1.02,
    dials: { 'head/head-oval': 0.5, 'nose/nose-scale-vert-incr': 0.3, 'eyebrows/eyebrows-angle-down': 0.2, 'mouth/mouth-scale-horiz-incr': 0.15, 'neck/neck-scale-horiz-incr': 0.2 },
    skin: 'old_caucasian_male', eyes: 'grey', brow: 'brow5', lash: 'lash1', hair: 'short04',
    look: { hairColor: H.grey, stubble: 0.1, weathered: 0.05, underEye: 0.4, salt: 0, wear: 0 },
    clothes: ['male_casualsuit06', 'shoes03'], clothTints: [[0.88, 0.86, 0.8], [0.25, 0.22, 0.12]], emotion: 'calm', tier: 1,
  },
  voss: {
    name: 'Director Halden Voss', sex: 1, age: 55, muscle: 0.55, weight: 0.35, race: { caucasian: 0.9, asian: 0.1 }, height: 1.06,
    dials: { 'head/head-rectangular': 0.5, 'nose/nose-point-width-decr': 0.4, 'mouth/mouth-lowerlip-volume-decr': 0.5, 'mouth/mouth-upperlip-volume-decr': 0.4, 'eyes/l-eye-height2-decr': 0.4, 'eyes/r-eye-height2-decr': 0.4, 'chin/chin-prominent-incr': 0.4 },
    skin: 'middleage_caucasian_male', eyes: 'lightblue', brow: 'brow6', lash: 'lash1', hair: 'short01',
    look: { hairColor: H.darkBrown, stubble: 0.05, weathered: 0.1, underEye: 0.5, salt: 0, wear: 0 },
    clothes: ['male_casualsuit03', 'shoes03'], clothTints: [[0.1, 0.12, 0.2], [0.07, 0.07, 0.08]], emotion: 'suspicious', tier: 1,
  },
  ansel: {
    name: 'Mother Ansel', sex: 0.05, age: 66, muscle: 0.3, weight: 0.65, race: { african: 0.85, caucasian: 0.15 }, height: 0.97,
    dials: { 'head/head-round': 0.5, 'cheek/l-cheek-volume-incr': 0.4, 'cheek/r-cheek-volume-incr': 0.4, 'nose/nose-scale-horiz-incr': 0.4, 'mouth/mouth-scale-horiz-incr': 0.2 },
    skin: 'old_african_female', eyes: 'brown', brow: 'brow8', lash: 'lash2', hair: 'afro01',
    look: { hairColor: H.grey, blush: 0.15, underEye: 0.5, weathered: 0.45, salt: 0.3, wear: 0.5, patches: 1 },
    clothes: ['female_casualsuit01', 'shoes06'], clothTints: [[0.82, 0.76, 0.62], [0.25, 0.2, 0.16]], emotion: 'calm', tier: 6,
  },
};

// ---------------------------------------------------------------- generator
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

// face/head dials that make faces individual; l/r pairs are set together (symmetric) and asym adds a little unevenness
const DIAL_GROUPS = [
  ['nose/nose-scale-horiz-incr', 'nose/nose-scale-horiz-decr'], ['nose/nose-scale-vert-incr', 'nose/nose-scale-vert-decr'], ['nose/nose-hump-incr', 'nose/nose-hump-decr'],
  ['nose/nose-point-width-incr', 'nose/nose-point-width-decr'], ['nose/nose-nostrils-width-incr', 'nose/nose-nostrils-width-decr'], ['nose/nose-point-up', 'nose/nose-point-down'],
  ['nose/nose-volume-incr', 'nose/nose-volume-decr'], ['nose/nose-greek-incr', 'nose/nose-greek-decr'],
  ['mouth/mouth-scale-horiz-incr', 'mouth/mouth-scale-horiz-decr'], ['mouth/mouth-lowerlip-volume-incr', 'mouth/mouth-lowerlip-volume-decr'], ['mouth/mouth-upperlip-volume-incr', 'mouth/mouth-upperlip-volume-decr'],
  ['chin/chin-prominent-incr', 'chin/chin-prominent-decr'], ['chin/chin-width-incr', 'chin/chin-width-decr'], ['chin/chin-jaw-drop-incr', 'chin/chin-jaw-drop-decr'],
  ['head/head-oval', 'head/head-round', 'head/head-square', 'head/head-rectangular', 'head/head-diamond', 'head/head-invertedtriangular'],
  ['head/head-scale-horiz-incr', 'head/head-scale-horiz-decr'], ['forehead/forehead-scale-vert-incr', 'forehead/forehead-scale-vert-decr'],
  ['neck/neck-scale-horiz-incr', 'neck/neck-scale-horiz-decr'],
];
const SYM = [
  ['eyes/l-eye-scale-incr', 'eyes/r-eye-scale-incr', 'eyes/l-eye-scale-decr', 'eyes/r-eye-scale-decr'],
  ['eyes/l-eye-height2-incr', 'eyes/r-eye-height2-incr', 'eyes/l-eye-height2-decr', 'eyes/r-eye-height2-decr'],
  ['eyes/l-eye-trans-in', 'eyes/r-eye-trans-in', 'eyes/l-eye-trans-out', 'eyes/r-eye-trans-out'],
  ['eyes/l-eye-corner2-up', 'eyes/r-eye-corner2-up', 'eyes/l-eye-corner2-down', 'eyes/r-eye-corner2-down'],
  ['eyes/l-eye-bag-incr', 'eyes/r-eye-bag-incr', 'eyes/l-eye-bag-decr', 'eyes/r-eye-bag-decr'],
  ['eyes/l-eye-epicanthus-in', 'eyes/r-eye-epicanthus-in', 'eyes/l-eye-epicanthus-out', 'eyes/r-eye-epicanthus-out'],
  ['cheek/l-cheek-bones-incr', 'cheek/r-cheek-bones-incr', 'cheek/l-cheek-bones-decr', 'cheek/r-cheek-bones-decr'],
  ['cheek/l-cheek-volume-incr', 'cheek/r-cheek-volume-incr', 'cheek/l-cheek-volume-decr', 'cheek/r-cheek-volume-decr'],
  ['ears/l-ear-scale-incr', 'ears/r-ear-scale-incr', 'ears/l-ear-scale-decr', 'ears/r-ear-scale-decr'],
  ['ears/l-ear-flap-incr', 'ears/r-ear-flap-incr', 'ears/l-ear-flap-decr', 'ears/r-ear-flap-decr'],
];
const ASYM = ['asym/asym-nose-1-l', 'asym/asym-nose-1-r', 'asym/asym-mouth-1-l', 'asym/asym-mouth-1-r', 'asym/asym-eye-1-l', 'asym/asym-eye-1-r', 'asym/asym-brown-1-l', 'asym/asym-brown-1-r', 'asym/asym-cheek-1-l', 'asym/asym-cheek-1-r', 'asym/asym-ear-1-l', 'asym/asym-ear-1-r'];
const MALE_CLOTHES = ['male_casualsuit01', 'male_casualsuit02', 'male_casualsuit03', 'male_casualsuit04', 'male_casualsuit05', 'male_worksuit01'];
const FEMALE_CLOTHES = ['female_casualsuit01', 'female_casualsuit02', 'male_casualsuit04', 'male_worksuit01', 'male_casualsuit01', 'female_casualsuit01'];   // work clothes are unisex; women's cuts never go on men
const SHOES = ['shoes01', 'shoes02', 'shoes03', 'shoes05', 'shoes06'];
// cloth palettes per community (the rafts dye with what they have)
const PALETTES = {
  default: [[0.42, 0.38, 0.32], [0.3, 0.33, 0.36], [0.5, 0.36, 0.26], [0.28, 0.3, 0.24], [0.55, 0.52, 0.46], [0.24, 0.22, 0.2]],
  portage: [[0.62, 0.3, 0.14], [0.5, 0.36, 0.22], [0.42, 0.38, 0.32], [0.28, 0.25, 0.22], [0.7, 0.55, 0.3]],
  greentide: [[0.34, 0.45, 0.3], [0.42, 0.5, 0.36], [0.55, 0.52, 0.4], [0.3, 0.35, 0.28]],
  rusthold: [[0.72, 0.6, 0.18], [0.35, 0.33, 0.3], [0.25, 0.25, 0.27], [0.5, 0.4, 0.25]],
  ward: [[0.1, 0.12, 0.2], [0.14, 0.16, 0.24]],
};

export function generatePerson(seed, hints = {}) {
  const r = rng(seed * 2654435761);
  // a named NPC's recorded presentation wins; otherwise a coin flip. The dial stays near its ends so the
  // body, face and skin texture all agree with each other.
  const sex = hints.sex ?? (hints.presents === 'f' ? r() * 0.2 : hints.presents === 'm' ? 0.8 + r() * 0.2 : r() < 0.5 ? r() * 0.2 : 0.8 + r() * 0.2);
  const male = sex > 0.5;
  // ages: teens to elders, weighted to working age
  const age = hints.age ?? Math.round(r() < 0.12 ? 13 + r() * 6 : r() < 0.25 ? 60 + r() * 25 : 20 + r() * 40);
  // ancestry: mixed, usually with one dominant line
  const a = [r() ** 2, r() ** 2, r() ** 2]; const dom = Math.floor(r() * 3); a[dom] += 1.2; const sum = a[0] + a[1] + a[2];
  const race = { african: a[0] / sum, asian: a[1] / sum, caucasian: a[2] / sum };
  const raceKey = Object.entries(race).sort((x, y) => y[1] - x[1])[0][0];
  const band = age < 32 ? 'young' : age < 58 ? 'middleage' : 'old';
  const skin = `${band}_${raceKey}_${male ? 'male' : 'female'}`;
  // tone across the full range: the dominant line's skin, lightened or deepened by the mix
  const depth = race.african * 1 + race.asian * 0.35 + race.caucasian * 0.05;
  const toneK = 1.05 - (depth - (raceKey === 'african' ? 0.75 : raceKey === 'asian' ? 0.35 : 0.1)) * 0.35 + (r() - 0.5) * 0.12;
  const tone = [toneK * (1 + (r() - 0.5) * 0.04), toneK * (0.98 + (r() - 0.5) * 0.04), toneK * (0.95 + (r() - 0.5) * 0.06)];
  const dials = {};
  for (const g of DIAL_GROUPS) if (r() < 0.65) dials[pick(r, g)] = 0.15 + r() * 0.55;
  for (const g of SYM) if (r() < 0.55) { const side = r() < 0.5 ? 0 : 2; const w = 0.15 + r() * 0.5; dials[g[side]] = w; dials[g[side + 1]] = w * (0.9 + r() * 0.2); }
  for (let i = 0; i < 3; i++) dials[pick(r, ASYM)] = 0.15 + r() * 0.35;
  if (age > 50) dials['head/head-age-incr'] = Math.min(1, (age - 50) / 35);
  // hair: what grows and what people do with it on a raft
  const grey = age > 70 ? H.white : age > 55 ? (r() < 0.6 ? H.grey : H.ash) : null;
  const natural = raceKey === 'african' ? (r() < 0.8 ? H.black : H.darkBrown) : raceKey === 'asian' ? (r() < 0.85 ? H.black : H.darkBrown) : pick(r, [H.darkBrown, H.brown, H.brown, H.auburn, H.blond, H.ash, H.black]);
  const hairColor = grey ? grey.map((c, i) => c * 0.85 + natural[i] * 0.15) : natural;
  const styles = male ? ['short01', 'short02', 'short04', 'short02', 'short01', 'afro01', 'long01', null] : ['bob01', 'bob02', 'braid01', 'long01', 'ponytail01', 'afro01', 'short02', 'ponytail01'];
  let hair = hints.hair !== undefined ? hints.hair : pick(r, styles);
  if (raceKey === 'african' && r() < 0.45) hair = male ? (r() < 0.5 ? 'afro01' : null) : pick(r, ['afro01', 'braid01', 'ponytail01']);
  const pal = PALETTES[hints.palette] || PALETTES.default;
  const clothes = [pick(r, male ? MALE_CLOTHES : FEMALE_CLOTHES), pick(r, SHOES)];
  const outdoors = hints.outdoors ?? 0.7;
  return {
    seed, name: hints.name, sex, age, muscle: 0.25 + r() * 0.6 + (hints.labour || 0) * 0.15, weight: 0.2 + r() * 0.6 + (age > 45 ? 0.1 : 0),
    race, height: (male ? 1.0 : 0.97) + (r() - 0.5) * 0.08, dials, skin, eyes: pick(r, raceKey === 'caucasian' ? ['brown', 'brownlight', 'blue', 'bluegreen', 'green', 'grey', 'lightblue'] : ['brown', 'brown', 'brownlight', 'brownlight', 'grey']),
    brow: `brow${1 + Math.floor(r() * 12)}`, lash: `lash${1 + Math.floor(r() * 4)}`, hair,
    look: {
      hairColor, tone,
      beard: male && age > 18 && r() < 0.3 ? 0.5 + r() * 0.5 : 0, stubble: male && age > 16 ? r() : 0, buzz: hair === null ? 0.5 + r() * 0.5 : 0,
      freckles: raceKey === 'caucasian' && r() < 0.35 ? r() : 0, blush: r() * 0.5, underEye: 0.2 + r() * 0.6, weathered: Math.min(1, outdoors * (0.3 + r() * 0.5) + age / 120),
      scar: r() < 0.12 ? (() => { const x = (r() - 0.5) * 0.1, y = (r() - 0.6) * 0.08; return [[x, y], [x + (r() - 0.5) * 0.04, y - 0.02 - r() * 0.03]]; })() : null,
      tattoo: r() < 0.18 ? { bone: r() < 0.5 ? 'lowerarm01.L' : 'lowerarm01.R', style: Math.floor(r() * 2) } : null,
      salt: outdoors * (0.3 + r() * 0.6), wear: 0.3 + r() * 0.6, patches: Math.floor(r() * 2.5),
    },
    clothes, clothTints: clothes.map((c) => (/shoes/.test(c) ? pick(r, [[0.2, 0.15, 0.1], [0.12, 0.11, 0.1], [0.3, 0.24, 0.18], [0.24, 0.24, 0.22]]) : pick(r, pal).map((x) => x * (0.85 + r() * 0.3)))),
    emotion: pick(r, ['calm', 'calm', 'calm', 'tired', 'worried', 'amused', 'suspicious']), tier: hints.tier ?? 6,
  };
}

export function personFor(id, hints = {}) {
  if (HEROES[id]) return { seed: hashStr(id), ...HEROES[id] };
  return generatePerson(hashStr(id), hints);
}
export function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// Speaking pitch multiplier for the voice synth (1 = neutral). Female-presenting voices sit above 1.08,
// male-presenting below 1.0; age lowers it a little, and each person gets a stable offset of their own
// so two people of the same kind don't sound identical.
export function voicePitch(p) {
  const own = ((hashStr(p.seed ?? p.name ?? '') % 1000) / 1000 - 0.5) * 0.1;
  const age = Math.max(0, (p.age ?? 35) - 35) / 200;
  return p.sex > 0.5 ? Math.min(0.99, 0.9 + own - age) : Math.max(1.08, 1.2 + own - age);
}
