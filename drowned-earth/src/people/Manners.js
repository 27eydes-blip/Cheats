// How a raft NPC behaves around people and the world, on top of their daily schedule. Every NPC gets one.
//   - eyes: looks at you when you're close, then glances politely away and back (shy people sooner,
//     warm people hold it longer); looks at whoever they're talking with; looks up at thunder
//   - mood in the body: wary/stressed people fold their arms, tired ones slouch, cheerful ones laugh more
//   - greetings that fit the person and the hour, and remember you: "Back again?" the second time today
//   - pair and group talk: the two face each other, the listener nods, a joke gets a laugh, bystanders turn
//   - the world: they hunch and head for cover in hard rain, cover their ears at gunfire close by, and the
//     curious drift over to look at something unusual (a hard boat crash, a fight) and then go back
//   - personality: hard workers sweep or mend when they'd otherwise stand idle
// Cheap: plain arithmetic per visible NPC, events bound once, one greeting at a time across the town.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
let bound = null;   // { ctx, flash, bangs: [{pos, t}], odd: [{pos, t, what}] }
function bind(ctx) {
  if (bound?.ctx === ctx) return bound;
  bound = { ctx, flash: -99, bangs: [], odd: [], lastGreet: -99, now: 0 };
  const B = bound;
  ctx.events.on('lightning', (e) => { if ((e?.dist ?? 0) < 2500) B.flash = B.now; });
  ctx.events.on('weapon:fire', (e) => B.bangs.push({ pos: (e?.pos || ctx.player.position).clone(), t: B.now }));
  ctx.events.on('noise', (e) => { if ((e?.level ?? 0.7) > 0.85) B.bangs.push({ pos: (e?.pos || ctx.player.position).clone(), t: B.now }); });
  ctx.events.on('boat:impact', (e) => { if ((e?.speed ?? 0) > 3 && !e?.scrape) B.odd.push({ pos: ctx.boat.pos.clone(), t: B.now, what: 'crash' }); });
  ctx.events.on('people:incident', (e) => { if (e?.pos) B.odd.push({ pos: e.pos.clone?.() || new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z), t: B.now, what: 'incident' }); });
  return B;
}

