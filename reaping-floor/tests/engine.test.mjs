// Engine + dynasty tests for The Reaping Floor.
// Pulls the engine block (//==ENGINE START ... //==ENGINE END) out of index.html and runs it in Node.
//   node reaping-floor/tests/engine.test.mjs          (full run)
//   node reaping-floor/tests/engine.test.mjs --quick  (fewer games)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const QUICK = process.argv.includes('--quick');
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL', msg); } };
const t0 = Date.now();

// ---- 0. syntax check every inline script
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
ok(scripts.length >= 1, 'has an inline script');
for (const s of scripts) { try { new vm.Script(s); } catch (e) { ok(false, 'syntax: ' + e.message); } }
const src = html.slice(html.indexOf('//==ENGINE START'), html.indexOf('//==ENGINE END'));
ok(src.length > 1000, 'engine block found');
ok(!/document\.|window\.|localStorage|fetch\(|XMLHttpRequest/.test(src), 'engine has no DOM / network use');
const ctx = { module: { exports: null }, console };
vm.runInNewContext(src + '\nmodule.exports = RF;', ctx);
const RF = ctx.module.exports;
console.log('syntax + engine load: ok');

// ---- 1. AI vs AI matches on every quarter length
const L0 = RF.newLeague(42, 45);
const mk = (L, a, b, q, seed) => ({ rosters: [RF.lineup(L, a), RF.lineup(L, b)], mods: [RF.teamMods(L, a), RF.teamMods(L, b)], qlen: q, seed, human: -1 });
function watchedMatch(o) {
  const m = RF.createMatch(o);
  let n = 0, freeT = 0, maxFree = 0, bad = null, still = 0, maxStill = 0;
  const maxN = (o.qlen * 4 + 600) * 60 * 3;
  while (m.state !== 'final' && n++ < maxN) {
    RF.step(m, RF.DT);
    m.ev.length = 0;
    const b = m.ball;
    if (!bad) {
      for (const p of m.pl) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.vx)) bad = 'NaN player';
        else if (p.x < 0 || p.x > RF.W || p.y < 0 || p.y > RF.H) bad = 'player off field ' + p.x.toFixed(0) + ',' + p.y.toFixed(0);
      }
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) bad = 'NaN ball';
      else if (b.x < 0 || b.x > RF.W || b.y < 0 || b.y > RF.H) bad = 'ball off field';
      if (b.mode === 'held' && (!b.own || !b.own.on)) bad = 'ball held by benched player';
      if (m.pl.filter((p) => p.team === 0).length > 5 || m.pl.filter((p) => p.team === 1).length > 5) bad = 'more than 5 on the field';
    }
    if (m.state === 'play' && (b.mode === 'free' || b.mode === 'rolling')) { freeT += RF.DT; maxFree = Math.max(maxFree, freeT); } else freeT = 0;
    // "AI never stalls": somebody on the floor is always moving during live play
    if (m.state === 'play') {
      const moving = m.pl.some((p) => Math.hypot(p.vx, p.vy) > 15);
      still = moving ? 0 : still + RF.DT; maxStill = Math.max(maxStill, still);
    }
  }
  m.steps = n; m.maxFree = maxFree; m.bad = bad; m.maxStill = maxStill;
  return m;
}
const QL = [60, 180, 300, 900];
const per = QUICK ? 4 : 12;
const all180 = [];
for (const q of QL) {
  const sc = [], ots = [];
  let maxFree = 0, maxIdle = 0, maxStill = 0, ref = 0;
  const kinds = { dunk: 0, mid: 0, deep: 0 }, mult = [0, 0, 0, 0, 0];
  const n = per;
  for (let i = 0; i < n; i++) {
    const a = (i * 7 + q) % 50, b = (i * 13 + 5 + q) % 50;
    const m = watchedMatch(mk(L0, a, b === a ? (b + 1) % 50 : b, q, 1000 + i + q));
    ok(m.state === 'final', `q${q} game ${i} finished`);
    ok(!m.bad, `q${q} game ${i}: ${m.bad}`);
    ok(m.score[0] !== m.score[1], `q${q} game ${i} has a winner`);
    sc.push(...m.score);
    if (m.ot) ots.push(m.otT);
    if (m.refCall) ref++;
    maxFree = Math.max(maxFree, m.maxFree); maxIdle = Math.max(maxIdle, m.stats.maxIdle); maxStill = Math.max(maxStill, m.maxStill);
    for (const k in kinds) kinds[k] += m.stats.kinds[k];
    m.stats.mult.forEach((v, j) => (mult[j] += v));
    if (q === 180) all180.push(m);
  }
  sc.sort((x, y) => x - y);
  const avg = sc.reduce((x, y) => x + y, 0) / sc.length;
  const pc = (f) => sc[Math.min(sc.length - 1, Math.floor(sc.length * f))];
  console.log(`q ${q / 60}:00  games ${n}  team pts avg ${avg.toFixed(1)}  min ${sc[0]} p25 ${pc(0.25)} med ${pc(0.5)} p75 ${pc(0.75)} max ${sc[sc.length - 1]}`);
  console.log(`        scores dunk/mid/deep ${kinds.dunk}/${kinds.mid}/${kinds.deep}  chain x1..x4 ${mult.slice(1).join('/')}  OT ${ots.length} (${ots.map((x) => x.toFixed(0) + 's').join(' ')})  ref calls ${ref}`);
  console.log(`        longest loose ball ${maxFree.toFixed(1)}s  longest no-touch ${maxIdle.toFixed(1)}s  longest all-still ${maxStill.toFixed(1)}s`);
  ok(maxFree < 10, `q${q} loose ball never stuck (>10s)`);
  ok(maxStill < 1.5, `q${q} AI never freezes`);
  if (q === 180) ok(avg >= 20 && avg <= 40, `3:00 quarters average 20-40 points a team (got ${avg.toFixed(1)})`);
}

