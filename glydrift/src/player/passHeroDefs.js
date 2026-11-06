// DRIFT PASS+ · Season 1 heroes (pure data). Art: pixel/passHeroes.js (atlas "pxp", 32x32 at
// 3 texture px per art px); behaviour: player/animalFx.js (the `animal` block, `pass: true`);
// sounds: audio/sfx.js (ANIMAL_SFX).
//
// Cosmetic only. Each one:
//   - is drawn ~10% smaller (visualScale) with exactly the standard hitbox (PHYSICS.radius);
//   - has no perks: same speed, gravity, score and leaderboards as every other hero;
//   - can only come from its tier of the Season 1 DRIFT PASS+ track — never the coin shop,
//     the Lucky Spin, pods or shards, during the season or after it.

const P = ({ id, tier, trail, idleHz = 6, ...o }) => ({
  id,
  texture: `hero_${id}`,
  scale: 0.62,
  visualScale: 0.92, // → 29/32 after the snap: drawn ~10% smaller than a standard hero
  pixel: {
    atlas: "pxp",
    frames: Array.from({ length: 7 }, (_, i) => `${id}_${i}`),
    mode: "animal",
    artK: 3, // texture px per art px (standard heroes: 4)
    trail,
    idleHz,
  },
  group: "pass",
  passPlus: "s1",
  passTier: tier,
  cost: 0,
  ...o,
  animal: { pass: true, ...(o.animal || {}) },
});

