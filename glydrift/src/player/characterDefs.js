// Pure data for the character roster (no Phaser imports, safe to use in systems).
import { ANIMALS } from "./animalDefs.js";
import { PASS_HEROES } from "./passHeroDefs.js";

export const CHARACTERS = [
  {
    id: "volt",
    name: "VOLT",
    title: "Storm Bird",
    rarity: "common",
    color: 0x38f6ff,
    color2: 0xffffff,
    texture: "hero_volt",
    // pixel-art sprite (atlas + idle/flap frames) used in play
    pixel: {
      atlas: "pxc",
      frames: ["volt_0", "volt_1", "volt_2"],
      trail: [0xffffff, 0x8fe4ff, 0x2aa8ff, 0x1670d0],
    },
    scale: 0.62,
    cost: 0,
    desc: "Lightning trail. Crackles on every flap.",
  },
  {
    id: "ember",
    name: "EMBER",
    title: "Phoenix",
    rarity: "rare",
    color: 0xff7a1a,
    color2: 0xffd23f,
    texture: "hero_ember",
    pixel: {
      atlas: "pxc",
      frames: ["ember_0", "ember_1", "ember_2"],
      mode: "wings",
      trail: [0xfff1a0, 0xffa21a, 0xff5a1a, 0xb01000],
    },
    scale: 0.64,
    cost: 1500,
    shards: 5,
    desc: "Fire trail. Bursts into flames.",
  },
  {
    id: "frost",
    name: "FROST",
    title: "Ice Crystal",
    rarity: "rare",
    color: 0x9ff2ff,
    color2: 0xffffff,
    texture: "hero_frost",
    pixel: {
      atlas: "pxc",
      frames: ["frost_0", "frost_1", "frost_2"],
      mode: "idle",
      trail: [0xffffff, 0xbff4ff, 0x7fd0ff, 0x3a8ad8],
    },
    scale: 0.6,
    cost: 2000,
    shards: 5,
    challenge: { stat: "maxBiome", value: 3, text: "Reach the Glitch Realm" },
    desc: "Frost trail. Shatters into snowflakes.",
  },
  {
    id: "shade",
    name: "SHADE",
    title: "Shadow Ninja",
    rarity: "epic",
    color: 0xa45cff,
    color2: 0xe0b8ff,
    texture: "hero_shade",
    pixel: {
      atlas: "pxc",
      frames: ["shade_0", "shade_1", "shade_2"],
      mode: "idle",
      trail: [0xe0c8ff, 0xb45cff, 0x6a2cc0, 0x2a1060],
    },
    scale: 0.62,
    cost: 5000,
    challenge: { stat: "maxNearRun", value: 18, text: "18 near-misses in one run" },
    desc: "Afterimage trail. Dissolves into smoke.",
  },
  {
    id: "glitch",
    name: "GLITCH",
    title: "Pixel Creature",
    rarity: "epic",
    color: 0x39ff88,
    color2: 0xff2bd6,
    texture: "hero_glitch",
    pixel: {
      atlas: "pxc",
      frames: ["glitch_0", "glitch_1", "glitch_2"],
      mode: "glitch",
      trail: [0xff2050, 0x39ff88, 0x20c8ff, 0x39ff88],
    },
    scale: 0.56,
    cost: 6000,
    challenge: { stat: "maxBiome", value: 4, text: "Reach the Abyss" },
    desc: "RGB-split trail. Glitches out of existence.",
  },
  {
    id: "nova",
    name: "NOVA",
    title: "Living Star",
    rarity: "legendary",
    color: 0xfff1a8,
    color2: 0xff7ad9,
    texture: "hero_nova",
    pixel: {
      atlas: "pxc",
      frames: ["nova_0", "nova_1", "nova_2"],
      mode: "idle",
      trail: [0xffffff, 0xfff1a8, 0xff7ad9, 0x7ad8ff, 0x8aff8a],
    },
    scale: 0.66,
    cost: 16000,
    challenge: { stat: "maxDistance", value: 5000, text: "Fly 5000m in one run" },
    desc: "Rainbow light trail. Goes supernova.",
  },
  {
    id: "bloom",
    name: "BLOOM",
    title: "Sprout Spirit",
    rarity: "rare",
    color: 0x7aff7a,
    color2: 0xff7ac8,
    texture: "hero_bloom",
    pixel: {
      atlas: "pxc",
      frames: ["bloom_0", "bloom_1", "bloom_2"],
      mode: "idle",
      trail: [0xffd0ec, 0xff7ac8, 0x8af27a, 0x2c9a48],
    },
    fx: {
      flap: { kind: "pixel", color: 0xff9ad8, n: 6 },
      death: [
        { kind: "pixel", color: 0xff7ac8, n: 24 },
        { kind: "pixel", color: 0x8af27a, n: 24 },
      ],
    },
    scale: 0.6,
    cost: 2400,
    shards: 5,
    desc: "Petal trail. Bursts into blossoms.",
  },
  {
    id: "tide",
    name: "TIDE",
    title: "Jellyfish",
    rarity: "rare",
    color: 0x6fe8ff,
    color2: 0xff8ae0,
    texture: "hero_tide",
    pixel: {
      atlas: "pxc",
      frames: ["tide_0", "tide_1", "tide_2"],
      mode: "idle",
      trail: [0xffffff, 0x9af4ff, 0x6fe8ff, 0xff8ae0],
    },
    fx: {
      flap: { kind: "dot", color: 0xbff8ff, n: 5 },
      death: [
        { kind: "dot", color: 0xbff8ff, n: 30 },
        { kind: "pixel", color: 0xff8ae0, n: 20 },
      ],
    },
    scale: 0.6,
    cost: 3000,
    challenge: { stat: "maxPortalsRun", value: 6, text: "Pass 6 portals in one run" },
    desc: "Bubble trail. Pops into a splash.",
  },
  {
    id: "mecha",
    name: "MECHA",
    title: "Robo Drone",
    rarity: "epic",
    color: 0xff8a2a,
    color2: 0x2bffef,
    texture: "hero_mecha",
    pixel: {
      atlas: "pxc",
      frames: ["mecha_0", "mecha_1", "mecha_2"],
      mode: "spin",
      trail: [0xffffff, 0xffd23f, 0xff8a2a, 0x5a6470],
    },
    fx: {
      flap: { kind: "spark", color: 0xffd23f, n: 8 },
      death: [
        { kind: "spark", color: 0xffd23f, n: 40 },
        { kind: "pixel", color: 0x5a6470, n: 24 },
      ],
    },
    scale: 0.6,
    cost: 8000,
    challenge: { stat: "maxLasersRun", value: 15, text: "Pass 15 lasers in one run" },
    desc: "Exhaust trail. Blows a fuse.",
  },
  {
    id: "draco",
    name: "DRACO",
    title: "Baby Dragon",
    rarity: "legendary",
    color: 0x9a5cff,
    color2: 0x2bffd0,
    texture: "hero_draco",
    pixel: {
      atlas: "pxc",
      frames: ["draco_0", "draco_1", "draco_2"],
      mode: "flap",
      trail: [0xffffff, 0x2bffd0, 0x9a5cff, 0x5f2fc0],
    },
    fx: {
      flap: { kind: "fire", color: undefined, n: 6 },
      death: [
        { kind: "fire", color: undefined, n: 60 },
        { kind: "pixel", color: 0x2bffd0, n: 30 },
      ],
    },
    scale: 0.64,
    cost: 20000,
    challenge: { stat: "maxBiome", value: 5, text: "Reach the Peaceful Valley" },
    desc: "Dragonfire trail. Erupts in flames.",
  },
  {
    id: "pip",
    name: "PIP",
    title: "Pocket Sparrow",
    rarity: "common",
    color: 0xc87a3a,
    color2: 0xfff0d8,
    texture: "hero_pip",
    pixel: {
      atlas: "pxc",
      frames: ["pip_0", "pip_1", "pip_2"],
      mode: "flap",
      trail: [0xfff0d8, 0xffd8a0, 0xc87a3a, 0x8a4a1a],
    },
    fx: {
      flap: { kind: "pixel", color: 0xffd8a0, n: 6 },
      death: [
        { kind: "pixel", color: 0xc87a3a, n: 40 },
        { kind: "shard", color: 0xfff0d8, n: 18 },
      ],
    },
    scale: 0.62,
    cost: 600,
    desc: "Feather-light trail. Poofs into fluff.",
  },
  {
    id: "coral",
    name: "CORAL",
    title: "Reef Puffer",
    rarity: "common",
    color: 0xffc83d,
    color2: 0xff7a3a,
    texture: "hero_coral",
    pixel: {
      atlas: "pxc",
      frames: ["coral_0", "coral_1", "coral_2"],
      mode: "idle",
      trail: [0xffffff, 0xfff4ec, 0xffc83d, 0xff7a3a],
    },
    fx: {
      flap: { kind: "dot", color: 0xbff4ff, n: 6 },
      death: [
        { kind: "dot", color: 0xffc83d, n: 40 },
        { kind: "shard", color: 0xff7a3a, n: 18 },
      ],
    },
    scale: 0.62,
    cost: 900,
    desc: "Bubble trail. Pops like a balloon.",
  },
  {
    id: "sprout",
    name: "SPROUT",
    title: "Leaf Copter",
    rarity: "common",
    color: 0x7ad84a,
    color2: 0xd8ffb0,
    texture: "hero_sprout",
    pixel: {
      atlas: "pxc",
      frames: ["sprout_0", "sprout_1", "sprout_2"],
      mode: "spin",
      trail: [0xffffff, 0xd8ffb0, 0x7ad84a, 0x39b84a],
    },
    fx: {
      flap: { kind: "pixel", color: 0x7ad84a, n: 6 },
      death: [
        { kind: "pixel", color: 0x39b84a, n: 40 },
        { kind: "shard", color: 0xd8ffb0, n: 18 },
      ],
    },
    scale: 0.62,
    cost: 1200,
    desc: "Leaf trail. Scatters into petals.",
  },
  {
    id: "ruby",
    name: "RUBY",
    title: "Hummingbird",
    rarity: "rare",
    color: 0x2ad8a0,
    color2: 0xff2a5a,
    texture: "hero_ruby",
    pixel: {
      atlas: "pxc",
      frames: ["ruby_0", "ruby_1", "ruby_2"],
      mode: "spin",
      trail: [0xffffff, 0xff8aa8, 0xff2a5a, 0x2ad8a0],
    },
    fx: {
      flap: { kind: "spark", color: 0xff2a5a, n: 6 },
      death: [
        { kind: "spark", color: 0x2ad8a0, n: 40 },
        { kind: "shard", color: 0xff2a5a, n: 18 },
      ],
    },
    scale: 0.62,
    cost: 1800,
    shards: 5,
    desc: "Ruby trail. Bursts into gems.",
  },
  {
    id: "pengu",
    name: "PENGU",
    title: "Jetpack Penguin",
    rarity: "rare",
    color: 0x7ad8ff,
    color2: 0xffa21a,
    texture: "hero_pengu",
    pixel: {
      atlas: "pxc",
      frames: ["pengu_0", "pengu_1", "pengu_2"],
      mode: "idle",
      trail: [0xffffff, 0xfff1a0, 0xffa21a, 0x8a8aa8],
    },
    fx: {
      flap: { kind: "fire", color: 0xffa21a, n: 6 },
      death: [
        { kind: "smoke", color: 0x8a8aa8, n: 40 },
        { kind: "shard", color: 0x7ad8ff, n: 18 },
      ],
    },
    scale: 0.62,
    cost: 2200,
    challenge: { stat: "maxBiome", value: 3, text: "Reach the Glitch Realm" },
    desc: "Jet trail. Sputters out in smoke.",
  },
  {
    id: "jelly",
    name: "JELLY",
    title: "Neon Jellyfish",
    rarity: "rare",
    color: 0xff7ad9,
    color2: 0x7ad8ff,
    texture: "hero_jelly",
    pixel: {
      atlas: "pxc",
      frames: ["jelly_0", "jelly_1", "jelly_2"],
      mode: "idle",
      trail: [0xffffff, 0xffb0ec, 0xff7ad9, 0x7ad8ff],
    },
    fx: {
      flap: { kind: "dot", color: 0xff7ad9, n: 6 },
      death: [
        { kind: "dot", color: 0x7ad8ff, n: 40 },
        { kind: "star", color: 0xff7ad9, n: 18 },
      ],
    },
    scale: 0.62,
    cost: 2600,
    shards: 5,
    desc: "Glow trail. Fades into sparkles.",
  },
  {
    id: "comet",
    name: "COMET",
    title: "Star Rocket",
    rarity: "epic",
    color: 0xff3d5a,
    color2: 0xffc83d,
    texture: "hero_comet",
    pixel: {
      atlas: "pxc",
      frames: ["comet_0", "comet_1", "comet_2"],
      mode: "idle",
      trail: [0xffffff, 0xfff1a0, 0xffa21a, 0xff3d5a],
    },
    fx: {
      flap: { kind: "fire", color: 0xffa21a, n: 6 },
      death: [
        { kind: "fire", color: 0xff3d5a, n: 40 },
        { kind: "spark", color: 0xffc83d, n: 18 },
        { kind: "shard", color: 0xeef0ff, n: 18 },
      ],
    },
    scale: 0.62,
    cost: 7000,
    challenge: { stat: "maxDistance", value: 3600, text: "Fly 3600m in one run" },
    desc: "Rocket trail. Goes out with a bang.",
  },
  {
    id: "ronin",
    name: "RONIN",
    title: "Ninja Crow",
    rarity: "epic",
    color: 0xff2a3d,
    color2: 0xc8c8e0,
    texture: "hero_ronin",
    pixel: {
      atlas: "pxc",
      frames: ["ronin_0", "ronin_1", "ronin_2"],
      mode: "flap",
      trail: [0xffffff, 0xff2a3d, 0xc81a2a, 0x2a2a3a],
    },
    fx: {
      flap: { kind: "shard", color: 0xff2a3d, n: 6 },
      death: [
        { kind: "smoke", color: 0x3a3a5a, n: 40 },
        { kind: "shard", color: 0xff2a3d, n: 18 },
      ],
    },
    scale: 0.62,
    cost: 9000,
    speed: 1.1, // flies 10% faster than the standard heroes
    challenge: { stat: "maxNearRun", value: 22, text: "22 near-misses in one run" },
    // perks (look + hitbox unchanged): bonus coins every run; immune to Solar Storm fire
    perks: {
      coinBonus: 13,
      fireWard: ["geyser", "meteor", "firebar", "flare"],
      list: ["+13 coins per run", "Fire Ward: immune to fire in Solar Storm", "10% faster flight"],
    },
    desc: "Scarf trail. Vanishes in smoke.",
  },
  {
    id: "seraph",
    name: "SERAPH",
    title: "Haloed Dove",
    rarity: "epic",
    color: 0xffd23f,
    color2: 0xfff8f0,
    texture: "hero_seraph",
    pixel: {
      atlas: "pxc",
      frames: ["seraph_0", "seraph_1", "seraph_2"],
      mode: "flap",
      trail: [0xffffff, 0xfff8f0, 0xffe7a8, 0xffd23f],
    },
    fx: {
      flap: { kind: "star", color: 0xffd23f, n: 6 },
      death: [
        { kind: "star", color: 0xfff8f0, n: 40 },
        { kind: "pixel", color: 0xffd23f, n: 18 },
        { kind: "shard", color: 0xffe7a8, n: 18 },
      ],
    },
    scale: 0.62,
    cost: 11000,
    challenge: { stat: "maxPortalsRun", value: 9, text: "Pass 9 portals in one run" },
    desc: "Holy trail. Ascends in light.",
  },
  {
    id: "leviathan",
    name: "LEVIATHAN",
    title: "Sea Serpent",
    rarity: "legendary",
    color: 0x2bffef,
    color2: 0x1a6ac8,
    texture: "hero_leviathan",
    pixel: {
      atlas: "pxc",
      frames: ["leviathan_0", "leviathan_1", "leviathan_2"],
      mode: "idle",
      trail: [0xffffff, 0x7af8ff, 0x2bffef, 0x1a6ac8, 0x0a3a8a],
    },
    fx: {
      flap: { kind: "dot", color: 0x7af8ff, n: 6 },
      death: [
        { kind: "dot", color: 0x2bffef, n: 40 },
        { kind: "star", color: 0x7af8ff, n: 18 },
        { kind: "shard", color: 0x1a6ac8, n: 18 },
      ],
    },
    scale: 0.62,
    cost: 24000,
    challenge: { stat: "maxDistance", value: 6000, text: "Fly 6000m in one run" },
    desc: "Tidal trail. Crashes like a wave.",
  },
  {
    id: "zephyr",
    name: "ZEPHYR",
    title: "Wind Wyvern",
    rarity: "rare",
    color: 0x4fe0c8,
    color2: 0xffffff,
    texture: "hero_zephyr",
    pixel: {
      atlas: "pxc",
      frames: ["zephyr_0", "zephyr_1", "zephyr_2"],
      mode: "flap",
      trail: [0xffffff, 0xbff8ee, 0x4fe0c8, 0x24a08e],
    },
    fx: {
      flap: { kind: "pixel", color: 0xbff8ee, n: 6 },
      death: [
        { kind: "pixel", color: 0x4fe0c8, n: 40 },
        { kind: "shard", color: 0x4fe0c8, n: 18 },
      ],
    },
    scale: 0.62,
    lottery: true, // only from the Lucky Spin
    desc: "Wind trail. Scatters into a gust.",
  },
  {
    id: "hoot",
    name: "HOOT",
    title: "Arcane Owl",
    rarity: "rare",
    color: 0x8a5cff,
    color2: 0xffd23f,
    texture: "hero_hoot",
    pixel: {
      atlas: "pxc",
      frames: ["hoot_0", "hoot_1", "hoot_2"],
      mode: "flap",
      trail: [0xffffff, 0xffd23f, 0xb090ff, 0x5f3ac8],
    },
    fx: {
      flap: { kind: "star", color: 0xffd23f, n: 6 },
      death: [
        { kind: "star", color: 0xb090ff, n: 40 },
        { kind: "shard", color: 0x8a5cff, n: 18 },
      ],
    },
    scale: 0.62,
    lottery: true, // only from the Lucky Spin
    desc: "Spell-spark trail. Vanishes in a puff of magic.",
  },
  {
    id: "lumen",
    name: "LUMEN",
    title: "Glow Moth",
    rarity: "rare",
    color: 0xfff1a8,
    color2: 0x7ad8ff,
    texture: "hero_lumen",
    pixel: {
      atlas: "pxc",
      frames: ["lumen_0", "lumen_1", "lumen_2"],
      mode: "flap",
      trail: [0xffffff, 0xfff1a8, 0xffd23f, 0x7ad8ff],
    },
    fx: {
      flap: { kind: "dot", color: 0xfff1a8, n: 6 },
      death: [
        { kind: "dot", color: 0x7ad8ff, n: 40 },
        { kind: "shard", color: 0xfff1a8, n: 18 },
      ],
    },
    scale: 0.62,
    lottery: true, // only from the Lucky Spin
    desc: "Glow-dust trail. Bursts into light.",
  },
  {
    id: "buzz",
    name: "BUZZ",
    title: "Clockwork Bee",
    rarity: "rare",
    color: 0xffd23f,
    color2: 0x2bffef,
    texture: "hero_buzz",
    pixel: {
      atlas: "pxc",
      frames: ["buzz_0", "buzz_1", "buzz_2"],
      mode: "spin",
      trail: [0xffffff, 0xffd23f, 0xc8a050, 0x2a2a3a],
    },
    fx: {
      flap: { kind: "spark", color: 0xffd23f, n: 6 },
      death: [
        { kind: "spark", color: 0x2bffef, n: 40 },
        { kind: "shard", color: 0xffd23f, n: 18 },
      ],
    },
    scale: 0.62,
    lottery: true, // only from the Lucky Spin
    desc: "Honey-spark trail. Springs a gear.",
  },
  {
    id: "cinder",
    name: "CINDER",
    title: "Lava Drake",
    rarity: "epic",
    color: 0xff6a1a,
    color2: 0xffd23f,
    texture: "hero_cinder",
    pixel: {
      atlas: "pxc",
      frames: ["cinder_0", "cinder_1", "cinder_2"],
      mode: "flap",
      trail: [0xfff1a0, 0xffa21a, 0xff3d1a, 0x2a1a1e],
    },
    fx: {
      flap: { kind: "fire", color: undefined, n: 6 },
      death: [
        { kind: "fire", color: undefined, n: 40 },
        { kind: "shard", color: 0xff6a1a, n: 18 },
      ],
    },
    scale: 0.62,
    lottery: true, // only from the Lucky Spin
    desc: "Ember trail. Erupts like a volcano.",
  },
  {
    id: "nyx",
    name: "NYX",
    title: "Vampire Bat",
    rarity: "epic",
    color: 0xb45cff,
    color2: 0xff2a3d,
    texture: "hero_nyx",
    pixel: {
      atlas: "pxc",
      frames: ["nyx_0", "nyx_1", "nyx_2"],
      mode: "flap",
      trail: [0xffd0d8, 0xff2a3d, 0x8a3ad8, 0x2a1060],
    },
    fx: {
      flap: { kind: "smoke", color: 0x3a1466, n: 6 },
      death: [
        { kind: "dot", color: 0xff2a3d, n: 40 },
        { kind: "shard", color: 0xb45cff, n: 18 },
      ],
    },
    scale: 0.62,
    lottery: true, // only from the Lucky Spin
    desc: "Shadow trail. Bursts into a swarm.",
  },
  {
    id: "koi",
    name: "KOI",
    title: "Sky Koi",
    rarity: "epic",
    color: 0xff7a3a,
    color2: 0xfff4ec,
    texture: "hero_koi",
    pixel: {
      atlas: "pxc",
      frames: ["koi_0", "koi_1", "koi_2"],
      mode: "idle",
      trail: [0xffffff, 0xbff4ff, 0xff9a5a, 0xff7a3a],
    },
    fx: {
      flap: { kind: "dot", color: 0xbff4ff, n: 6 },
      death: [
        { kind: "dot", color: 0xff9a5a, n: 40 },
        { kind: "shard", color: 0xff7a3a, n: 18 },
      ],
    },
    scale: 0.62,
    lottery: true, // only from the Lucky Spin
    desc: "Bubble trail. Splashes into foam.",
  },
  {
    id: "kitsu",
    name: "KITSU",
    title: "Fox Spirit",
    rarity: "legendary",
    color: 0xff8a3a,
    color2: 0x7ad8ff,
    texture: "hero_kitsu",
    pixel: {
      atlas: "pxc",
      frames: ["kitsu_0", "kitsu_1", "kitsu_2"],
      mode: "idle",
      trail: [0xffffff, 0x7ad8ff, 0xb45cff, 0xff8a3a],
    },
    fx: {
      flap: { kind: "star", color: 0x7ad8ff, n: 6 },
      death: [
        { kind: "star", color: 0xb45cff, n: 40 },
        { kind: "shard", color: 0xff8a3a, n: 18 },
      ],
    },
    scale: 0.62,
    lottery: true, // only from the Lucky Spin
    desc: "Foxfire trail. Splits into spirit flames.",
  },
  {
    id: "griffo",
    name: "GRIFFO",
    title: "Baby Griffin",
    rarity: "legendary",
    color: 0xe8b040,
    color2: 0xfff4ec,
    texture: "hero_griffo",
    pixel: {
      atlas: "pxc",
      frames: ["griffo_0", "griffo_1", "griffo_2"],
      mode: "flap",
      trail: [0xffffff, 0xfff4ec, 0xe8b040, 0xb07a20],
    },
    fx: {
      flap: { kind: "pixel", color: 0xfff4ec, n: 6 },
      death: [
        { kind: "pixel", color: 0xe8b040, n: 40 },
        { kind: "shard", color: 0xe8b040, n: 18 },
      ],
    },
    scale: 0.62,
    lottery: true, // only from the Lucky Spin
    desc: "Feather trail. Explodes in feathers.",
  },
  {
    id: "aurora",
    name: "AURORA",
    title: "Star Whale",
    rarity: "legendary",
    color: 0x7ad8ff,
    color2: 0x39ff88,
    texture: "hero_aurora",
    pixel: {
      atlas: "pxc",
      frames: ["aurora_0", "aurora_1", "aurora_2"],
      mode: "idle",
      trail: [0xffffff, 0x39ff88, 0x7ad8ff, 0xff7ad9, 0x2a3a8a],
    },
    fx: {
      flap: { kind: "star", color: 0xfff1a8, n: 6 },
      death: [
        { kind: "star", color: 0x39ff88, n: 40 },
        { kind: "shard", color: 0x7ad8ff, n: 18 },
      ],
    },
    scale: 0.62,
    lottery: true, // only from the Lucky Spin
    desc: "Aurora trail. Dissolves into stardust.",
  },
  {
    id: "yarms",
    name: "YARMS",
    title: "All Arms",
    rarity: "legendary",
    color: 0xffd23f,
    color2: 0xf0a070,
    texture: "hero_yarms",
    pixel: {
      atlas: "pxc",
      // 0/1 glide (fingers flutter), 2 the flop stroke, 3 the double-bicep flex
      frames: ["yarms_0", "yarms_1", "yarms_2", "yarms_3"],
      mode: "yarms",
      trail: [0xfff6c0, 0xffd23f, 0xc8901a],
    },
    scale: 0.64,
    cost: 24000,
    challenge: { stat: "maxNearRun", value: 50, text: "Do 50 near-misses in one run" },
    desc: "All arms. No body. No problem.",
  },
  {
    id: "springer",
    name: "SPRINGER",
    title: "Hockey Player",
    rarity: "legendary",
    color: 0xff7a1a,
    color2: 0x161616,
    texture: "hero_springer",
    pixel: {
      atlas: "pxc",
      frames: ["springer_0", "springer_1", "springer_2"],
      mode: "leap",
      trail: [0xffffff, 0xd8e8f4, 0xff7a1a, 0x161616],
    },
    fx: {
      flap: { kind: "flake", color: 0xd8e8f4, n: 6 },
      death: [
        { kind: "shard", color: 0xff7a1a, n: 26 },
        { kind: "flake", color: 0xffffff, n: 30 },
        { kind: "pixel", color: 0x161616, n: 18 },
      ],
    },
    scale: 0.64,
    cost: 12000,
    desc: "Ice-spray trail. Every flap is a slap shot.",
  },
  {
    id: "dzr",
    name: "DZR",
    title: "Velociraptor",
    rarity: "legendary",
    color: 0x3a5a8a,
    color2: 0xffd23f,
    texture: "hero_dzr",
    pixel: {
      atlas: "pxc",
      frames: ["dzr_0", "dzr_1", "dzr_2"],
      mode: "leap",
      trail: [0x9ab0d0, 0x6a86b0, 0x3a5a8a, 0x2a4068],
    },
    fx: {
      flap: { kind: "dot", color: 0x6a86b0, n: 5 },
      death: [
        { kind: "shard", color: 0x3a5a8a, n: 28 },
        { kind: "pixel", color: 0xffd23f, n: 14 },
      ],
    },
    scale: 0.64,
    cost: 12000,
    desc: "Matte-blue dash trail. Pounces on every flap.",
  },
  {
    id: "mattoe",
    name: "MATTOE",
    title: "The Big Toe",
    rarity: "epic",
    color: 0x1e7cff,
    color2: 0xffd23f,
    texture: "hero_mattoe",
    pixel: {
      atlas: "pxc",
      frames: ["mattoe_0", "mattoe_1", "mattoe_2"],
      mode: "toe", // an always-on aura, footprint trail and a stubbed-toe death (mattoeFx.js)
      trail: [0xfff6c0, 0xffd23f, 0x7ad8ff, 0x1e7cff],
    },
    fx: {
      flap: { kind: "spark", color: 0x7ad8ff, n: 5 },
      death: [
        { kind: "shard", color: 0x7ad8ff, n: 26 },
        { kind: "star", color: 0xffd23f, n: 18 },
      ],
    },
    scale: 0.62,
    cost: 4000,
    // the stubbed-toe joke: the Neon Void is where you start, so where most runs end
    challenge: { stat: "voidDeaths", value: 10, text: "Die 10 times in the Neon Void" },
    desc: "Small. Stubbable. Unstoppable. All aura.",
  },
  {
    id: "wallrunner",
    name: "WALLRUNNER",
    title: "Leprechaun",
    rarity: "legendary",
    color: 0x2aa83a,
    color2: 0xff2a10,
    texture: "hero_wallrunner",
    pixel: {
      atlas: "pxc",
      frames: ["wallrunner_0", "wallrunner_1", "wallrunner_2"],
      mode: "leap",
      trail: [0xfff6c0, 0xffd23f, 0x8aff7a, 0x2aa83a],
    },
    fx: {
      flap: { kind: "star", color: 0xffd23f, n: 4 },
      death: [
        { kind: "star", color: 0xffd23f, n: 30 },
        { kind: "dot", color: 0x2aa83a, n: 26 },
        { kind: "pixel", color: 0xff2a10, n: 16 },
      ],
    },
    scale: 0.64,
    cost: 10000,
    speed: 1.2, // EXTRA FAST: the whole run moves 20% quicker
    coinMul: 15, // every coin he grabs is worth 15
    desc: "EXTRA FAST, and every coin he grabs is worth 15x.",
  },
  {
    id: "manny",
    name: "MANNY",
    title: "Gold-Nosed Black Bear",
    rarity: "epic",
    color: 0xffd23f,
    color2: 0x2a2a38,
    texture: "hero_manny",
    pixel: {
      atlas: "pxc",
      frames: ["manny_0", "manny_1", "manny_2"],
      mode: "leap",
      trail: [0xfff6c0, 0xffd23f, 0xc8901a, 0x4a4a60],
    },
    fx: {
      flap: { kind: "star", color: 0xffd23f, n: 5 },
      death: [
        { kind: "dot", color: 0x4a4a60, n: 34 },
        { kind: "star", color: 0xffd23f, n: 22 },
      ],
    },
    scale: 0.64,
    cost: 5000,
    spinPool: true, // for sale AND a possible Lucky Spin prize
    desc: "Gold sparkle trail. Leaps nose-first.",
  },
  {
    id: "milzzz",
    name: "MILZZZ",
    title: "Red-Eyed Tree Frog",
    rarity: "ultra",
    color: 0x39d84a,
    color2: 0xff2a2a,
    texture: "hero_milzzz",
    pixel: {
      atlas: "pxc",
      frames: ["milzzz_0", "milzzz_1", "milzzz_2"],
      mode: "leap",
      trail: [0xfff4c8, 0x8aff7a, 0x39d84a, 0x2a6aff],
    },
    fx: {
      flap: { kind: "dot", color: 0x8aff7a, n: 6 },
      death: [
        { kind: "dot", color: 0x39d84a, n: 36 },
        { kind: "shard", color: 0xff2a2a, n: 16 },
        { kind: "pixel", color: 0x2a6aff, n: 16 },
      ],
    },
    scale: 0.62,
    // reach any dimension, then the coins
    cost: 40000,
    requires: [{ stat: "dimensions", value: 1, text: "Discover a dimension" }],
    // tap again right after a jump for a higher second leap
    doubleJump: { window: 0.3, boost: 1.3, cooldown: 1.0 },
    desc: "DOUBLE JUMP: tap twice fast for a higher leap.",
  },
  {
    id: "smash",
    name: "SMASH",
    title: "Mantis Shrimp",
    rarity: "mega",
    color: 0xff3a8a,
    color2: 0x39ffe0,
    texture: "hero_smash",
    pixel: {
      atlas: "pxc",
      frames: ["smash_0", "smash_1", "smash_2"],
      mode: "punch",
      // sees more colours than any animal: a full-spectrum trail
      trail: [0xffffff, 0xff3a8a, 0xff8a1a, 0xffe14d, 0x39ff88, 0x2a8aff, 0xb45cff],
    },
    fx: {
      death: [
        { kind: "star", color: 0xff3a8a, n: 30 },
        { kind: "shard", color: 0x39ffe0, n: 24 },
        { kind: "pixel", color: 0xffe14d, n: 30 },
      ],
    },
    scale: 0.64,
    cost: 3000,
    // only for sale inside this window (UTC); owned forever once bought
    limited: { start: "2026-11-03T14:00:00Z", end: "2026-11-04T14:00:00Z" },
    desc: "Rainbow trail. Every flap is a sonic punch.",
  },
  {
    id: "sonjuwon",
    name: "손주원", // shown in Korean everywhere (the Galmuri pixel font supplies Hangul)
    title: "Storm Surfer",
    rarity: "legendary",
    color: 0x3ef4ff,
    color2: 0xffffff,
    texture: "hero_sonjuwon",
    pixel: {
      atlas: "pxc",
      frames: ["sonjuwon_0", "sonjuwon_1", "sonjuwon_2", "sonjuwon_3"],
      mode: "surf",
      trail: [0xffffff, 0xbffcff, 0x3ef4ff, 0x1a8ad8],
    },
    scale: 0.62,
    cost: 12000,
    challenge: { stat: "maxAbyssM", value: 200, text: "Survive 200m in the Abyss" },
    desc: "Rides the storm.",
  },
  ...ANIMALS,
  ...PASS_HEROES,
];

