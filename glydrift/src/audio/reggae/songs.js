// Glydrift's reggae soundtrack, written as data (100% original, composed for this game).
// Rendered to compressed audio at build time by ./render.js (Tone.js, offline) and played
// back by ../music.js. Nothing here runs in the game itself except the metadata.
//
// KEYS: every realm sits on the circle of fifths next to the realms it meets:
//   Menu C → Neon Void Am (same) → Sakura Skies G (1♯) → Solar Em (same) → Frozen Am (0)
//   → Glitch Dm (1♭) → Abyss D phrygian (2♭) → Valley F (1♭) → Hurricane Gm (2♭) → the dimensions,
//   which all use 1♭ / 2♭ keys (Prism B♭, Tidal Dm, Chrono Gm, Mirror D phrygian).
// TEMPO: Menu 75 → Void 90 → Sakura 95 → Solar 100 → Frozen 80 → Glitch 70 (ramped in the
// bridges); from there on everything lives on one 70 / 140 grid (half-time and double-time feels), so the
// Calm's heartbeat, the Abyss (140 half-time), Valley, the Hurricane ska (140) and the
// dimensions (70) flow into each other without any tempo jump.
//
// LINES: 16 characters per bar (one per 16th note):
//   `.` rest  `-` hold  `0`-`9` scale degree  `a`-`e` degree 10-14  `z` `y` `x` degree -1..-3
// Melodies are degrees of the track's key; bass lines are degrees above the bar's chord.

export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

const DEG = { a: 10, b: 11, c: 12, d: 13, e: 14, z: -1, y: -2, x: -3 };

/** Parse a line into one entry per 16th: null, or { d: degree, len: 16ths }. */
export function line(str) {
  const chars = str.replace(/[\s|]/g, "");
  if (chars.length % 16 !== 0) throw new Error(`music line must be whole bars: "${str}"`);
  const out = new Array(chars.length).fill(null);
  let last = null;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === "-") {
      if (last) last.len++;
      continue;
    }
    if (c === ".") {
      last = null;
      continue;
    }
    const d = c in DEG ? DEG[c] : Number(c);
    if (!Number.isInteger(d)) throw new Error(`bad music symbol "${c}" in "${str}"`);
    last = { d, len: 1 };
    out[i] = last;
  }
  return out;
}

/**
 * Song form, in bars (× `scale` for the 140 BPM tracks). The intro is a separate clip; the
 * body loops: groove → build → drop → dub breakdown → groove … Realms are entered on the drop.
 */
export const FORM = [
  ["groove", 4],
  ["build", 2],
  ["drop", 4],
  ["dub", 4],
];
export const INTRO_BARS = 2;

export function sections(song) {
  const s = song.scale || 1;
  let at = 0;
  const out = {};
  for (const [name, bars] of FORM) {
    out[name] = [at, at + bars * s];
    at += bars * s;
  }
  out.total = at;
  return out;
}

