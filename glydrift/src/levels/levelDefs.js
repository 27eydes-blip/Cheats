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
    name: "Neon Drizzle",
    blurb: "Saws that drift up and down.",
    d: 0.08,
    gap: 600,
    beats: `gate saw saw gate *t saw > | saw gate saw saw *b gate >
            saw gate saw | gate saw *m saw gate saw gate`,
  },
  {
    n: 3,
    name: "Pillar Run",
    blurb: "Pillars and twin saws: one gap between them.",
    d: 0.1,
    gap: 580,
    beats: `gate saw @Fly_between_the_twin_saws saw2 > gate saw2 *m saw | gate saw2
            saw > gate saw2 *t gate saw | saw2 gate saw saw2 *b gate saw2`,
  },
  {
    n: 4,
    name: "Sawmill",
    blurb: "The axe swings: time your pass.",
    d: 0.12,
    gap: 580,
    beats: `gate saw @The_axe_swings_-_pass_behind_it blade > gate blade saw *b | gate
            blade saw2 > blade gate *t saw blade | gate blade saw2 *m gate blade saw`,
  },
  {
    n: 5,
    name: "Laser Alley",
    blurb: "Side lasers warn, then fire.",
    d: 0.14,
    gap: 560,
    beats: `g=640 gate > @Side_lasers_flash_before_they_fire hlaser > gate g=560 saw hlaser
            gate *m | blade
            hlaser saw2 > gate hlaser *t blade | saw hlaser gate saw2 *b hlaser gate blade`,
  },
  {
    n: 6,
    name: "Pulse Point",
    blurb: "The Neon Pulse breathes in and out.",
    d: 0.16,
    gap: 560,
    beats: `gate saw @The_pulse_grows_-_wait_for_it_to_shrink pulse > gate pulse saw *t |
            hlaser pulse gate > saw *b pulse gate | hlaser gate > pulse saw *m gate
            pulse saw hlaser`,
  },
  {
    n: 7,
    name: "Upside Down",
    blurb: "Pink portals flip gravity.",
    d: 0.18,
    gap: 560,
    beats: `gate saw @Pink_portal_-_gravity_flips flip gate saw gate *t > saw gate |
            blade hlaser flip saw gate *m pulse > gate | saw2 blade flip gate saw >
            hlaser *b gate pulse saw`,
  },
  {
    n: 8,
    name: "The Ruins",
    blurb: "Yellow portals shrink you.",
    d: 0.2,
    gap: 540,
    beats: `gate saw @Yellow_portal_-_you_shrink mini saw2 gate *b > saw blade | hlaser
            mini pulse gate *t saw2 > flip saw gate | blade mini hlaser pulse *m gate
            saw2 blade gate`,
  },
  {
    n: 9,
    name: "Static Storm",
    blurb: "Everything the Void has, together.",
    d: 0.26,
    gap: 520,
    beats: `gate blade saw2 bladeduo > hlaser pulse *t gate | pulsepair saw blade >
            flip gate saw2 hlaser *m | bladeduo mini pulse gate > saw pulsepair *b
            blade hlaser | gate bladeduo > saw pulse gate`,
  },
  {
    n: 10,
    name: "Heart of the Void",
    blurb: "BOSS: the heart of the Void wakes up.",
    d: 0.3,
    gap: 520,
    beats: `@BOSS_-_HEART_OF_THE_VOID gate saw blade > hlaser pulse gate *b | bladeduo
            saw2 hlaser > pulsepair blade > gate | flip saw bladeduo hlaser > gate pulse
            *m mini | blade saw2 pulsepair > hlaser gate | d=0.36 g=500 @THE_CORE_OPENS
            bladeduo pulse hlaser pulsepair | blade hlaser saw2 *t bladeduo > gate
            pulsepair blade gate`,
  },

  // ================================================================ SOLAR STORM (11–20)
  {
    n: 11,
    name: "Lava Lanes",
    blurb: "Geysers erupt from below: watch the glow.",
    d: 0.16,
    gap: 640,
    beats: `gate saw @Geysers_glow_before_they_erupt geyser > gate geyser saw *b | gate
            geyser saw > blade > geyser *t gate | saw > geyser gate *m saw geyser > gate saw
            geyser`,
  },
  {
    n: 12,
    name: "Ember Fall",
    blurb: "Meteors fall in a line: fly the gap behind them.",
    d: 0.25,
    gap: 570,
    beats: `gate geyser @Meteors_mark_their_path_first meteor > gate meteor saw *t | geyser
            meteor gate > saw2 meteor *b geyser | gate meteor saw geyser *m meteor gate
            saw2 meteor`,
  },
  {
    n: 13,
    name: "Fire Bars",
    blurb: "Spinning bars of flame.",
    d: 0.26,
    gap: 570,
    beats: `gate meteor @The_fire_bar_turns_-_slip_past firebar > gate firebar geyser *m |
            meteor firebar saw2 > gate firebar *t meteor | geyser firebar gate *b saw
            firebar meteor gate firebar`,
  },
  {
    n: 14,
    name: "Solar Flare",
    blurb: "The sun flares across the sky.",
    d: 0.28,
    gap: 560,
    beats: `gate geyser @Flares_sweep_after_a_warning flare > meteor flare gate *b | firebar
            flare saw2 > geyser flare *t gate | meteor flare firebar *m flare gate geyser
            flare saw`,
  },
  {
    n: 15,
    name: "Geyser Field",
    blurb: "Geysers in a row, then all at once.",
    d: 0.3,
    gap: 550,
    beats: `gate geyser meteor @Eruption_-_a_row_of_geysers eruption > firebar eruption gate
            *t | flare geyser eruption > meteor gate *m eruption | firebar saw2 eruption
            *b flare gate eruption meteor`,
  },
  {
    n: 16,
    name: "Meteor Shower",
    blurb: "Meteors in a storm, bars in pairs.",
    d: 0.32,
    gap: 540,
    beats: `gate meteor shower > firebar @Two_fire_bars_together firepair gate *m | flare
            shower geyser > firepair meteor *t | eruption gate shower firepair *b flare
            gate firebar shower`,
  },
  {
    n: 17,
    name: "Ash Cloud",
    blurb: "Geysers under spinning flame.",
    d: 0.34,
    gap: 530,
    beats: `gate geyserbar > meteor flare geyserbar *b | firepair shower gate > geyserbar
            eruption *t flare | flip gate geyser firebar meteor > gate *m geyserbar
            firepair shower flare eruption`,
  },
  {
    n: 18,
    name: "Heatwave",
    blurb: "Shrink to slip through the storm.",
    d: 0.36,
    gap: 520,
    beats: `gate mini geyser meteor firebar > flare shower *t | geyserbar mini eruption >
            firepair gate *b | flare meteor saw2 shower > geyserbar *m firepair > flip gate
            > eruption flare > shower gate`,
  },
  {
    n: 19,
    name: "Molten Core",
    blurb: "Everything the Storm has, together.",
    d: 0.38,
    gap: 510,
    beats: `gate eruption shower > firepair flare *m | geyserbar meteor firebar > shower
            eruption *b flare | mini firepair geyserbar > flare shower *t | eruption
            firepair meteor flare geyserbar shower gate`,
  },
  {
    n: 20,
    name: "The Inferno",
    blurb: "BOSS: fly into the sun's core.",
    d: 0.4,
    gap: 510,
    beats: `@BOSS_-_THE_INFERNO gate geyser meteor > firebar flare eruption *b |
            shower firepair > geyserbar flare | meteor eruption shower > firepair *m
            geyserbar | flip gate flare shower > eruption firepair | d=0.46 g=490
            @THE_SUN_ERUPTS flare geyserbar shower eruption | firepair flare *t shower >
            geyserbar eruption | flare firepair shower geyserbar eruption flare gate`,
  },
  // ================================================================ FROZEN NEBULA (21–30)
  {
    n: 21,
    name: "First Frost",
    blurb: "Icicles drop from the ceiling.",
    d: 0.28,
    gap: 580,
    beats: `gate saw @Icicles_shiver_then_drop icicle > gate icicle saw *t | gate icicle
            saw2 > blade icicle *m gate | saw icicle gate *b icicle saw2 gate icicle`,
  },
  {
    n: 22,
    name: "Glacier Gap",
    blurb: "Blocks of ice slide up and down.",
    d: 0.3,
    gap: 570,
    beats: `gate icicle @Ice_blocks_slide_-_find_the_gap slider > gate slider icicle *b |
            saw slider gate > icicle slider *t saw2 | gate slider icicle *m slider gate
            saw slider`,
  },
  {
    n: 23,
    name: "Snowblind",
    blurb: "Frozen sparks crackle across the sky.",
    d: 0.27,
    gap: 630,
    beats: `gate slider @Zaps_flicker_before_they_strike zap > gate zap icicle *m | slider >
            zap saw > gate zap *t icicle | slider zap gate *b zap icicle gate zap`,
  },
  {
    n: 24,
    name: "Frozen Peaks",
    blurb: "A comet streaks through the nebula.",
    d: 0.32,
    gap: 560,
    beats: `gate icicle @A_comet_streaks_in_-_its_trail_warns_you comet > slider comet gate
            *b | zap comet icicle > gate comet *t slider | zap comet gate *m icicle comet
            slider zap`,
  },
  {
    n: 25,
    name: "Icicle Drop",
    blurb: "A wall of icicles with one way through.",
    d: 0.34,
    gap: 550,
    beats: `gate slider @A_curtain_of_icicles icecurtain > zap icecurtain comet *t | gate
            icicle icecurtain > slider zap *m icecurtain | comet > gate icecurtain *b > zap
            slider > icecurtain`,
  },
  {
    n: 26,
    name: "Aurora",
    blurb: "Sliders in pairs.",
    d: 0.36,
    gap: 540,
    beats: `gate slider sliderpair > zap comet *b sliderpair | icecurtain icicle sliderpair
            > gate zap *t comet | sliderpair icecurtain *m slider sliderpair zap gate
            comet sliderpair`,
  },
  {
    n: 27,
    name: "Shatterpoint",
    blurb: "Zaps climb like stairs.",
    d: 0.37,
    gap: 530,
    beats: `gate zap zapstairs > sliderpair comet *m | icecurtain > zapstairs > flip gate
            slider > icicle zapstairs *t | comet sliderpair > zapstairs > icecurtain *b
            gate zap zapstairs comet`,
  },
  {
    n: 28,
    name: "Whiteout",
    blurb: "Tiny and fast through the blizzard.",
    d: 0.39,
    gap: 520,
    beats: `gate mini sliderpair zap icecurtain > comet zapstairs *b | mini icicle
            sliderpair > gate icecurtain *t comet | zapstairs > flip > gate slider zap >
            sliderpair *m icecurtain comet zapstairs gate`,
  },
  {
    n: 29,
    name: "Absolute Zero",
    blurb: "The Nebula's hardest run.",
    d: 0.41,
    gap: 510,
    beats: `gate gauntlet > comet sliderpair *t | icecurtain zapstairs gauntlet > comet
            *b sliderpair | mini icecurtain zap gauntlet > zapstairs comet *m | sliderpair
            gauntlet icecurtain comet zapstairs gate`,
  },
  {
    n: 30,
    name: "The Ice Throne",
    blurb: "BOSS: the nebula freezes solid.",
    d: 0.43,
    gap: 510,
    beats: `@BOSS_-_THE_ICE_THRONE gate icicle slider > zap comet icecurtain *t |
            sliderpair zapstairs > gauntlet comet | icecurtain sliderpair zap > zapstairs
            *b gauntlet | flip gate comet slider > icecurtain sliderpair | d=0.48 g=490
            @THE_THRONE_SHATTERS gauntlet comet zapstairs icecurtain | sliderpair *m
            gauntlet > comet zapstairs | icecurtain gauntlet sliderpair comet zapstairs >
            gate`,
  },
  // ================================================================ GLITCH REALM (31–40)
  {
    n: 31,
    name: "Boot Sequence",
    blurb: "Blocks blink in and out of existence.",
    d: 0.3,
    gap: 580,
    beats: `gate saw @Blink_blocks_fade_in_before_they_are_solid blink > gate blink saw *t |
            gate blink saw2 > blade blink *m gate | saw blink gate *b blink saw2 gate
            blink`,
  },
  {
    n: 32,
    name: "Bad Pixel",
    blurb: "Green zones flip your gravity inside them.",
    d: 0.31,
    gap: 580,
    beats: `gate blink @Inside_the_green_zone_gravity_flips zone > gate zone blink *b | saw
            zone gate > blink zone *t saw2 | gate zone blink *m zone gate saw zone`,
  },
  {
    n: 33,
    name: "Blink Blocks",
    blurb: "Blink blocks in pairs.",
    d: 0.33,
    gap: 570,
    beats: `gate blink @Two_blink_blocks_take_turns blinkpair > zone blinkpair gate *m |
            blink zone blinkpair > saw2 gate *t blinkpair | zone blink blinkpair *b gate
            zone blinkpair`,
  },
  {
    n: 34,
    name: "Data Stream",
    blurb: "A wall of blinking gates.",
    d: 0.3,
    gap: 610,
    beats: `gate blinkpair > @The_gate_blinks_open blinkgate > zone blinkgate blink *b |
            blinkpair > blinkgate gate > zone blink *t blinkgate | blinkpair > zone blinkgate
            *m gate blink > blinkgate`,
  },
  {
    n: 35,
    name: "Corrupted",
    blurb: "Gravity flips, and the blocks blink.",
    d: 0.33,
    gap: 590,
    beats: `gate blink > flip > gate blinkpair > zone blinkgate *t | blink zone blinkpair >
            gate blinkgate *m zone | flip > blinkpair gate blink > blinkgate zone *b
            blinkpair blink gate`,
  },
  {
    n: 36,
    name: "Lag Spike",
    blurb: "Small, fast and glitching.",
    d: 0.38,
    gap: 540,
    beats: `gate mini blinkpair zone blink > blinkgate *b zone | mini blinkpair blinkgate
            > zone blink *t | gate blinkpair zone > blinkgate *m blink zone blinkpair
            blinkgate gate`,
  },
  {
    n: 37,
    name: "Firewall",
    blurb: "The glitches speed up.",
    d: 0.37,
    gap: 570,
    beats: `gate blinkgate > zone blinkpair > blink zone *m | blinkgate blinkpair zone >
            flip gate blink blinkpair > *t blinkgate | zone blinkpair blinkgate > zone *b
            blink blinkpair blinkgate gate`,
  },
  {
    n: 38,
    name: "Packet Loss",
    blurb: "Blades meet the glitch.",
    d: 0.42,
    gap: 520,
    beats: `gate blade blinkpair zone > hlaser blinkgate *b | saw2 zone blinkpair >
            blade blinkgate *t zone | mini blinkpair hlaser > zone blinkgate *m blade
            blinkpair zone gate`,
  },
  {
    n: 39,
    name: "Fatal Error",
    blurb: "Everything the Glitch Realm has, together.",
    d: 0.4,
    gap: 550,
    beats: `gate blinkgate > zone blinkpair > blinkgate zone *t | flip gate blinkpair blink
            > blinkgate zone *b | mini > blinkpair blinkgate zone > blinkpair *m blinkgate
            | zone blinkpair > blinkgate zone > blinkpair gate`,
  },
  {
    n: 40,
    name: "System Crash",
    blurb: "BOSS: the realm crashes around you.",
    d: 0.43,
    gap: 550,
    beats: `@BOSS_-_SYSTEM_CRASH gate blink zone > blinkpair blinkgate *m | zone
            blinkpair > blinkgate blink zone | flip gate blinkpair > blinkgate *t zone |
            mini blinkpair blinkgate zone > blinkpair blinkgate | d=0.47 g=530
            @CRITICAL_FAILURE blinkgate > zone blinkpair > blinkgate | zone *b blinkpair >
            blinkgate zone | blinkpair blinkgate > zone blinkpair > blinkgate gate`,
  },
  // ================================================================ THE ABYSS (41–50)
  {
    n: 41,
    name: "The Descent",
    blurb: "Tendrils reach up from the dark.",
    d: 0.32,
    gap: 620,
    beats: `gate saw @Tendrils_rise_slowly_-_fly_over_or_under tendril > gate tendril saw
            *t | gate tendril saw2 > blade tendril *m gate | saw tendril gate *b tendril
            saw2 gate tendril`,
  },
  {
    n: 42,
    name: "Whispers",
    blurb: "The walls slam shut: one slot stays open.",
    d: 0.33,
    gap: 610,
    beats: `gate tendril > @The_slammer_closes_-_aim_for_the_open_slot slammer > gate slammer
            tendril *b | saw slammer gate > tendril slammer *t | gate slammer *m tendril
            slammer gate saw slammer > gate tendril slammer gate`,
  },
  {
    n: 43,
    name: "Crushing Dark",
    blurb: "The walls of the Abyss close in.",
    d: 0.34,
    gap: 600,
    beats: `gate slammer @The_walls_close_in walls > tendril walls gate *m | slammer walls
            tendril > gate walls *t slammer | tendril walls *b gate slammer walls tendril`,
  },
  {
    n: 44,
    name: "Eye Beam",
    blurb: "An eye opens and fires a beam.",
    d: 0.35,
    gap: 600,
    beats: `gate tendril @The_eye_glows_before_it_fires eyebeam > walls eyebeam gate *b |
            slammer eyebeam tendril > gate eyebeam *t walls | slammer eyebeam *m tendril
            eyebeam gate walls`,
  },
  {
    n: 45,
    name: "The Watchers",
    blurb: "Two eyes, two beams.",
    d: 0.37,
    gap: 590,
    beats: `gate eyebeam @Two_eyes_take_turns eyepair > tendril walls *t | slammer eyepair
            > gate eyebeam *m walls | tendril > eyepair slammer > *b gate eyepair walls
            eyebeam tendril`,
  },
  {
    n: 46,
    name: "Tendrils",
    blurb: "Tendrils under a watching eye.",
    d: 0.39,
    gap: 580,
    beats: `gate tendril tendrileye > walls slammer *m | eyepair tendrileye > flip gate
            tendril eyebeam > *b walls tendrileye | slammer eyepair > tendrileye *t
            walls eyebeam gate`,
  },
  {
    n: 47,
    name: "No Light",
    blurb: "The slammer and the eye, together.",
    d: 0.41,
    gap: 570,
    beats: `gate slammer @Slammer_and_eye_-_take_the_open_lane eyeslam > walls tendrileye
            *t | eyepair eyeslam > tendril walls *b | slammer > eyeslam tendrileye > eyepair
            *m walls eyeslam gate`,
  },
  {
    n: 48,
    name: "Point of No Return",
    blurb: "Shrink to slip through the dark.",
    d: 0.43,
    gap: 560,
    beats: `gate mini eyepair walls tendrileye > slammer *b eyeslam | mini tendril eyepair
            > walls eyeslam *t | flip gate tendrileye slammer > eyepair *m walls eyeslam
            tendrileye gate`,
  },
  {
    n: 49,
    name: "Last Breath",
    blurb: "Everything the Abyss has, together.",
    d: 0.42,
    gap: 580,
    beats: `gate eyeslam tendrileye > walls eyepair *m | slammer eyeslam > tendrileye
            walls *t | flip gate eyepair slammer > eyeslam *b tendrileye | walls > eyepair
            eyeslam > tendrileye walls > eyepair gate`,
  },
  {
    n: 50,
    name: "The Abyss",
    blurb: "FINAL BOSS: the Abyss opens its eyes.",
    d: 0.47,
    gap: 550,
    beats: `@FINAL_BOSS_-_THE_ABYSS gate tendril slammer > walls eyebeam *t |
            tendrileye eyepair > eyeslam walls | slammer tendrileye > eyepair *m eyeslam
            | flip gate walls tendril > eyepair eyeslam | mini tendrileye walls > slammer
            eyepair | d=0.52 g=530 @THE_ABYSS_OPENS_ITS_EYES eyeslam tendrileye eyepair
            walls | eyeslam *b slammer > tendrileye eyepair | walls eyeslam eyepair
            tendrileye slammer eyeslam walls eyepair gate`,
  },
];
