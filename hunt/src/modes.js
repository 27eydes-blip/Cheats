// Game modes. Each mode is a plain object of rules + optional hooks the Sim calls:
//   init(sim), tick(sim), onKill(sim, victim, killer), checkEnd(sim) -> bool,
//   score(p) -> number (for ranking / leaderboard), hud(sim) -> extra snapshot data,
//   botGoal(sim, bot) -> {x,y} | {targetId} | null
import { DT, TILE, EMPTY } from '../public/shared.js';

const byScore = (score) => (sim) => [...sim.players.values()]
  .sort((a, b) => score(b) - score(a) || b.kills - a.kills || b.bounty - a.bounty);

export const MODES = {
  showdown: {
    name: 'Showdown', desc: 'Last hunter standing wins. The poison closes in!', respawn: false, poison: true, quick: true,
    checkEnd: (sim) => sim.aliveCount() <= 1,
    rank: (sim) => [...sim.players.values()].sort((a, b) => (b.alive - a.alive) || (a.rank || 99) - (b.rank || 99)),
    tieKey: (sim, p) => (p.alive ? 'alive' : 'r' + p.rank), // eliminated on the same tick = same place
  },

  // BIG HUNT: 20-player Showdown on a 5000x5000 arena (picked from the mode list, never at random)
  bighunt: {
    name: 'Big Hunt', desc: '20 hunters, one huge arena. Last one standing wins!', respawn: false, poison: true, quick: true, noRandom: true, maxPlayers: 20,
    checkEnd: (sim) => sim.aliveCount() <= 1,
    rank: (sim) => [...sim.players.values()].sort((a, b) => (b.alive - a.alive) || (a.rank || 99) - (b.rank || 99)),
    tieKey: (sim, p) => (p.alive ? 'alive' : 'r' + p.rank),
  },

  bounty: {
    name: 'Bounty Rush', desc: 'Steal bounties! Highest bounty when time runs out wins.', respawn: true, quick: true, timeLimit: 120,
    score: (p) => p.bounty,
    checkEnd: (sim) => sim.time >= 120,
    hud: (sim) => ({ tl: Math.max(0, 120 - sim.time) }),
    botGoal: (sim, bot) => {
      let best = null;
      for (const p of sim.players.values()) if (p !== bot && p.alive && p.bounty > (best?.bounty ?? 0)) best = p;
      return best && best.bounty >= 2 ? { targetId: best.id } : null;
    },
  },

  hunted: {
    name: 'Hunted', desc: 'Everyone hunts the marked target. Take them down to become the target!', respawn: true, quick: true, timeLimit: 150,
    init: (sim) => { sim.targetId = 0; },
    tick: (sim) => {
      const t = sim.players.get(sim.targetId);
      if (!t || !t.alive) {
        if (sim.time < 4) return;
        const alive = [...sim.players.values()].filter((p) => p.alive && p.spawnProt <= 0);
        if (!alive.length) return;
        sim.setTarget(alive[Math.floor(sim.rand() * alive.length)]);
      } else t.score += DT;
    },
    onKill: (sim, v, k) => {
      if (v.id !== sim.targetId) return;
      if (k && k !== v && k.alive) { k.score += 3; sim.setTarget(k); } else sim.targetId = 0;
    },
    score: (p) => Math.floor(p.score),
    checkEnd: (sim) => sim.time >= 150,
    hud: (sim) => ({ tl: Math.max(0, 150 - sim.time), tg: sim.targetId }),
    botGoal: (sim, bot) => (sim.targetId && sim.targetId !== bot.id ? { targetId: sim.targetId } : null),
  },

  crystals: {
    name: 'Crystal Grab', desc: 'Grab 10 crystals and hold them for 10 seconds!', respawn: true, quick: true, timeLimit: 180,
    init: (sim) => { sim.crystalT = 3; sim.holdId = 0; sim.holdT = 0; },
    tick: (sim) => {
      sim.crystalT -= DT;
      if (sim.crystalT <= 0 && sim.crystals.length < 10) {
        sim.crystalT = 3.5;
        const c = sim.center;
        for (let i = 0; i < 20; i++) {
          const a = sim.rand() * Math.PI * 2, d = 60 + sim.rand() * 140;
          const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
          const idx = Math.floor(y / TILE) * sim.map.gw + Math.floor(x / TILE);
          if (sim.map.t[idx] === EMPTY || sim.map.t[idx] === 2) { sim.dropCrystal(x, y); break; }
        }
      }
      // holder of 10+ (and the most) starts the countdown
      let best = null;
      for (const p of sim.players.values()) if (p.alive && p.crystals >= 10 && (!best || p.crystals > best.crystals)) best = p;
      if (best && best.id === sim.holdId) sim.holdT -= DT;
      else if (best) { sim.holdId = best.id; sim.holdT = 10; }
      else { sim.holdId = 0; sim.holdT = 0; }
    },
    score: (p) => p.crystals,
    checkEnd: (sim) => {
      const h = sim.holdId && sim.holdT <= 0 ? sim.players.get(sim.holdId) : null;
      if (h && h.alive && h.crystals >= 10) { sim.crystalWinner = h.id; return true; }
      return sim.time >= 180;
    },
    rank: (sim) => [...sim.players.values()].sort((a, b) => (b.id === sim.crystalWinner) - (a.id === sim.crystalWinner) || b.crystals - a.crystals || b.kills - a.kills || b.bounty - a.bounty),
    tieKey: (sim, p) => `${p.id === sim.crystalWinner ? 'W' : ''}|${p.crystals}|${p.kills}|${p.bounty}`,
    hud: (sim) => ({ tl: Math.max(0, 180 - sim.time), hold: sim.holdId ? [sim.holdId, Math.max(0, sim.holdT)] : null }),
    botGoal: (sim, bot) => {
      if (bot.crystals >= 7) return null; // hold on: fight/hide normally
      let best = null, bd = Infinity;
      for (const c of sim.crystals) { const d = Math.hypot(c.x - bot.x, c.y - bot.y); if (d < bd) { bd = d; best = c; } }
      if (best) return { x: best.x, y: best.y };
      let rich = null;
      for (const p of sim.players.values()) if (p !== bot && p.alive && p.crystals > (rich?.crystals ?? 2)) rich = p;
      return rich ? { targetId: rich.id } : null;
    },
  },

  squad: {
    name: 'Squad Hunt', desc: '3v3! Kills fill your team pot. Highest pot after 3:00 wins.', respawn: true, quick: true, teams: true, maxPlayers: 6, timeLimit: 180,
    score: (p) => p.bountyEarned,
    // winning team first (by pot), then each player's bounty earned
    rank: (sim) => [...sim.players.values()].sort((a, b) => (sim.teamPot[b.team] - sim.teamPot[a.team]) || (a.team - b.team) || (b.bountyEarned - a.bountyEarned) || (b.kills - a.kills)),
    checkEnd: (sim) => sim.time >= 180,
    hud: (sim) => ({ tl: Math.max(0, 180 - sim.time), pots: sim.teamPot }),
    botGoal: (sim, bot) => {
      let best = null;
      for (const p of sim.players.values()) if (p.team !== bot.team && p.alive && p.bounty > (best?.bounty ?? 1)) best = p;
      return best ? { targetId: best.id } : null;
    },
  },

  freeplay: {
    name: 'Free Play', desc: 'Drop-in open world.', respawn: true, hub: true,
    checkEnd: () => false,
    score: (p) => p.bounty,
  },
};
for (const m of Object.values(MODES)) {
  const score = m.score || ((p) => p.kills);
  if (!m.rank) m.rank = byScore(score);
  // players equal on every tie-break share a place (1, 1, 3 ...)
  if (!m.tieKey && !m.teams) m.tieKey = (sim, p) => `${score(p)}|${p.kills}|${p.bounty}`;
}
// TEST RANGE: a private open map with target dummies to try any unlocked weapon. No rewards.
MODES.range = {
  name: 'Test Range', desc: 'Try your weapons on target dummies. Leave any time.', respawn: true, maxPlayers: 1, timeLimit: 900, noRewards: true,
  checkEnd: (sim) => sim.time >= 900,
  hud: (sim) => ({ tl: Math.max(0, 900 - sim.time) }),
  score: () => 0,
  rank: (sim) => [...sim.players.values()],
  onStart: (sim) => {
    const c = sim.center, me = sim.humans()[0];
    if (me) { me.x = me.px = c.x - 420; me.y = me.py = c.y; me.facing = 0; }
    // dummies at several ranges (one strafes), as tough as you are
    const spots = [[-150, -170, 0], [0, 0, 0], [150, 170, 0], [330, -240, 1], [330, 240, 0], [620, 0, 0]];
    const kinds = ['brick', 'volt', 'wisp', 'flicker', 'dune', 'rook'];
    spots.forEach(([dx, dy, mover], i) => {
      const d = sim.addPlayer({ name: mover ? 'Moving Dummy' : 'Dummy', brawler: kinds[i], bot: true });
      d.dummy = true; d.mover = !!mover; d.home = { x: c.x + dx, y: c.y + dy };
      d.pset = { [d.brawler]: { power: me ? me.power || 1 : 1 } }; sim.applyPower(d, true); d.hp = d.maxHp;
      d.x = d.px = d.home.x; d.y = d.py = d.home.y; d.facing = Math.PI;
    });
  },
  dummyInput: (sim, d) => ({ t: 'in', s: 0, mx: 0, my: d.mover ? (Math.sin(sim.time * 1.3) > 0 ? 1 : -1) : 0, ax: -1, ay: 0, f: null, u: null }),
  tick: (sim) => {
    for (const d of sim.players.values()) {
      if (!d.dummy || !d.alive) continue;
      if (sim.time - d.lastCombat > 2.5) d.hp = d.maxHp; // dummies heal up when you stop shooting
      const far = Math.hypot(d.x - d.home.x, d.y - d.home.y) > (d.mover ? 300 : 40);
      if (far && !d.knock) { d.x = d.px = d.home.x; d.y = d.py = d.home.y; } // back to its spot (after a respawn or a shove)
    }
  },
  botGoal: () => null,
};

export const QUICK_MODES = Object.keys(MODES).filter((k) => MODES[k].quick);
// the "any mode" pool for Quick Hunt (Big Hunt is only played when picked)
export const RANDOM_MODES = QUICK_MODES.filter((k) => !MODES[k].noRandom);
export const playersFor = (mode) => (MODES[mode] && MODES[mode].maxPlayers) || 10;
