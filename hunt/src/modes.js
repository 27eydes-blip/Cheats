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
    checkEnd: (sim) => (sim.holdId && sim.holdT <= 0) || sim.time >= 180,
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
for (const m of Object.values(MODES)) if (!m.rank) m.rank = byScore(m.score || ((p) => p.kills));
export const QUICK_MODES = Object.keys(MODES).filter((k) => MODES[k].quick);
