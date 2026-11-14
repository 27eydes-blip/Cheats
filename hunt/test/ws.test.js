// Run against `npm run dev`: two clients in one room, A hunts B until B is eliminated.
const base = process.env.HUNT_URL || 'ws://127.0.0.1:8787';
const room = 'T' + Math.floor(Math.random() * 1e6);
function client(name, brawler) {
  const ws = new WebSocket(`${base}/ws?name=${name}&brawler=${brawler}&room=${room}&bots=${process.env.BOTS ?? 0}&mode=showdown`);
  const c = { ws, name, me: null, msgs: [], id: 0, others: [] };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    c.msgs.push(m.t);
    if (m.t === 'start') c.id = m.you;
    if (m.t === 's') { c.me = m.me; c.others = m.p; }
    if (m.t === 'dead') c.dead = m;
    if (m.t === 'kill') (c.kills ||= []).push(m);
  };
  return c;
}
const A = client('Hunter', 'wisp'), B = client('Prey', 'volt');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
while (!A.me || !B.me) { await wait(100); if (Date.now() - t0 > 30000) throw new Error('match never started'); }
console.log('started; A id', A.id, 'B id', B.id);
let seq = 0, bSeq = 0;
while (!B.dead && Date.now() - t0 < 120000) {
  const b = A.others.find((p) => p[0] === B.id);
  let mx = 0, my = 0, f = null;
  const tx = b ? b[1] : B.me.x, ty = b ? b[2] : B.me.y; // if hidden in a bush, cheat-follow via B's own view
  const ang = Math.atan2(ty - A.me.y, tx - A.me.x);
  const d = Math.hypot(tx - A.me.x, ty - A.me.y);
  if (d > 250) { mx = Math.cos(ang); my = Math.sin(ang); }
  if (b && seq % 8 === 0) f = ang;
  A.ws.send(JSON.stringify({ t: 'in', s: ++seq, mx, my, ax: 0, ay: 0, f, u: A.me.sc >= 1 ? 0 : null }));
  B.ws.send(JSON.stringify({ t: 'in', s: ++bSeq, mx: 0, my: 0, ax: 0, ay: 0, f: null, u: null }));
  if (seq % 40 === 0) console.log(`t=${((Date.now()-t0)/1000)|0}s d=${d|0} visible=${!!b} A=(${A.me.x|0},${A.me.y|0}) B hp=${B.me.hp}`);
  await wait(50);
}
console.log('B dead:', B.dead, '\nkill feed seen by A:', (A.kills || []).map((k) => `${k.k} x ${k.v}`).join(', '));
console.log(B.dead && B.dead.killer === 'Hunter' ? 'PASS: Hunter eliminated Prey' : 'B died to ' + (B.dead && B.dead.killer));
A.ws.close(); B.ws.close();
process.exit(B.dead ? 0 : 1);
