// Hunt Racers wire constants shared by the server and the client. See PROTOCOL.md.
export const FLAG = {
  DRIFT: 1, BOOST: 2, AIR: 4, SHIELD: 8, LEADER: 16, DEAD: 32, SPIN: 64, EMP: 128,
  FINISHED: 256, OUT: 512, GHOST: 1024, SLOW: 2048, TIER1: 4096, TIER2: 8192, // drift tier = (f >> 12) & 3
  REVERSE: 16384,
};
export const driftTierOf = (f) => (f >> 12) & 3;
// entity kinds in snapshot rows (index = wire id, append only)
export const ENT = ['missile', 'rocket', 'oil', 'spikes', 'mine', 'turret', 'bolt'];
// the four modes (shown in the lobby; the server reads the rules from here too)
export const RACE_MODES = {
  grand: { name: 'Grand Race', desc: '3 laps. First across the line wins.', laps: 3, items: true, weapons: true },
  elim: { name: 'Elimination Race', desc: 'Last place is knocked out every 18 seconds.', laps: 0, items: true, weapons: true, every: 18, first: 30 },
  battle: { name: 'Battle Arena', desc: 'Most takedowns in 2 minutes wins.', arena: true, items: true, weapons: true, time: 120 },
  trial: { name: 'Time Trial', desc: 'Just you and the clock. Beat your best time.', laps: 3, solo: true, items: false, weapons: false },
};
export const RACE_MODE_IDS = Object.keys(RACE_MODES);
export const COUNTDOWN = 3; // seconds on the grid before GO
export const RESPAWN_TIME = 2; // seconds from destroyed to back on track