export const SONGS = {
  menu: {
    name: "Lounge (Menu)",
    title: "Sunny Side",
    style: "Chill, sunny roots reggae · one drop · melodica hook",
    key: "C major",
    mode: "major",
    root: 48, // C3
    bpm: 75,
    feel: "one drop",
    drums: { groove: "onedrop", drop: "rockers", dub: "onedrop", hats: "8ths", swing: 0.24 },
    chords: { groove: [0, 3, 0, 4], drop: [0, 5, 3, 4] }, // C F C G | C Am F G
    seventh: false,
    bass: line("0---..2-4---2.0. ..0.4-5-7---4-2-"),
    skank: { steps: [4, 12], wave: "sawtooth" },
    organ: "bubble",
    horns: null,
    lead: {
      voice: "melodica",
      octave: 1,
      groove: line("........4---2--- 0-------........ ........5---4--- 1-------........"),
      // the hook: call (bars 1, 3) and answer (bars 2, 4)
      drop: line("....4-2-4---5-4- 2-------0-2-.... ....5-3-5---7-5- 4-----------...."),
    },
    pad: { wave: "sine", vol: -10 },
    airhorn: false,
    echo: 0.3,
    reverb: 0.3,
  },

  void: {
    name: "Neon Void",
    title: "Neon Skank",
    style: "Upbeat modern reggae · double-time feel · bright organ skank",
    key: "A minor",
    mode: "minor",
    root: 57, // A3
    bpm: 90,
    feel: "double-time",
    drums: { groove: "onedrop", drop: "steppers", dub: "onedrop", hats: "16ths", swing: 0.14 },
    chords: { groove: [0, 6, 5, 6], drop: [0, 5, 2, 6] }, // Am G F G | Am F C G
    seventh: true,
    bass: line("0-.0..4-7-.4..2- 0-.0..4-6-.4.2.z"),
    skank: { steps: [2, 6, 10, 14], wave: "square" },
    organ: "bubble",
    organBright: true,
    horns: null,
    lead: {
      voice: "melodica",
      octave: 1,
      groove: line("....7---4------- ....5---4-2----- ....2---0------- ....1---z-------"),
      drop: line("7-7-9-7-4---2-4- 5---4---2---0--- 2-2-4-2-0---z-0- 1---3---1---z---"),
    },
    pad: null,
    airhorn: true,
    echo: 0.28,
    reverb: 0.25,
  },

  sakura: {
    name: "Sakura Skies",
    title: "Petal Breeze",
    style: "Calm, flowing roots reggae · soft skank · melodica · wind-chime plucks",
    // G major (1♯): the relative major of Solar's E minor, one step round from Neon Void's
    // A minor; the lead keeps to the major pentatonic (G A B D E) for its sunny, airy sound
    key: "G major",
    mode: "major",
    root: 55, // G3
    bpm: 95, // halfway between Void (90) and Solar (100): both bridges are gentle ramps
    feel: "one drop",
    soft: true,
    drums: { groove: "onedrop", drop: "rockers", dub: "onedrop", hats: "8ths", swing: 0.22 },
    chords: { groove: [0, 3, 5, 4], drop: [0, 4, 5, 3] }, // Gmaj7 Cmaj7 Em7 D7 | G D Em C
    seventh: true,
    bass: line("0-----.4-2-0.... 0---..4-5---4-2-"),
    skank: { steps: [4, 12], wave: "triangle" },
    organ: "bubble",
    horns: null,
    lead: {
      voice: "melodica",
      octave: 1,
      groove: line("........4---5-4- 2-------........ ........5---7-5- 4-----2-1-------"),
      // the hook: a slow rise and fall, like a petal on the wind
      drop: line("7-5-4---2-4-5--- 4-------1-2-4--- 5-7-8-7-5---4-2- 4---2---0-------"),
    },
    pad: { wave: "sine", vol: -10 },
    arp: { pattern: [0, 4, 7, 9, 7, 4, 2, 4], octave: 2 },
    airhorn: false,
    echo: 0.34,
    reverb: 0.38,
  },

  solar: {
    name: "Solar Storm",
    title: "Sun Riddim",
    style: "High-energy dancehall riddim · hard drums · horn stabs",
    key: "E minor",
    mode: "minor",
    root: 52, // E3
    bpm: 100,
    feel: "dancehall",
    drums: { groove: "dancehall", drop: "dancehall", dub: "onedrop", hats: "16ths", swing: 0.1 },
    chords: { groove: [0, 5, 6, 0], drop: [0, 5, 6, 0] }, // Em C D Em
    seventh: false,
    bass: line("0--.0-..7-.0..4. 0--.0-..7-.6-4-2"),
    skank: { steps: [4, 12], wave: "sawtooth", double: true },
    organ: null,
    horns: { steps: [3, 6, 11, 14] },
    lead: {
      voice: "horn",
      octave: 1,
      harm: 2,
      groove: line("........7---4--- ........5-4-2--- ........6---4--- 0-------........"),
      drop: line("0-0-2-0-4.4-2-0- ....2-4-5---4-2- 1-1-3-1-6.6-4-3- 2---0-------...."),
    },
    pad: null,
    airhorn: true,
    echo: 0.18,
    reverb: 0.18,
  },

  frozen: {
    name: "Frozen Nebula",
    title: "Ice Echo",
    style: "Spacey dub · huge echoes · icy pads · floating flute",
    key: "A minor",
    mode: "minor",
    root: 57, // A3
    bpm: 80,
    feel: "one drop",
    drums: { groove: "onedrop", drop: "rockers", dub: "onedrop", hats: "8ths", swing: 0.2 },
    chords: { groove: [0, 0, 5, 4], drop: [0, 5, 2, 4] }, // Am Am F Em | Am F C Em
    seventh: true,
    bass: line("0-------....4-2- 0-----..7-------"),
    skank: { steps: [4, 12], wave: "sawtooth" },
    organ: "bubble",
    horns: null,
    lead: {
      voice: "flute",
      octave: 1,
      groove: line("................ ........4---7--- 5-------........ 4---------------"),
      drop: line("7-------9---b--- a-------9------- 9---7---4------- 4-------........"),
    },
    pad: { wave: "triangle", vol: -6, icy: true },
    arp: { pattern: [0, 2, 4, 7, 4, 2, 9, 4], octave: 2 },
    airhorn: false,
    echo: 0.48,
    reverb: 0.45,
  },

  glitch: {
    name: "Glitch Realm",
    title: "Bit Dub",
    style: "Digital dub · chopped stuttering delays · bitcrushed skanks",
    key: "D minor",
    mode: "minor",
    root: 50, // D3
    bpm: 70,
    feel: "double-time hats (140 feel)",
    drums: { groove: "onedrop", drop: "steppers", dub: "onedrop", hats: "16ths", swing: 0 },
    chords: { groove: [0, 5, 6, 0], drop: [0, 5, 6, 0] }, // Dm Bb C Dm
    seventh: false,
    bass: line("0---0.7.....4-6- 0---0.7.....7-6-"),
    skank: { steps: [4, 12], wave: "square", crush: 4, stutter: true },
    organ: null,
    horns: null,
    lead: {
      voice: "digital",
      octave: 1,
      groove: line("....7-----4----- ....5-----2----- ....6-----4----- 0---------------"),
      drop: line("7.7.7-9-7-4-.... 5.5.5-7-5-2-.... 6.6.6-8-6-4-2-1- 0-------7-------"),
    },
    pad: null,
    arp: { pattern: [0, 7, 4, 7, 2, 7, 4, 9], octave: 2, digital: true },
    airhorn: true,
    echo: 0.3,
    reverb: 0.15,
  },

  abyss: {
    name: "Abyss",
    title: "Abyss Dub",
    style: "Dark reggae-dubstep fusion · massive sub · eerie delays",
    key: "D phrygian",
    mode: "phrygian",
    root: 50, // D3
    bpm: 140,
    feel: "half-time",
    scale: 2,
    drums: { groove: "halftime", drop: "halftime", dub: "halftime", hats: "8ths", swing: 0.06 },
    chords: { groove: [0, 1, 0, 6], drop: [0, 1, 0, 6] }, // Dm Eb Dm Cm (2 bars each)
    seventh: false,
    cluster: true,
    bass: line("0-------------.. 0-----0-1-------"),
    bassSound: "wobble",
    skank: { steps: [6, 14], wave: "sawtooth" },
    organ: null,
    horns: null,
    lead: {
      voice: "bell",
      octave: 1,
      groove: line("0-------1------- 0-------........"),
      drop: line("0-------1------- 0-------........ 4-------3------- 1-------0-------"),
    },
    pad: { wave: "sine", vol: -12, high: true },
    siren: true,
    subDrop: true,
    airhorn: false,
    echo: 0.38,
    reverb: 0.3,
  },

  valley: {
    name: "Peaceful Valley",
    title: "Valley Roots",
    style: "Gentle roots one drop · soft brushes · flute",
    key: "F major",
    mode: "major",
    root: 53, // F3
    bpm: 70,
    feel: "one drop",
    soft: true,
    drums: { groove: "onedrop", drop: "rockers", dub: "onedrop", hats: "8ths", swing: 0.26 },
    chords: { groove: [0, 3, 4, 3], drop: [0, 5, 3, 4] }, // F Bb C Bb | F Dm Bb C
    seventh: true,
    bass: line("0---..4-7---4-2- 0-----2-4-5-4---"),
    skank: { steps: [4, 12], wave: "sawtooth" },
    organ: "bubble",
    horns: null,
    lead: {
      voice: "flute",
      octave: 1,
      groove: line("........4---2--- 3-------........ ........4---5--- 4-------........"),
      drop: line("....4-5-7---5-4- 5-------2------- ....3-4-5---7-5- 4-------........"),
    },
    pad: { wave: "sine", vol: -8 },
    airhorn: false,
    echo: 0.32,
    reverb: 0.4,
  },

  hurricane: {
    name: "Hurricane",
    title: "Storm Ska",
    style: "Fast ska · offbeat skank on every 8th · walking bass · horns",
    key: "G minor",
    mode: "minor",
    root: 55, // G3
    bpm: 140,
    feel: "double-time (ska)",
    scale: 2,
    drums: { groove: "ska", drop: "ska", dub: "onedrop", hats: "8ths", swing: 0.12 },
    chords: { groove: [0, 5, 6, 0], drop: [0, 3, 6, 0] }, // Gm Eb F Gm | Gm Cm F Gm
    seventh: false,
    bass: line("0---2---4---5--- 7---5---4---2---"),
    skank: { steps: [2, 6, 10, 14], wave: "sawtooth" },
    organ: null,
    horns: { steps: [0, 3] },
    lead: {
      voice: "horn",
      octave: 1,
      harm: 2,
      groove: line("7-.7-.6-4---.... ................ 3---2---0------- ................"),
      drop: line(
        "7-.7-.6-4---2-0- 3---2---0------- 1-.1-.3-6---4-3- 4-------........" +
          "7-.7-.9-7---6-4- 5---4---2------- 6---4---3---1--- 0-------........",
      ),
    },
    pad: null,
    airhorn: true,
    echo: 0.16,
    reverb: 0.2,
  },

  prism: {
    name: "Prism Rift",
    title: "Prism Rocksteady",
    style: "Bright rocksteady · glass chimes · sweet flute",
    key: "B♭ major",
    mode: "major",
    root: 58, // Bb3
    bpm: 70,
    feel: "rockers",
    drums: { groove: "rockers", drop: "steppers", dub: "onedrop", hats: "8ths", swing: 0.18 },
    chords: { groove: [0, 5, 3, 4], drop: [0, 5, 3, 4] }, // Bb Gm Eb F
    seventh: true,
    bass: line("0---2-4-7---4-2- 0---4-2-0---z-0-"),
    skank: { steps: [4, 12], wave: "sawtooth" },
    organ: "bubble",
    horns: null,
    lead: {
      voice: "flute",
      octave: 1,
      groove: line("........4---5--- 4-------........ ........3---4--- 1-------........"),
      drop: line("4-5-7---5-4-2--- 4-------........ 3-4-5---4-3-0--- 1-------........"),
    },
    pad: { wave: "sine", vol: -12 },
    arp: { pattern: [0, 4, 7, 9, 11, 9, 7, 4], octave: 2 },
    airhorn: false,
    echo: 0.3,
    reverb: 0.35,
  },

  tidal: {
    name: "Tidal Sky",
    title: "Tidal Dub",
    style: "Deep underwater dub · muffled · long echoes",
    key: "D minor",
    mode: "minor",
    root: 50, // D3
    bpm: 70,
    feel: "one drop",
    soft: true,
    muffled: true,
    drums: { groove: "onedrop", drop: "onedrop", dub: "onedrop", hats: "8ths", swing: 0.25 },
    chords: { groove: [0, 5, 3, 6], drop: [0, 5, 3, 6] }, // Dm Bb Gm C
    seventh: true,
    bass: line("0-------.....4-3 0-----------..z."),
    skank: { steps: [4, 12], wave: "sawtooth" },
    organ: "bubble",
    horns: null,
    lead: {
      voice: "melodica",
      octave: 1,
      groove: line("................ ........4---2--- ................ 0---------------"),
      drop: line("4-------2---0--- ................ 7-------5---4--- 2-------........"),
    },
    pad: { wave: "sine", vol: -8 },
    siren: true,
    airhorn: false,
    echo: 0.5,
    reverb: 0.45,
  },

  chrono: {
    name: "Chrono Fracture",
    title: "Clockwork Rockers",
    style: "Ticking rockers · rimshot clock · chimes",
    key: "G minor",
    mode: "minor",
    root: 55, // G3
    bpm: 70,
    feel: "rockers",
    drums: {
      groove: "rockers",
      drop: "steppers",
      dub: "onedrop",
      hats: "16ths",
      swing: 0.12,
      tick: true,
    },
    chords: { groove: [0, 3, 5, 6], drop: [0, 3, 5, 6] }, // Gm Cm Eb F
    seventh: false,
    bass: line("0-.0-.4-.4-.7-6- 0-.0-.4-.4-.2-1-"),
    skank: { steps: [4, 12], wave: "sawtooth" },
    organ: "bubble",
    horns: null,
    lead: {
      voice: "melodica",
      octave: 1,
      groove: line("........7---4--- ................ ........5---4--- ................"),
      drop: line("0---4---7---4--- 3---2---0------- 5---4---2---0--- 1---3---6-------"),
    },
    pad: null,
    arp: { pattern: [0, 7, 9, 7, 4, 7, 9, 11], octave: 2 },
    airhorn: false,
    echo: 0.3,
    reverb: 0.3,
  },

  mirror: {
    name: "Mirror Realm",
    title: "Mirror Dub",
    style: "Eerie reverse dub · organ swells · hypnotic echoes",
    key: "D phrygian",
    mode: "phrygian",
    root: 50, // D3
    bpm: 70,
    feel: "one drop",
    drums: { groove: "onedrop", drop: "rockers", dub: "onedrop", hats: "8ths", swing: 0.2 },
    chords: { groove: [0, 1, 0, 6], drop: [0, 1, 0, 6] }, // Dm Eb Dm Cm
    seventh: true,
    bass: line("0-------1------- 0-------6-------"),
    skank: { steps: [4, 12], wave: "sawtooth" },
    organ: "swell",
    horns: null,
    lead: {
      voice: "melodica",
      octave: 1,
      groove: line("1---0-------.... ................ ........4---3--- ................"),
      drop: line("1---0-------.... ........4---3--- 5---4---1---0--- ................"),
    },
    pad: { wave: "triangle", vol: -10 },
    siren: true,
    airhorn: false,
    echo: 0.5,
    reverb: 0.45,
  },
};

