// Original procedural reggae tracks for Glydrift (pure data, composed for this game).
// One reggae style per realm: roots one-drop, steppers, rockers, ska, digital dancehall, dub.
//
// Chords: `prog` holds scale degrees (0 = tonic) in natural minor (or phrygian), one per bar.
// Lines are written as strings, 16 characters per bar (one per 16th note):
//   `.` rest   `-` hold the previous note   `0`-`9` scale degree   `a`-`e` degree 10-14
//   `z` `y` `x` degree -1, -2, -3
// Bass lines are relative to the bar's chord; leads are relative to the track's root.

const DEG = { a: 10, b: 11, c: 12, d: 13, e: 14, z: -1, y: -2, x: -3 };

/** Parse a line into one entry per 16th: null (rest / held) or { d: degree, len: 16ths }. */
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

export const TRACKS = {
  // 1. Neon Void: roots one-drop, dreamy, melodica, deep dub echoes (A minor)
  void: {
    name: "Neon Void",
    mood: "Roots one-drop · dreamy dub · A minor",
    bpm: 76,
    root: 57, // A3
    prog: [0, 5, 2, 6], // Am F C G
    seventh: true,
    drums: "onedrop",
    hats: "8ths",
    swing: 0.22,
    skank: [4, 12],
    organ: true,
    chordCutoff: 2400,
    bassCutoff: 420,
    bass: line("0---..0.7-6-4---"),
    lead: {
      voice: "melodica",
      octave: 1,
      a: line("4-----2-0------- ........1-2-4---"),
      b: line("4-----5-4-2----- ....2-1-0-------"),
    },
    pad: { wave: "sine", vol: -20 },
    siren: true,
    reverb: 0.4,
    delay: 0.32,
  },

  // 2. Solar Storm: steppers, four-on-the-floor kick, pumping 8th bass, horn line (F minor)
  solar: {
    name: "Solar Storm",
    mood: "Steppers · driving · F minor",
    bpm: 86,
    root: 53, // F3
    prog: [0, 0, 5, 6], // Fm Fm Db Eb
    drums: "steppers",
    hats: "16ths",
    swing: 0.1,
    skank: [4, 12],
    doubleSkank: true,
    organ: true,
    chordCutoff: 3200,
    bassCutoff: 560,
    bass: line("0.0.0.0.7.6.4.2."),
    lead: {
      voice: "horn",
      octave: 1,
      harm: 2,
      a: line("0-2-4---4-2-0--- 7---6-4-2-------"),
      b: line("7-7-6-4-----2-4- 5---4-2-0-------"),
    },
    pad: null,
    reverb: 0.2,
    delay: 0.18,
  },

  // 3. Frozen Nebula: airy rockers, chiming arpeggios, icy pad (E minor)
  frozen: {
    name: "Frozen Nebula",
    mood: "Airy rockers · chimes · E minor",
    bpm: 78,
    root: 52, // E3
    prog: [0, 2, 6, 5], // Em G D C
    seventh: true,
    drums: "rockers",
    hats: "8ths",
    swing: 0.2,
    skank: [4, 12],
    organ: true,
    chordCutoff: 3600,
    bassCutoff: 460,
    bass: line("0-----4-7-----4-"),
    lead: {
      voice: "flute",
      octave: 1,
      a: line("....7---9-7-4--- ........4-2-----"),
      b: line("....7---9-b-9--- ....7-----4-----"),
    },
    pad: { wave: "triangle", vol: -19 },
    arp: { wave: "sine", pattern: [0, 2, 4, 7, 4, 2, 9, 4], octave: 2, always: true },
    reverb: 0.55,
    delay: 0.34,
  },

  // 4. Glitch Realm: digital dancehall, straight 16ths, bit-crushed stabs that stutter (C# minor)
  glitch: {
    name: "Glitch Realm",
    mood: "Digital dancehall · glitchy · C# minor",
    bpm: 94,
    root: 49, // C#3
    prog: [0, 6, 5, 4], // C#m B A G#
    drums: "digital",
    hats: "16ths",
    swing: 0,
    skank: [4, 12],
    skankWave: "square",
    organ: false,
    crush: true,
    stutter: true,
    chordCutoff: 2600,
    bassWave: "square",
    bassCutoff: 520,
    bass: line("0-..0-7.0...4-6."),
    lead: {
      voice: "digital",
      octave: 1,
      a: line("0-0-7-6-4---2-0- 4---2-0-....6-7-"),
      b: line("7-7-9-7-6-4----- 4-6-4-2-0-------"),
    },
    pad: null,
    arp: { wave: "square", pattern: [0, 7, 4, 7, 2, 7, 4, 9], octave: 2 },
    reverb: 0.15,
    delay: 0.2,
  },

  // 5. Abyss: dark dub steppers, heartbeat kick, distorted sub, sirens and whispers (D phrygian)
  abyss: {
    name: "Abyss",
    mood: "Dark dub · distorted sub · D phrygian",
    bpm: 84,
    root: 50, // D3
    prog: [0, 0, 1, 0], // Dm Dm Eb(b2 tension) Dm
    phrygian: true,
    cluster: true, // dissonant minor-second skanks
    drums: "heartbeat",
    kickSteps: [0, 3, 8, 11], // lub-dub, lub-dub
    hats: "16ths",
    swing: 0.08,
    skank: [6, 14],
    organ: false,
    chordCutoff: 1400,
    bassCutoff: 300,
    dist: 0.7,
    bass: line("0-----0-1---0.z."),
    lead: {
      voice: "melodica",
      octave: 1,
      a: line("0---1---0------- 4---3-1-0-------"),
      b: line("7---8-7-4------- 3-4-3-1-0-------"),
    },
    pad: { wave: "sine", vol: -24, oct: 2 }, // eerie high pad
    siren: true,
    whisper: true,
    reverb: 0.35,
    delay: 0.3,
  },

  // 6. Peaceful Valley: drumless ambient roots, organ and guitar only (C major feel)
  valley: {
    name: "Peaceful Valley",
    mood: "Ambient roots · gentle · no drums · C major feel",
    bpm: 70,
    root: 57, // A3 (progression sits on the relative major)
    prog: [2, 5, 0, 6], // C F Am G
    seventh: true,
    ninth: true,
    soft: true,
    drums: "none",
    hats: "none",
    swing: 0.25,
    skank: [4, 12],
    organ: true,
    chordCutoff: 1800,
    bassCutoff: 320,
    bass: line("0-------4-------"),
    lead: {
      voice: "flute",
      octave: 1,
      a: line("2---4---5-4-2--- 0-----------...."),
      b: line("4---5---7-5-4--- 2-----------...."),
    },
    pad: { wave: "sine", vol: -15 },
    arp: { wave: "sine", pattern: [0, 2, 4, 7, 9, 7, 4, 2], octave: 2 },
    reverb: 0.6,
    delay: 0.36,
  },

  // 7. Hurricane: fast ska, offbeat skank on every 8th, walking bass, harmonised horns (E phrygian)
  hurricane: {
    name: "Hurricane",
    mood: "Ska · fast · horns · E phrygian",
    bpm: 132,
    root: 52, // E3
    prog: [0, 5, 1, 0], // Em C F(b2) Em
    phrygian: true,
    drums: "ska",
    hats: "8ths",
    swing: 0.15,
    skank: [2, 6, 10, 14],
    organ: false,
    chordCutoff: 2800,
    bassCutoff: 600,
    dist: 0.3,
    bass: line("0---4---7---4---"),
    lead: {
      voice: "horn",
      octave: 1,
      harm: 2,
      a: line("7-.7-.6-4---1-0- ....0-1-3-4-----"),
      b: line("8---7---4---3-1- 0-------........"),
    },
    pad: null,
    reverb: 0.3,
    delay: 0.16,
  },

  // 8. Prism Rift: bright rocksteady, glassy arpeggios, sweet lead (C minor, major-leaning chords)
  prism: {
    name: "Prism Rift",
    mood: "Bright rocksteady · glass arpeggios",
    bpm: 82,
    root: 60, // C4
    prog: [2, 5, 0, 4], // Eb Ab Cm Gm
    seventh: true,
    ninth: true,
    drums: "rockers",
    hats: "8ths",
    swing: 0.18,
    skank: [4, 12],
    organ: true,
    chordCutoff: 3400,
    bassCutoff: 440,
    bass: line("0---2-4-7---4-2-"),
    lead: {
      voice: "flute",
      octave: 0,
      a: line("....7-9-b---9-7- 4-------........"),
      b: line("....9-b-e---b-9- 7-------........"),
    },
    pad: { wave: "sine", vol: -20 },
    arp: { wave: "triangle", pattern: [0, 4, 7, 11, 14, 11, 7, 4], octave: 2 },
    reverb: 0.45,
    delay: 0.3,
  },

  // 9. Tidal Sky: slow, deep, muffled underwater dub with long echoes (D minor)
  tidal: {
    name: "Tidal Sky",
    mood: "Deep underwater dub · slow · D minor",
    bpm: 70,
    root: 50, // D3
    prog: [0, 5, 3, 6], // Dm Bb Gm C
    seventh: true,
    soft: true,
    drums: "onedrop",
    hats: "8ths",
    swing: 0.25,
    skank: [4, 12],
    organ: true,
    chordCutoff: 1100,
    bassCutoff: 260,
    bass: line("0-------.....4-3"),
    lead: {
      voice: "flute",
      octave: 1,
      a: line("4-------2---0--- ................"),
      b: line("7-------5---4--- 2-------........"),
    },
    pad: { wave: "sine", vol: -16 },
    siren: true,
    reverb: 0.6,
    delay: 0.42,
  },

  // 10. Chrono Fracture: rockers with a ticking rimshot clock and chimes; tempo bends with time (G minor)
  chrono: {
    name: "Chrono Fracture",
    mood: "Ticking rockers · chimes · tempo bends with time",
    bpm: 82,
    root: 55, // G3
    prog: [0, 3, 4, 0], // Gm Cm Dm Gm
    drums: "rockers",
    tick: true, // a soft rim tick on every 8th, like a clock
    hats: "16ths",
    swing: 0.12,
    skank: [4, 12],
    organ: true,
    chordCutoff: 2400,
    bassCutoff: 400,
    bass: line("0-.0-.4-.4-.7-6-"),
    lead: {
      voice: "melodica",
      octave: 1,
      a: line("0---4---7---4--- 3---2---0-------"),
      b: line("7---b---7---4--- 6---4---2-------"),
    },
    pad: { wave: "sine", vol: -21 },
    arp: { wave: "triangle", pattern: [0, 7, 12, 7, 4, 7, 12, 16], octave: 2 },
    reverb: 0.4,
    delay: 0.28,
  },

  // 11. Mirror Realm: eerie reverse dub, organ swells that cut off like reversed tape (Eb phrygian)
  mirror: {
    name: "Mirror Realm",
    mood: "Reverse dub · eerie · hypnotic echoes",
    bpm: 72,
    root: 51, // Eb3
    prog: [0, 1, 0, 6], // Ebm Fb Ebm Db
    phrygian: true,
    seventh: true,
    swell: true,
    drums: "onedrop",
    hats: "8ths",
    swing: 0.2,
    skank: [4, 12],
    organ: true,
    chordCutoff: 1300,
    bassCutoff: 260,
    bass: line("0-------1-------"),
    lead: {
      voice: "melodica",
      octave: 1,
      a: line("1---0-------.... ........4---3---"),
      b: line("5---4---1---0--- ................"),
    },
    pad: { wave: "triangle", vol: -19 },
    siren: true,
    reverb: 0.6,
    delay: 0.5,
  },

  // Menu: lovers rock, relaxed one-drop with a bubbling organ (D minor)
  menu: {
    name: "Lounge (Menu)",
    mood: "Lovers rock · relaxed · D minor",
    bpm: 74,
    root: 50, // D3
    prog: [0, 3, 6, 2], // Dm9 Gm9 C9 F
    seventh: true,
    ninth: true,
    soft: true,
    drums: "onedrop",
    hats: "8ths",
    swing: 0.25,
    skank: [4, 12],
    organ: true,
    chordCutoff: 2200,
    bassCutoff: 400,
    bass: line("0--.....4-5-4.2."),
    lead: {
      voice: "flute",
      octave: 1,
      a: line("....4-2-0------- ........2-4-5-4-"),
      b: line("....7-5-4-2----- ....0-2-0-------"),
    },
    pad: { wave: "sine", vol: -19 },
    reverb: 0.45,
    delay: 0.3,
  },
};

/** Biome index → track id. */
export const BIOME_TRACKS = ["void", "solar", "frozen", "glitch", "abyss", "valley", "hurricane"];

/** 8-bar sections that loop. The breakdown is played as a dub section. */
export const SECTIONS = ["intro", "build", "main", "breakdown", "drop"];
