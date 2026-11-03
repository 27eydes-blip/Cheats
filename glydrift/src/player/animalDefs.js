// The 30 animal heroes (pure data). Art: pixel/animal*.js (atlas "pxa"); behaviour:
// player/animalFx.js (the `animal` block); sounds: audio/sfx.js (ANIMAL_SFX).
// Every animal uses the standard hitbox (PHYSICS.radius) — none is easier or harder to fly.
//
// Unlock routes:
//   peaceful  cheap coin starters, and BAO from a 7-day login streak
//   prism     challenges in the Prism Rift (cost 0: challenge only)
//   abyss     challenges in the Abyss (cost 0: challenge only)
//   christmas December only (shop + Drift Pass), hidden the rest of the year, back next year

const A = ({ id, frames = 3, trail, idleHz, ...o }) => ({
  id,
  texture: `hero_${id}`,
  scale: 0.62,
  pixel: {
    atlas: "pxa",
    frames: Array.from({ length: frames }, (_, i) => `${id}_${i}`),
    mode: "animal",
    trail,
    idleHz,
  },
  animal: {},
  ...o,
});

const DECEMBER = { month: 11 };

export const ANIMALS = [
  // ================================================================ PEACEFUL
  A({
    id: "bunbun",
    name: "BUNBUN",
    title: "Floppy Bunny",
    group: "peaceful",
    rarity: "common",
    color: 0xff9ac8,
    color2: 0xfff4ec,
    trail: [0xffffff, 0xffd0e4, 0xff9ac8, 0xe86aa0],
    animal: { trailFx: { kind: "petal", color: 0xffffff, every: 0.11 } },
    fx: {
      flap: { kind: "petal", color: 0xffffff, n: 4 },
      death: [
        { kind: "petal", color: 0xffffff, n: 30 },
        { kind: "heart", color: 0xff9ac8, n: 8, up: true },
      ],
    },
    cost: 300,
    desc: "Flaps its floppy ears. Petal trail. Bursts into blossoms.",
  }),
  A({
    id: "puddles",
    name: "PUDDLES",
    title: "Pond Duckling",
    group: "peaceful",
    rarity: "common",
    color: 0xffd84a,
    color2: 0x3aa8e0,
    trail: [0xffffff, 0xfff0a0, 0x7ad8ff, 0x3aa8e0],
    fx: {
      flap: { kind: "dot", color: 0x7ad8ff, n: 5 },
      death: [
        { kind: "dot", color: 0x7ad8ff, n: 40, up: true },
        { kind: "bubble", color: 0xffffff, n: 12 },
      ],
    },
    cost: 400,
    desc: "Quacks on every flap. Splashes down when it crashes.",
  }),
  A({
    id: "snoozy",
    name: "SNOOZY",
    title: "Sleepy Sloth",
    group: "peaceful",
    rarity: "rare",
    color: 0x8ad86a,
    color2: 0xf0dcc0,
    frames: 4,
    idleHz: 1.5,
    trail: [0xf0f8ff, 0xd8f0ff, 0xa8d8ff, 0x7ab0e0],
    animal: {
      trailFx: {
        kind: "zzz",
        color: 0xd8f0ff,
        every: 0.4,
        angle: { min: 230, max: 280 },
        speed: { min: 20, max: 50 },
      },
      yawn: true,
      flapHold: 0.3,
    },
    fx: {
      flap: { kind: "feather", color: 0x8ad86a, n: 3 },
      death: [
        { kind: "zzz", color: 0xffffff, n: 8, up: true },
        { kind: "feather", color: 0x5ad84a, n: 16 },
      ],
    },
    cost: 900,
    desc: "Glides on a leaf, half asleep. Zzz trail. Big slow yawns.",
  }),
  A({
    id: "kai",
    name: "KAI THE KOI",
    title: "Pond Spirit",
    group: "peaceful",
    rarity: "epic",
    color: 0xff7a2a,
    color2: 0xfff6ee,
    trail: [0xffffff, 0xbff4ff, 0xffb070, 0xff7a2a],
    animal: {
      trail: "ripple",
      trailFx: { kind: "bubble", color: 0xbff4ff, every: 0.14 },
    },
    fx: {
      flap: { kind: "bubble", color: 0xbff4ff, n: 4 },
      death: [
        { kind: "bubble", color: 0xffffff, n: 24 },
        { kind: "dot", color: 0xff7a2a, n: 30 },
      ],
    },
    cost: 2000,
    desc: "Swims through the sky. Ripple and bubble trail.",
  }),
  A({
    id: "bao",
    name: "BAO",
    title: "Zen Panda",
    group: "peaceful",
    rarity: "legendary",
    color: 0xc8ff8a,
    color2: 0xffffff,
    idleHz: 1.5,
    trail: [0xf8ffe8, 0xd8ffb0, 0x9ae86a, 0x5ab84a],
    animal: {
      trailFx: {
        kind: "dot",
        color: 0xe0ff6a,
        every: 0.09,
        angle: { min: 0, max: 360 },
        speed: { min: 10, max: 50 },
      },
      glow: { color: 0xe0ff8a, scale: 0.55, alpha: 0.35, pulse: true },
    },
    fx: {
      flap: { kind: "dot", color: 0xe0ff6a, n: 6 },
      death: [
        { kind: "dot", color: 0xe0ff6a, n: 40 },
        { kind: "feather", color: 0x5ad84a, n: 12 },
      ],
    },
    cost: 0,
    challenge: { stat: "maxStreak", value: 7, text: "Log in 7 days in a row" },
    desc: "Fireflies follow him. Never shows fear, not even in the Abyss.",
  }),
  // ================================================================ PRISM
  A({
    id: "glassfrog",
    name: "GLASSFROG",
    title: "Crystal Frog",
    group: "prism",
    rarity: "common",
    color: 0x8ae8ff,
    color2: 0xffffff,
    trail: [0xffffff, 0xd8f8ff, 0xc8b8ff, 0xffb8d8],
    animal: {
      flapRainbow: true,
      trailFx: { kind: "star", rainbow: true, every: 0.16 },
    },
    fx: {
      flap: { kind: "shard", color: 0xd8f8ff, n: 4 },
      death: [
        { kind: "shard", color: 0xffffff, n: 30 },
        { kind: "star", color: 0x8ae8ff, n: 16 },
      ],
    },
    cost: 0,
    challenge: { stat: "prismFound", value: 1, text: "Discover the Prism Rift" },
    desc: "See-through and sparkly. Rainbow glints on every flap.",
  }),
  A({
    id: "shardcrab",
    name: "SHARDCRAB",
    title: "Crystal Crab",
    group: "prism",
    rarity: "rare",
    color: 0xff7a5a,
    color2: 0xd28aff,
    trail: [0xffffff, 0xff9ad8, 0xd28aff, 0x8ae8ff],
    fx: {
      flap: { kind: "pixel", color: 0xd28aff, n: 5 },
      death: [
        { kind: "shard", color: 0xd28aff, n: 26 },
        { kind: "shard", color: 0x8ae8ff, n: 20 },
        { kind: "pixel", color: 0xff7a5a, n: 20 },
      ],
    },
    cost: 0,
    challenge: { stat: "maxPrismM", value: 200, text: "Fly 200m inside the Prism Rift" },
    desc: "Clacks its claws on every flap. Its crystal shell shatters.",
  }),
  A({
    id: "flicker",
    name: "FLICKER",
    title: "Glass Hummingbird",
    group: "prism",
    rarity: "rare",
    color: 0xbfe8ff,
    color2: 0xff9ad8,
    idleHz: 9,
    trail: [0xffffff, 0xfff06a, 0x6ad8ff, 0xb48aff],
    animal: { after: "rainbow", flapHold: 0.1 },
    fx: {
      flap: { kind: "star", color: 0xffffff, n: 3 },
      death: [
        { kind: "shard", color: 0xbfe8ff, n: 26 },
        { kind: "star", color: 0xff9ad8, n: 14 },
        { kind: "star", color: 0x6aff9a, n: 14 },
      ],
    },
    cost: 0,
    challenge: { stat: "maxPrismM", value: 400, text: "Fly 400m inside the Prism Rift" },
    desc: "Wings too fast to see. Leaves rainbow afterimages.",
  }),
  A({
    id: "spectra",
    name: "SPECTRA",
    title: "Prism Peacock",
    group: "prism",
    rarity: "epic",
    color: 0x2a6aff,
    color2: 0xff9ad8,
    frames: 4,
    trail: [0xffffff, 0xfff06a, 0xff9ad8, 0x6ad8ff],
    animal: {
      near: { frame: 0.8, burst: ["star", 0xffffff, 12] },
      trailFx: { kind: "star", rainbow: true, every: 0.2 },
    },
    fx: {
      flap: { kind: "star", color: 0x6ad8ff, n: 4 },
      death: [
        { kind: "shard", color: 0x6ad8ff, n: 22 },
        { kind: "star", color: 0xff9ad8, n: 16 },
        { kind: "star", color: 0xfff06a, n: 16 },
      ],
    },
    cost: 0,
    challenge: { stat: "prismClears", value: 1, text: "Survive the whole Prism Rift" },
    desc: "Fans open its rainbow crystal tail on every near-miss.",
  }),
  A({
    id: "prismara",
    name: "PRISMARA",
    title: "Crystal Phoenix",
    group: "prism",
    rarity: "legendary",
    color: 0xd8b8ff,
    color2: 0xffffff,
    trail: [0xffffff, 0xff9ad8, 0x6ad8ff, 0xb48aff],
    animal: {
      revive: "reform",
      flapRainbow: true,
      glow: { color: 0xd8b8ff, scale: 0.7, alpha: 0.45, pulse: true },
      trailFx: { kind: "star", rainbow: true, every: 0.07 },
    },
    fx: {
      flap: { kind: "shard", color: 0xffffff, n: 4 },
      death: [
        { kind: "shard", color: 0xffffff, n: 30 },
        { kind: "star", color: 0xff9ad8, n: 18 },
        { kind: "star", color: 0x6ad8ff, n: 18 },
        { kind: "star", color: 0xfff06a, n: 18 },
      ],
    },
    cost: 0,
    challenge: { stat: "prismClears", value: 3, text: "Survive the Prism Rift 3 times" },
    desc: "Shatters into light and reforms on a Second Chance.",
  }),
];