/** The Calm: near silence: a heartbeat (70 BPM, the Abyss's half-time pulse) and a soft echo. */
export const CALM = {
  name: "The Calm",
  title: "Heartbeat",
  style: "Near silence · heartbeat · dub echo fading out",
  key: "D minor",
  mode: "minor",
  root: 50,
  bpm: 70,
  bars: 4,
};

/** Realm order of the classic run; the dimensions follow in random order. */
export const CLASSIC_ORDER = [
  "void",
  "sakura",
  "solar",
  "frozen",
  "glitch",
  "abyss",
  "valley",
  "hurricane",
];
export const DIMENSION_ORDER = ["prism", "tidal", "chrono", "mirror"];

/** Every realm boundary the course can produce (glitch → abyss goes through The Calm). */
export function bridgePairs() {
  const pairs = [
    ["void", "sakura"],
    ["sakura", "solar"],
    ["solar", "frozen"],
    ["frozen", "glitch"],
    ["abyss", "valley"],
    ["valley", "hurricane"],
  ];
  for (const d of DIMENSION_ORDER) pairs.push(["hurricane", d]);
  for (const a of DIMENSION_ORDER) for (const b of DIMENSION_ORDER) if (a !== b) pairs.push([a, b]);
  return pairs;
}

export const barSeconds = (bpm) => (60 / bpm) * 4;

/** Bridge length in the outgoing track's bars: 4 bars, or 2 when bars are long. */
export function bridgeBars(a) {
  return barSeconds(SONGS[a].bpm) < 2.9 ? 4 : 2;
}