// ---- 2. overtime: 1:00 quarters produce plenty of ties
{
  const ots = [];
  const N = QUICK ? 60 : 200;
  for (let i = 0; i < N; i++) {
    const a = (i * 3) % 50, b = (i * 17 + 9) % 50;
    const m = RF.simMatch(mk(L0, a, a === b ? (b + 1) % 50 : b, 60, 5000 + i));
    if (m.ot) ots.push(m.otT);
  }
  ots.sort((x, y) => x - y);
  const avg = ots.reduce((x, y) => x + y, 0) / Math.max(1, ots.length);
  console.log(`overtime: ${ots.length} of ${N} games  avg ${avg.toFixed(1)}s  median ${(ots[ots.length >> 1] || 0).toFixed(1)}s  max ${(ots[ots.length - 1] || 0).toFixed(1)}s`);
  ok(ots.length > 0, 'some games reach OT');
  ok(avg < 90, 'OT ends within ~90s on average');
}

// ---- 3. district balance (physics) and quick-sim calibration
{
  const byD = (L, d) => L.teams.filter((t) => t.d === d).map((t) => t.id);
  const N = QUICK ? 10 : 24;
  const line = (da, db) => {
    let w = 0, s = [0, 0], qw = 0, qs = [0, 0];
    const A = byD(L0, da), B = byD(L0, db);
    for (let i = 0; i < N; i++) {
      const a = A[i % A.length], b = B[(i * 3 + 1) % B.length];
      const m = RF.simMatch(mk(L0, a, b, 180, 7000 + i));
      if (m.winner === 0) w++;
      s[0] += m.score[0]; s[1] += m.score[1];
      const r = RF.quickSim(L0, a, b);
      if (r[0] > r[1]) qw++;
      qs[0] += r[0]; qs[1] += r[1];
    }
    console.log(`D${da} v D${db}: physics win ${((w / N) * 100).toFixed(0)}% (${(s[0] / N).toFixed(1)}-${(s[1] / N).toFixed(1)})   quick-sim win ${((qw / N) * 100).toFixed(0)}% (${(qs[0] / N).toFixed(1)}-${(qs[1] / N).toFixed(1)})`);
    return { w: w / N, qw: qw / N };
  };
  line(3, 3);
  const r15 = line(1, 5);
  line(1, 3);
  line(2, 4);
  ok(r15.w > 0.55 && r15.w < 0.97, 'Citadel beats Ruins most nights, not every night');
  ok(r15.qw > 0.5 && r15.qw < 0.97, 'quick sim agrees on the Citadel edge');
}

