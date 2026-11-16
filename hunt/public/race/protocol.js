// Hunt Racers wire constants shared by the server and the client. See PROTOCOL.md.
export const FLAG = {
  DRIFT: 1, BOOST: 2, AIR: 4, SHIELD: 8, LEADER: 16, DEAD: 32, SPIN: 64, EMP: 128,
  FINISHED: 256, OUT: 512, GHOST: 1024, SLOW: 2048, TIER1: 4096, TIER2: 8192, // drift tier = (f >> 12) & 3
  REVERSE: 16384, BRAKE: 32768, // BRAKE: throttle on brake while rolling forward (draw-only: brake lights)
  PHASE: 65536, PROT: 131072, // PHASE: Ghost Mode item; PROT: 2 s hit protection after a rival's hit
};
export const driftTierOf = (f) => (f >> 12) & 3;
// entity kinds in snapshot rows (index = wire id, append only)
export const ENT = ['missile', 'rocket', 'oil', 'spikes', 'mine', 'turret', 'bolt', 'well', 'sticky', 'drone', 'trap'];
// the four modes (shown in the lobby; the server reads the rules from here too)
export const RACE_MODES = {
  grand: { name: 'Grand Race', desc: '3 laps. First across the line wins.', laps: 3, items: true, weapons: true },
  elim: { name: 'Elimination Race', desc: 'Last place is cut every 18 seconds. Outrun the black hole.', laps: 0, items: true, weapons: true, every: 18, first: 25 },
  battle: { name: 'Battle Arena', desc: 'Most takedowns in 2 minutes wins.', arena: true, items: true, weapons: true, time: 120 },
  trial: { name: 'Time Trial', desc: 'Just you and the clock. Beat your best time.', laps: 3, solo: true, items: false, weapons: false },
};
export const RACE_MODE_IDS = Object.keys(RACE_MODES);
// the first-race tutorial: a private solo run on the training track (not in the lobby's mode list).
// Steps in order; the server reports each one as a {k:'tut', step} event.
export const TUTORIAL_MODE = { name: 'Tutorial', desc: 'Steer, drift, grab an item and fire.', laps: 0, solo: true, items: true, weapons: true, tutorial: true, time: 180 };
export const TUT_STEPS = ['steer', 'drift', 'item', 'fire', 'done'];
export const RESET_COOLDOWN = 3; // s between RESET presses
export const STUCK_NUDGE = 1.5; // s pinned against a wall before the automatic nudge
export const STUCK_RESET = 3; // s stuck before the automatic reset
export const COUNTDOWN = 3; // seconds on the grid before GO
export const RESPAWN_TIME = 2; // seconds from destroyed to back on track
// ELIMINATION (see PROTOCOL.md "Elimination"): the cut schedule, the black hole, the takedown boost.
// Cuts: the first at `first` s, then every `every` s; once `lateAt` racers are left every `late` s; the
// FINAL DUEL (2 left) runs on `duel` s. Black hole (px along the track, px/s): it starts `start` px behind
// the last car, moves at `base` + `step` per cut (capped at `max`; it eases up to speed over the first
// `ramp` s after GO), is never more than `leash` px behind
// the last racer, and swallows any car whose race distance is within `reach` px of it.
export const ELIM = {
  first: 25, every: 18, late: 12, lateAt: 4, duel: 8,
  hole: { start: 1200, ramp: 4, base: 430, step: 30, max: 760, leash: 1500, reach: 120, warn: 900, r: 210 },
  burst: { t: 2, p: 1.3 }, // takedown boost: 2 s for knocking a car out or hitting the racer in danger
  emoteGap: 1.5, // s between two emotes from one spectator
};
// the time to the next cut once `left` racers are in the race (after a cut, or when the hole took one)
export const elimInterval = (left) => (left <= 2 ? ELIM.duel : left <= ELIM.lateAt ? ELIM.late : ELIM.every);
// the cut times for a field of n racers when only the cuts remove anyone: [25, 43, ...]
export function elimSchedule(n) {
  const out = [];
  for (let t = ELIM.first, left = n; left > 1; left--) { out.push(t); t += elimInterval(left - 1); }
  return out;
}
// spectator emotes (index = wire id)
export const EMOTES = ['GG', 'WOW', 'GO GO', 'SO CLOSE'];
