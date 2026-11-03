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
];