// ---- 4. dynasty: three full years
{
  const L = RF.newLeague(2026, 47);
  const seasons = QUICK ? 2 : 3;
  const counts = () => [1, 2, 3, 4, 5].map((d) => L.teams.filter((t) => t.d === d).length).join(',');
  ok(counts() === '8,9,19,8,6', 'district sizes 8,9,19,8,6');
  for (let y = 0; y < seasons; y++) {
    let guard = 0;
    while (L.phase === 'season' && guard++ < 20) RF.advanceWeek(L, null, null);
    ok(L.phase === 'playoffs', 'season reaches playoffs');
    ok(L.teams.reduce((s, t) => s + t.w, 0) === 25 * 16, 'every game recorded');
    while (L.phase === 'playoffs' && guard++ < 40) RF.advancePlayoffs(L, null, null);
    ok(L.phase === 'summary', 'playoffs end in a summary');
    ok(L.po.champ >= 0, 'a champion is crowned');
    ok(counts() === '8,9,19,8,6', 'district sizes hold after movement (' + counts() + ')');
    const moves = L.summary.moves;
    RF.continueOffseason(L);
    ok(L.phase === 'draft' && L.draft.cls.length === 60, 'draft class of 60');
    const lotD = L.draft.lot.map((id) => L.teams[id].d);
    const onClock = RF.draftAI(L, true);
    ok(onClock && L.draft.order[L.draft.pick] === L.user, 'draft pauses on the user pick');
    const best = L.draft.cls[0];
    const sc = L.P[best].sc;
    ok(sc && sc.ol <= L.P[best].o && sc.oh >= L.P[best].o, 'scouting range brackets the true rating');
    ok(RF.draftPick(L, best), 'user can draft');
    RF.finishDraft(L);
    ok(L.phase === 'fa' && L.fa.pool.length > 0, 'free agency opens with a pool');
    let signed = 0;
    for (const id of L.fa.pool.slice().sort((a, b) => L.P[b].o - L.P[a].o)) { const r = RF.signFA(L, id); if (r.ok) signed++; if (signed >= 2) break; }
    const notes = RF.finishFA(L);
    ok(L.phase === 'season' && L.week === 0, 'new season starts');
    for (const t of L.teams) {
      if (t.id === L.user) ok(t.ro.length >= 13 && t.ro.length <= 18, 'user roster 13-18 (' + t.ro.length + ')');
      else ok(t.ro.length === 18, 'AI roster is 18 (' + TEAMS(t.id) + ' ' + t.ro.length + ')');
      for (const id of t.ro) ok(L.P[id] && L.P[id].tm === t.id, 'roster ids resolve');
    }
    const ids = new Set(); let dup = 0;
    for (const t of L.teams) for (const id of t.ro) { if (ids.has(id)) dup++; ids.add(id); }
    ok(dup === 0, 'no player on two rosters');
    console.log(`year ${L.year - 1}: champ ${RF.TEAMS[L.hist[L.hist.length - 1].champ].city}, moves ${moves.length}, lottery districts ${lotD.join('/')}, user signed ${signed}, notes ${notes.length}, players ${Object.keys(L.P).length}`);
  }
  const titles = L.teams.reduce((s, t) => s + t.titles, 0);
  ok(titles === seasons, 'one title per year');
  const s = RF.serialize(L);
  const L2 = RF.deserialize(s);
  ok(RF.serialize(L2) === s, 'save round-trips');
  console.log(`save size ${(s.length / 1024).toFixed(0)} KB`);
  ok(s.length < 1.5e6, 'save under 1.5 MB');
  function TEAMS(i) { return RF.TEAMS[i].ab; }
}

// ---- 5. uprising and the wall
{
  const L = RF.newLeague(9, 49);
  ok(L.teams[49].d === 5, 'Port Moresby starts in the Ruins');
  let guard = 0;
  while (L.phase === 'season' && guard++ < 20) RF.advanceWeek(L, [99, 1], null); // the user wins every game
  ok(L.wall, 'a perfect Ruins season brings the wall down');
  console.log(`uprising ${L.upr}, stage ${RF.STAGES[L.stage].n}, story beats queued ${L.story.length}, wall ${L.wall}`);
  ok(L.story.length >= 1, 'uprising stages queue story text');
  ok(RF.refOf(L, 1) < RF.DISTRICTS[1].ref, 'after the wall falls the Citadel loses most of its ref favor');
}

// ---- 6. v1 migration
{
  const v1 = { team: 'Detroit Foundry Dogs', year: 3, week: 5, record: { w: 4, l: 1 }, pf: 150, pa: 120, seed: 77 };
  const L = RF.migrateV1(v1);
  ok(L && L.v === 2, 'v1 save migrates');
  ok(L && L.user === RF.TEAMS.findIndex((t) => t.city === 'Detroit'), 'v1 team kept');
  ok(L && L.week === 5 && L.teams[L.user].w === 4 && L.teams[L.user].l === 1 && L.year === 3, 'v1 week/record/year kept');
  ok(RF.migrateV1({ team: 'Atlantis' }) === null, 'unknown v1 team is rejected');
  ok(RF.migrateV1({ teamId: 12, week: 0 }).user === 12, 'numeric v1 team id');
}

// ---- 7. a human-controlled match does not break with random input
{
  const m = RF.createMatch({ ...mk(L0, 45, 0, 60, 3), human: 0 });
  const r = RF.mulberry(5);
  let n = 0;
  while (m.state !== 'final' && n++ < 60 * 60 * 20) {
    m.inp.mx = Math.sin(n / 50) ; m.inp.my = Math.cos(n / 70);
    if (r() < 0.02) m.inp.shoot = true;
    if (r() < 0.02) m.inp.thr = true;
    if (r() < 0.01) m.inp.kick = true;
    if (r() < 0.01) m.inp.chk = true;
    if (r() < 0.005) m.inp.sw = true;
    RF.step(m, RF.DT); m.ev.length = 0;
    if (!Number.isFinite(m.ball.x)) break;
  }
  ok(m.state === 'final', 'human match with random input finishes');
  ok(Number.isFinite(m.ball.x), 'no NaN with human input');
  console.log(`human random-input match: ${m.score.join('-')} in ${(n / 60).toFixed(0)}s, pulses ${m.stats.pulses}`);
}

console.log(`\n${fails ? fails + ' FAILED' : 'ALL PASSED'} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(fails ? 1 : 0);
