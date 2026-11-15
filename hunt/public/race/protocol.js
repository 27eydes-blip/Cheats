// Hunt Racers wire constants shared by the server and the client. See PROTOCOL.md.
export const FLAG = {
  DRIFT: 1, BOOST: 2, AIR: 4, SHIELD: 8, LEADER: 16, DEAD: 32, SPIN: 64, EMP: 128,
  FINISHED: 256, OUT: 512, GHOST: 1024, SLOW: 2048, TIER1: 4096, TIER2: 8192, // drift tier = (f >> 12) & 3
  REVERSE: 16384,
};
export const driftTierOf = (f) => (f >> 12) & 3;
// entity kinds in snapshot rows (index = wire id, append only)
export const ENT = ['missile', 'rocket', 'oil', 'spikes', 'mine', 'turret', 'bolt'];
export const RACE_MODE_IDS = ['grand', 'elim', 'battle', 'trial'];
export const COUNTDOWN = 3; // seconds on the grid before GO
export const RESPAWN_TIME = 2; // seconds from destroyed to back on track