const GREET = {
  morning: ['Morning.', 'Up with the gulls, are you.', 'Tide\'s kind this morning.', 'Morning. Kettle\'s still warm, if you\'re quick.'],
  day: ['Afternoon.', 'Hot one.', 'Mind the planks there.', 'Day to you.'],
  evening: ['Evening.', 'Lamps are going on.', 'Evening. Long day?', 'Getting dark out on the water.'],
  night: ['You\'re up late.', 'Can\'t sleep either?', 'Quiet. Keep it that way.', 'Late to be wandering.'],
  again: ['Back again?', 'You again. Twice in a day.', 'Forget something?', 'Can\'t keep away, can you.'],
  regular: ['There\'s our regular.', 'Thought I\'d see you.', 'Same as ever, then.'],
  cold: ['Mm.', 'What.', 'Keep moving.', '...'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Manners {
  constructor(npc) {
    this.npc = npc; this.B = bind(npc.ctx);
    let s = 0; for (const c of npc.def.id) s = (s * 31 + c.charCodeAt(0)) >>> 0;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // traits from the living-NPC data when there is one, otherwise seeded from the id
    const a = npc.ctx.society?.agents?.get(npc.def.id);
    this.tr = { warmth: a?.traits?.warmth ?? r(), talk: a?.traits?.talk ?? r(), curiosity: a?.traits?.curiosity ?? r(), industry: a?.traits?.industry ?? r(), courage: a?.traits?.courage ?? r() };
    this.agent = a;
    this.eyeT = 0; this.away = 0; this.awayDir = new THREE.Vector3(); this.wasFar = true; this.farT = 999;
    this.look = new THREE.Vector3(); this.lookOn = false;
    this.layer = null; this.goal = null; this.oddSeen = 0; this.chat = null;
  }
  mood() { return this.agent && this.npc.ctx.society?.moodOf ? this.npc.ctx.society.moodOf(this.agent) : this.tr.warmth > 0.5 ? 'cheerful' : 'wary'; }
  // returns nothing; sets this.lookOn/this.look (world), this.layer (gesture), this.goal (raft-local point or null)
  update(dt) {
    const n = this.npc, c = n.ctx, B = this.B;
    // one shared clock, advanced once per frame however many NPCs update; old events are dropped
    if (B.frame !== c.game?.frame) { B.frame = c.game?.frame; B.now += dt; if (B.bangs.length > 8 || B.odd.length > 8) { B.bangs = B.bangs.filter((b) => B.now - b.t < 3); B.odd = B.odd.filter((o) => B.now - o.t < 20); } }
    const me = n.worldPos(_v), pp = c.player.position, dP = me.distanceTo(pp);
    this.layer = null; this.lookOn = false;
    const t = performance.now() / 1000;
    // --- talking with someone: face them, the listener nods, a joke lands with a laugh
    if (this.chat && t < this.chat.until) {
      const o = this.chat.with.worldPos(_w);
      this.look.copy(o).setY(o.y + 1.55); this.lookOn = true;
      const speaking = t >= this.chat.speakFrom && t < this.chat.speakTo;
      if (!speaking) this.layer = this.chat.laughAt && t > this.chat.laughAt && t < this.chat.laughAt + 1.6 ? 'laugh' : 'nod';
      n.chatFace = Math.atan2(o.x - me.x, o.z - me.z);
    } else { this.chat = null; n.chatFace = null; }
    // --- thunder: everyone glances up for a moment
    if (B.now - B.flash < 1.8 && B.now - B.flash > 0.5) { this.look.copy(me).add(_w.set(Math.sin(n.heading) * 4, 9, Math.cos(n.heading) * 4)); this.lookOn = true; }
    // --- a gunshot or a bang close by: hands to the ears, look toward it
    const bang = B.bangs.find((b) => B.now - b.t < 1.4 && b.pos.distanceTo(me) < 22);
    if (bang) { this.layer = 'ears'; this.look.copy(bang.pos); this.lookOn = true; }
    // --- something unusual nearby: the curious go and look, then drift back
    const odd = B.odd.find((o) => B.now - o.t < 14 && o.pos.distanceTo(me) < 24);
    if (odd && this.tr.curiosity > 0.35 && !n.fleeing) {
      if (this.oddSeen !== odd.t) { this.oddSeen = odd.t; }
      const l = n.raft.root.worldToLocal(_w.copy(odd.pos));
      const dx = l.x - n.local.x, dz = l.z - n.local.z, d = Math.hypot(dx, dz);
      this.goal = d > 3 ? new THREE.Vector3(n.local.x + dx / d * (d - 2.5), 0, n.local.z + dz / d * (d - 2.5)) : null;
      this.look.copy(odd.pos).setY(odd.pos.y + 0.5); this.lookOn = true;
      if (!this.layer && this.tr.courage < 0.4) this.layer = 'crossed';
    } else this.goal = null;
    // --- hard rain: hunch, and head for the nearest doorway or bed if they're idling outdoors
    const rain = c.weather?.cur?.rain ?? 0;
    if (rain > 0.55 && !this.goal && /idle|watch|sell|trade|festival|sit/.test(n.activity || '')) {
      const cover = n.raft.info?.spots?.filter((s) => s.kind === 'door' || s.kind === 'bed') || [];
      let best = null, bd = 1e9; for (const s of cover) { const d = Math.hypot(s.x - n.local.x, s.z - n.local.z); if (d < bd) { bd = d; best = s; } }
      if (best && bd > 0.8) this.goal = new THREE.Vector3(best.x, 0, best.z);
      if (!this.layer) this.layer = 'crossed';
    }
    // --- you, up close: eye contact with a polite glance away now and then
    if (dP < 6 && !this.chat && !bang && n.activity !== 'sleep') {
      this.eyeT += dt;
      const hold = 1.4 + this.tr.warmth * 3;
      if (this.away > 0) {
        this.away -= dt;
        this.look.copy(me).add(this.awayDir); this.lookOn = true;
      } else if (this.eyeT > hold) {
        this.eyeT = 0; this.away = 0.7 + Math.random() * 1.4 * (1.2 - this.tr.warmth);
        // shy people look down, others off to the side
        const side = Math.random() < 0.5 ? -1 : 1, h = n.heading + side * (0.7 + Math.random() * 0.6);
        this.awayDir.set(Math.sin(h) * 3, this.tr.warmth < 0.35 ? 0.4 : 1.4, Math.cos(h) * 3);
      } else if (!this.lookOn) { this.look.copy(c.camera.position); this.lookOn = true; }
      this.greet(dP);
    } else { this.eyeT = 0; this.away = 0; }
    // --- you've been away a while: a greeting is due next time you come close
    if (dP > 9) { this.farT += dt; if (this.farT > 45) this.wasFar = true; } else this.farT = 0;
    // --- mood shows in the body when nothing else is going on
    if (!this.layer && !this.chat && /idle|watch|sell|trade|festival/.test(n.activity || '') && !this.goal) {
      const m = this.mood();
      if (m === 'wary' || m === 'stressed' || m === 'grieving') this.layer = 'crossed';
      else if (m === 'tired' || m === 'drunk') this.layer = 'lean';
    }
  }
  // a greeting that fits the person and the hour; remembered per day
  greet(dP) {
    const n = this.npc, c = n.ctx, B = this.B;
    if (!this.wasFar || dP > 4 || c.ui.panel || n.talkT > 0) return;
    this.wasFar = false;
    if (B.now - B.lastGreet < 6) return;
    const chance = 0.35 + this.tr.warmth * 0.4 + this.tr.talk * 0.25;
    if (Math.random() > chance) return;
    const day = Math.floor((c.time.day ?? 0));
    const mem = ((c.state.greets ||= {})[n.def.id] ||= { day: -1, n: 0, total: 0 });
    if (mem.day !== day) { mem.day = day; mem.n = 0; }
    mem.n++; mem.total++;
    const h = c.time.hour;
    let line;
    if (this.tr.warmth < 0.25 && Math.random() < 0.6) line = pick(GREET.cold);
    else if (mem.n >= 2) line = pick(GREET.again);
    else if (mem.total >= 6 && Math.random() < 0.5) line = pick(GREET.regular);
    else line = pick(h >= 5 && h < 11 ? GREET.morning : h < 17 ? GREET.day : h < 21.5 ? GREET.evening : GREET.night);
    if (this.agent && c.society?.voice) line = c.society.voice(this.agent, line);
    B.lastGreet = B.now;
    c.ui.subtitle(`${n.def.name}: ${line}`, 2.6, 'speech');
    c.audio?.speak?.(n.worldPos(_w), 1.4, 1, n.rig?.p && n.voicePitch ? n.voicePitch(n.rig.p) : undefined);
    n.talkT = 1.6;
    n.rig?.human?.face?.say?.(line, 1.6);
  }
}
// start a two-person conversation: A speaks first, then B answers; joke topics get a laugh from the listener
export function startChat(x, y, topic) {
  if (!x.manners || !y.manners) return;
  const t = performance.now() / 1000;
  x.manners.chat = { with: y, until: t + 7.4, speakFrom: t, speakTo: t + 3.5, laughAt: null };
  y.manners.chat = { with: x, until: t + 7.4, speakFrom: t + 3.6, speakTo: t + 7.2, laughAt: topic === 'joke' ? t + 2.8 : null };
  if (topic === 'joke') x.manners.chat.laughAt = t + 6.6;
  x.chatTalk = [t, t + 3.5]; y.chatTalk = [t + 3.6, t + 7.2];
}