/** Heroes that can only be won from the Lucky Spin. */
export const LOTTERY_HEROES = CHARACTERS.filter((c) => c.lottery);

/** Is a limited-time hero on sale right now? (Always true for normal heroes.) */
export function onSale(def, now = Date.now()) {
  // seasonal heroes (Christmas): only during their month, every year
  if (def.season) return seasonMonth(now) === def.season.month;
  if (!def.limited) return true;
  return now >= Date.parse(def.limited.start) && now < Date.parse(def.limited.end);
}

/** Milliseconds left on a limited hero's sale (0 when it's over or not limited). */
export function saleLeft(def, now = Date.now()) {
  if (def.season) {
    if (!onSale(def, now)) return 0;
    const d = new Date(now);
    return Math.max(0, new Date(d.getFullYear(), d.getMonth() + 1, 1) - now);
  }
  return def.limited ? Math.max(0, Date.parse(def.limited.end) - now) : 0;
}

/** Heroes shown in the shop for this save: limited ones only while on sale, or once owned. */
export function visibleCharacters(unlocked = {}) {
  return CHARACTERS.filter(
    (c) => heroReleased(c) && (!(c.limited || c.season) || unlocked[c.id] || onSale(c)),
  );
}

// Heroes that are "shelved" (made, saved for later) stay hidden until a season releases them.
const released = new Set();
export function releaseHeroes(ids) {
  for (const id of ids) released.add(id);
}
/** False for shelved heroes no season has released yet. */
export function heroReleased(def) {
  return !def.shelved || released.has(def.id);
}

/** Calendar month (0-11) for seasonal heroes; test builds can force it (?month=11). */
let monthOverride = null;
export function setSeasonMonth(m) {
  monthOverride = m;
}
function seasonMonth(now) {
  return monthOverride ?? new Date(now).getMonth();
}

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}
