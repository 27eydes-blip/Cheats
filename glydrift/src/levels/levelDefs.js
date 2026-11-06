// The 50 hand-designed levels (built 10 at a time, one realm per batch). See levels.js for the
// beat tokens. Each realm introduces one new hazard or idea at a time, then combines them, and
// ends with a boss level: longer, built around the realm's signature hazards, with a big finish.
//   d    difficulty for gap sizes / hazard speeds (0 = widest, 1 = endless top difficulty)
//   gap  space between patterns in px (endless starts at 480 and tightens to 340)
export const LEVEL_DEFS = [
  // ================================================================ NEON VOID (1–10)
  {
    n: 1,
    name: "First Flight",
    blurb: "Tap to flap. Fly through the gaps.",
    d: 0,
    gap: 640,
    beats: `@Tap_to_flap_-_fly_through_the_gaps gate gate *m gate >
            @Saws_spin_-_keep_clear saw gate saw | *t gate saw gate >
            @Star_coins_hide_off_the_path gate *b saw gate gate saw gate`,
  },
  {
    n: 2,
    name: "Saw Alley",
    blurb: "Saws that drift up and down.",
    d: 0.08,
    gap: 600,
    beats: `gate saw saw gate *t saw > | saw gate saw saw *b gate >
            saw gate saw | gate saw *m saw gate saw gate`,
  },
  {
    n: 3,
    name: "Twin Teeth",
    blurb: "Two saws, one gap between them.",
    d: 0.1,
    gap: 580,
    beats: `gate saw @Fly_between_the_twin_saws saw2 > gate saw2 *m saw | gate saw2
            saw > gate saw2 *t gate saw | saw2 gate saw saw2 *b gate saw2`,
  },
  {
    n: 4,
    name: "Pendulum",
    blurb: "The axe swings: time your pass.",
    d: 0.12,
    gap: 580,
    beats: `gate saw @The_axe_swings_-_pass_behind_it blade > gate blade saw *b | gate
            blade saw2 > blade gate *t saw blade | gate blade saw2 *m gate blade saw`,
  },
  {
    n: 5,
    name: "Laser Lines",
    blurb: "Side lasers warn, then fire.",
    d: 0.14,
    gap: 560,
    beats: `gate @Side_lasers_flash_before_they_fire hlaser > saw hlaser gate *m | blade
            hlaser saw2 > gate hlaser *t blade | saw hlaser gate saw2 *b hlaser gate blade`,
  },
  {
    n: 6,
    name: "Heartbeat",
    blurb: "The Neon Pulse breathes in and out.",
    d: 0.16,
    gap: 560,
    beats: `gate saw @The_pulse_grows_-_wait_for_it_to_shrink pulse > gate pulse saw *t |
            hlaser pulse blade > gate *b pulse saw2 | hlaser gate pulse blade *m saw
            pulse gate hlaser`,
  },
  {
    n: 7,
    name: "Upside Down",
    blurb: "Pink portals flip gravity.",
    d: 0.18,
    gap: 560,
    beats: `gate saw @Pink_portal_-_gravity_flips flip gate saw gate *t > saw gate |
            blade hlaser flip saw gate *m pulse > gate | saw2 blade flip gate saw *b
            hlaser gate pulse saw`,
  },
  {
    n: 8,
    name: "Small Wonder",
    blurb: "Yellow portals shrink you.",
    d: 0.2,
    gap: 540,
    beats: `gate saw @Yellow_portal_-_you_shrink mini saw2 gate *b > saw blade | hlaser
            mini pulse gate *t saw2 > flip saw gate | blade mini hlaser pulse *m gate
            saw2 blade gate`,
  },
  {
    n: 9,
    name: "Neon Gauntlet",
    blurb: "Everything the Void has, together.",
    d: 0.26,
    gap: 520,
    beats: `gate blade saw2 bladeduo > hlaser pulse *t gate | pulsepair saw blade >
            flip gate saw2 hlaser *m | bladeduo mini pulse gate > saw pulsepair *b
            blade hlaser | gate bladeduo saw2 pulse gate`,
  },
  {
    n: 10,
    name: "The Void Core",
    blurb: "BOSS: the heart of the Void wakes up.",
    d: 0.3,
    gap: 520,
    beats: `@BOSS_-_THE_VOID_CORE gate saw blade > hlaser pulse gate *b | bladeduo
            saw2 hlaser > pulsepair blade gate | flip saw bladeduo hlaser > gate pulse
            *m mini | blade saw2 pulsepair > hlaser gate | d=0.36 g=500 @THE_CORE_OPENS
            bladeduo pulse hlaser pulsepair | blade hlaser saw2 *t bladeduo > gate
            pulsepair blade hlaser bladeduo gate`,
  },
];