export const PASS_HEROES = [
  P({
    id: "voidcat",
    tier: 2,
    name: "VOIDCAT",
    title: "Galaxy Cat",
    rarity: "rare",
    color: 0x8a4ae8,
    color2: 0x3ae8ff,
    trail: [0xffffff, 0xc8b0ff, 0x8a4ae8, 0x2a1a5a],
    animal: {
      trailFx: { kind: "twinkle", color: 0xd8e0ff, every: 0.1 },
      flapFx: { kind: "twinkle", color: 0xffffff, n: 6, from: [6, 9] }, // stars spill from its paws
      glow: { color: 0x8a4ae8, x: 0, y: 2, scale: 0.55, alpha: 0.35, pulse: true },
      near: { frame: 0.25, burst: ["twinkle", 0x3ae8ff, 8] },
      best: { burst: ["star", 0xc8b0ff, 18] },
    },
    fx: {
      death: [
        { kind: "twinkle", color: 0xffffff, n: 30 },
        { kind: "dot", color: 0x8a4ae8, n: 30 },
        { kind: "star", color: 0x3ae8ff, n: 10, up: true },
      ],
    },
    desc: "A galaxy inside a cat. Stars spill from its paws on every flap.",
  }),
  P({
    id: "hexowl",
    tier: 5,
    name: "HEXOWL",
    title: "Rune Owl",
    rarity: "rare",
    color: 0xff3a4a,
    color2: 0x6a6080,
    trail: [0xffd0d4, 0xff6a7a, 0xc01a2e, 0x3a1020],
    animal: {
      trailFx: { kind: "feather", color: 0x6a6080, every: 0.32 },
      glow: { color: 0xff2a3a, x: 2.5, y: -5, scale: 0.4, alpha: 0.45, pulse: true },
      near: { frame: 0.35, burst: ["rune", 0xff3a4a, 7], flash: 0xff3a4a },
      best: { burst: ["rune", 0xff6a7a, 16] },
    },
    fx: {
      flap: { kind: "feather", color: 0x8a80a0, n: 3 },
      death: [
        { kind: "rune", color: 0xff3a4a, n: 16 },
        { kind: "feather", color: 0x6a6080, n: 20 },
      ],
    },
    desc: "Red rune eyes. The runes on its wings flash on every near-miss.",
  }),
  P({
    id: "wraithmoth",
    tier: 10,
    name: "WRAITH MOTH",
    title: "Ghost Moth",
    rarity: "rare",
    color: 0x7affe0,
    color2: 0xb8b0c8,
    trail: [0xffe8c0, 0xffa04a, 0x8a8494, 0x3a3444],
    idleHz: 5,
    animal: {
      trailFx: { kind: "ember", color: 0xff8a2a, every: 0.07, alt: { kind: "ash", color: 0x9a94a8 } },
      glow: { color: 0x7affe0, x: -5, y: -6, scale: 0.6, alpha: 0.35, pulse: true },
      near: { frame: 0.2, burst: ["ash", 0xd8d0e8, 10] },
      best: { burst: ["ember", 0xffc04a, 22] },
    },
    fx: {
      flap: { kind: "ash", color: 0xb8b0c8, n: 4 },
      death: [
        { kind: "ash", color: 0xd8d0e8, n: 30, up: true },
        { kind: "ember", color: 0xff8a2a, n: 24 },
      ],
    },
    desc: "Torn wings that glow in the dark. Leaves a trail of ash and embers.",
  }),
  P({
    id: "triphound",
    tier: 16,
    name: "TRIPHOUND",
    title: "Three-Headed Pup",
    rarity: "epic",
    color: 0xff3a4a,
    color2: 0x5a4a78,
    trail: [0xd8c8ff, 0x8a7aa8, 0x4a3c66, 0x1a1428],
    animal: {
      barkHeads: true, // each flap: the next head barks (frames 4, 5, 6)
      trailFx: { kind: "smoke", color: 0x4a3c66, every: 0.12 },
      near: { burst: ["dot", 0xff3a4a, 8] },
      best: { burst: ["star", 0xff6a7a, 14] },
    },
    fx: {
      flap: { kind: "smoke", color: 0x5a4a78, n: 2 },
      death: [
        { kind: "smoke", color: 0x2e2640, n: 30 },
        { kind: "dot", color: 0xff3a4a, n: 24 },
      ],
    },
    desc: "Three heads, one tiny shadow pup. The heads take turns barking as it flaps.",
  }),
  P({
    id: "phantomray",
    tier: 20,
    name: "PHANTOM RAY",
    title: "Smoke Manta",
    rarity: "epic",
    color: 0xb48aff,
    color2: 0x2a2838,
    trail: [0xe0d0ff, 0x9a86c0, 0x4a4460, 0x1a1828],
    idleHz: 4,
    animal: {
      ripple: true, // ripples instead of flaps: no flap squash, a wave runs down its wings
      trail: "smoke",
      trailFx: { kind: "smoke", color: 0x5a5470, every: 0.09 },
      near: { burst: ["dot", 0xb48aff, 10] },
      best: { burst: ["smoke", 0xb48aff, 20] },
    },
    fx: {
      death: [
        { kind: "smoke", color: 0x3a3450, n: 36 },
        { kind: "dot", color: 0xb48aff, n: 24 },
      ],
    },
    desc: "A manta of shadow and smoke. It ripples through the air instead of flapping.",
  }),
  P({
    id: "scorpyre",
    tier: 25,
    name: "SCORPYRE",
    title: "Obsidian Scorpion",
    rarity: "epic",
    color: 0xff6a1a,
    color2: 0x1e1830,
    trail: [0xffe8a0, 0xffa02a, 0xff4a1a, 0x5a1a0a],
    animal: {
      trailFx: { kind: "ember", color: 0xffa02a, every: 0.09 },
      flapFx: { kind: "spark", color: 0xffb04a, n: 7, from: [1, -9] }, // sparks off the stinger
      glow: { color: 0xff6a1a, x: 1, y: -9, scale: 0.4, alpha: 0.55, pulse: true },
      near: { burst: ["spark", 0xffd04a, 10] },
      best: { burst: ["fire", 0xffffff, 26] },
    },
    fx: {
      death: [
        { kind: "fire", color: 0xffffff, n: 40 },
        { kind: "ember", color: 0xff6a1a, n: 20 },
      ],
    },
    desc: "Obsidian armour and a flaming stinger. Throws sparks on every flap.",
  }),
  P({
    id: "krakkie",
    tier: 31,
    name: "KRAKKIE",
    title: "Baby Kraken",
    rarity: "epic",
    color: 0x4affd8,
    color2: 0x3a1a5a,
    trail: [0xc8fff4, 0x4affd8, 0x5a2a8a, 0x2a1446],
    animal: {
      trailFx: { kind: "bubble", color: 0x4affd8, every: 0.16 },
      glow: { color: 0x4affd8, x: -6, y: 2, scale: 0.55, alpha: 0.3, pulse: true },
      near: { frame: 0.25, burst: ["bubble", 0x4affd8, 8] },
      best: { burst: ["goo", 0x4affd8, 16] },
    },
    fx: {
      flap: { kind: "bubble", color: 0xc8fff4, n: 3 },
      death: [
        { kind: "goo", color: 0x3a1a5a, n: 20 },
        { kind: "bubble", color: 0x4affd8, n: 20 },
      ],
    },
    desc: "A baby shadow kraken with glowing suckers. Its tentacles swirl behind it.",
  }),
  P({
    id: "crimsonmantis",
    tier: 35,
    name: "CRIMSON MANTIS",
    title: "Blade Dancer",
    rarity: "epic",
    color: 0xd8203a,
    color2: 0xffd84a,
    trail: [0xffd0d8, 0xff4a5a, 0xb0182a, 0x3a0a14],
    animal: {
      slash: true, // near-miss: it slashes the air (frame 6 + a blade arc)
      trailFx: { kind: "dot", color: 0xff4a5a, every: 0.1 },
      near: { frame: 0.3, burst: ["slash", 0xffd0d8, 2] },
      best: { burst: ["slash", 0xffffff, 6] },
    },
    fx: {
      flap: { kind: "dot", color: 0xff6a7a, n: 3 },
      death: [
        { kind: "slash", color: 0xffd0d8, n: 8 },
        { kind: "shard", color: 0xd8203a, n: 16 },
      ],
    },
    desc: "A crimson mantis that slashes the air whenever you skim past danger.",
  }),
  P({
    id: "gloomeleon",
    tier: 40,
    name: "GLOOMELEON",
    title: "Realm Chameleon",
    rarity: "legendary",
    color: 0x3aa86a,
    color2: 0xffffff,
    trail: [0xffffff, 0xd8ffe8, 0x3aa86a, 0x1a4a2a],
    animal: {
      chameleon: true, // skin takes each realm's colour; fades nearly invisible on a new best
      trailFx: { kind: "dot", color: 0xffffff, every: 0.1, realm: true },
      near: { frame: 0.3 },
      best: { vanish: true },
    },
    fx: {
      death: [
        { kind: "dot", color: 0xffffff, n: 36 },
        { kind: "shard", color: 0x3aa86a, n: 16 },
      ],
    },
    desc: "Its skin takes on each realm's colour. On a new best it flickers almost invisible (still hittable).",
  }),
  P({
    id: "umbradrake",
    tier: 46,
    name: "UMBRA DRAKE",
    title: "Shadow Dragon",
    rarity: "legendary",
    color: 0xff2a4a,
    color2: 0x2a1a3e,
    trail: [0xffd0d8, 0xff3a5a, 0x7a1a4a, 0x1a0a2a],
    animal: {
      trailFx: { kind: "ember", color: 0xff3a5a, every: 0.06 },
      glow: { color: 0xff2040, x: 1.5, y: 3.5, scale: 0.5, alpha: 0.6, beat: true },
      near: { burst: ["ember", 0xff5a7a, 10] },
      best: { breath: true }, // breathes dark fire (frame 6 + a stream of dark flames)
      death: "firestorm", // a red firestorm
    },
    fx: {
      flap: { kind: "ember", color: 0xff4a6a, n: 4 },
      death: [
        { kind: "redfire", color: 0xffffff, n: 60 },
        { kind: "ember", color: 0xff2a4a, n: 30 },
      ],
    },
    desc: "A baby shadow dragon with a crimson flame heart. Breathes dark fire on a new best.",
  }),
  // ---- RIFTLING: Season 1's evolving pass hero. Each form is its own hero in the picker
  // (keep flying any form you've unlocked); same hitbox, speed and score rules as everyone.
  P({
    id: "riftling",
    tier: 1,
    name: "RIFTLING",
    title: "Evolving · Base Form",
    rarity: "rare",
    color: 0x6a3aa8,
    color2: 0x3ef4ff,
    trail: [0xe8ffff, 0x9af4ff, 0x6a3aa8, 0x2a1450],
    evolve: { line: "riftling", stage: 1 },
    animal: {
      trailFx: { kind: "twinkle", color: 0x9af4ff, every: 0.14 },
      glow: { color: 0x3ef4ff, x: 2, y: -2, scale: 0.4, alpha: 0.3, pulse: true },
      near: { frame: 0.25, burst: ["twinkle", 0x3ef4ff, 6] },
      best: { burst: ["star", 0x9af4ff, 14] },
    },
    fx: { death: [{ kind: "twinkle", color: 0x9af4ff, n: 24 }, { kind: "dot", color: 0x6a3aa8, n: 24 }] },
    desc: "A one-eyed rift imp, newly hatched. It evolves as you climb the Drift Pass+.",
  }),
  P({
    id: "riftling_armor",
    tier: 15,
    name: "RIFTLING",
    title: "Evolving · Armored",
    rarity: "epic",
    color: 0xc8102e,
    color2: 0xffd23f,
    trail: [0xfff0a0, 0xffd23f, 0xc8102e, 0x3a1a6a],
    evolve: { line: "riftling", stage: 2 },
    animal: {
      trailFx: { kind: "ember", color: 0xffd23f, every: 0.12 },
      glow: { color: 0xff3a4a, x: 2, y: 4, scale: 0.45, alpha: 0.35, pulse: true },
      flapFx: { kind: "spark", color: 0xffd23f, n: 4, from: [2, 6] },
      near: { frame: 0.25, burst: ["spark", 0xffd23f, 8] },
      best: { burst: ["star", 0xffd23f, 18] },
    },
    fx: { death: [{ kind: "spark", color: 0xffd23f, n: 30 }, { kind: "dot", color: 0xc8102e, n: 30 }] },
    desc: "Riftling in crimson plate with gold rivets. Sparks fly from its armor on every flap.",
  }),
  P({
    id: "riftling_aura",
    tier: 30,
    name: "RIFTLING",
    title: "Evolving · Awakened",
    rarity: "epic",
    color: 0xff3a4a,
    color2: 0xb45cff,
    trail: [0xffd0d8, 0xff5a3a, 0xb45cff, 0x2a1450],
    evolve: { line: "riftling", stage: 3 },
    animal: {
      trailFx: { kind: "ember", color: 0xff5a3a, every: 0.08, alt: { kind: "twinkle", color: 0xb45cff } },
      glow: { color: 0xff3a4a, x: 1, y: 2, scale: 0.75, alpha: 0.5, beat: true },
      orbit: { color: 0xff7a5a, n: 2, r: 15, speed: 2.2 },
      flapFx: { kind: "ember", color: 0xff5a3a, n: 5, from: [2, 6] },
      near: { frame: 0.25, burst: ["ember", 0xff7a5a, 10] },
      best: { burst: ["star", 0xff5a3a, 22] },
    },
    fx: { death: [{ kind: "ember", color: 0xff3a4a, n: 40 }, { kind: "twinkle", color: 0xb45cff, n: 20 }] },
    desc: "The armor's runes wake up: an aura of abyss fire, and two runes circling it.",
  }),
  P({
    id: "riftsovereign",
    tier: 50,
    name: "RIFT SOVEREIGN",
    title: "Evolving · Legendary Form",
    rarity: "legendary",
    color: 0xffd23f,
    color2: 0x241040,
    trail: [0xfff6c0, 0xffd23f, 0xff8a1a, 0x241040],
    idleHz: 5,
    evolve: { line: "riftling", stage: 4 },
    animal: {
      trailFx: { kind: "ember", color: 0xffd23f, every: 0.06, alt: { kind: "twinkle", color: 0xffffff } },
      glow: { color: 0xffc83d, x: 0, y: 0, scale: 0.95, alpha: 0.55, pulse: true },
      // its own idle (runes orbiting its crown) and its own flap (a gold ring + crown sparks)
      orbit: { color: 0xffd23f, n: 3, r: 18, speed: 1.6, alt: 0xff5a3a },
      flapRing: 0xffd23f,
      flapFx: { kind: "star", color: 0xfff0a0, n: 6, from: [2, -7] },
      near: { frame: 0.3, burst: ["star", 0xffd23f, 12] },
      best: { burst: ["star", 0xffd23f, 30] },
    },
    fx: {
      death: [
        { kind: "star", color: 0xffd23f, n: 40 },
        { kind: "ember", color: 0xff8a1a, n: 30 },
        { kind: "twinkle", color: 0xffffff, n: 16, up: true },
      ],
    },
    desc: "Riftling's final form: a gold horn-crown, flame-edged wings and a cape of night.",
  }),
];

/** Pass heroes by tier, for the season's DRIFT PASS+ track. */
export const PASS_HERO_TIERS = Object.fromEntries(PASS_HEROES.map((h) => [h.passTier, h.id]));
