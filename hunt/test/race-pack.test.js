// Bots race close to the humans (src/race/bots.js packPace): a bot well behind the leading human
// pushes a little nearer its limit, one well ahead eases off; near the human, with no human in the
// race (bot-only balance runs) or once finished: no change. Bounded both ways.
import assert from 'node:assert';
import { packPace } from '../src/race/bots.js';

const mk = (players) => ({ time: 0, players: new Map(players.map((q, i) => [i, q])), progress: (q) => q.prog });
const human = (prog, o = {}) => ({ wasBot: false, connected: true, prog, ...o });
const bot = (prog, o = {}) => ({ wasBot: true, bot: true, prog, ...o });

{ const b = bot(5000), s = mk([bot(9000), b]); assert.strictEqual(packPace(s, b), 1, 'no humans: no change'); }
{ const b = bot(5000), s = mk([human(5100), b]); assert.strictEqual(packPace(s, b), 1, 'right by the human: no change'); }
{ const b = bot(2000), s = mk([human(5000), b]); const k = packPace(s, b); assert.ok(k > 1.05 && k <= 1.06 + 1e-12, `far behind: pushes (${k})`); }
{ const b = bot(9000), s = mk([human(5000), b]); const k = packPace(s, b); assert.ok(k < 0.95 && k >= 0.92 - 1e-12, `far ahead: eases off (${k})`); }
{ const b = bot(9000, { finished: true }), s = mk([human(5000), b]); assert.strictEqual(packPace(s, b), 1, 'finished: no change'); }
// the leading human counts; finished / knocked-out / disconnected humans don't
{ const b = bot(5000), s = mk([human(1000), human(5050), b]); assert.strictEqual(packPace(s, b), 1, 'the leading human'); }
{ const b = bot(5000), s = mk([human(20000, { finished: true }), human(5000, { connected: false }), human(5000), b]); assert.strictEqual(packPace(s, b), 1, 'only racing, connected humans'); }
// cached per tick: a new tick sees the new positions
{ const h = human(5000), b = bot(5000), s = mk([h, b]); packPace(s, b); h.prog = 9000; assert.strictEqual(packPace(s, b), 1, 'same tick: cached'); s.time += 1 / 30; assert.ok(packPace(s, b) > 1, 'next tick: updated'); }
console.log('race-pack: ok');
