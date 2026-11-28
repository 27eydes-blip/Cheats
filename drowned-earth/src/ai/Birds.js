import * as THREE from 'three';
import { prepGeometry } from '../world/Builder.js';
import { mat } from '../world/Materials.js';

// Gulls circling the towers, some perched on roof edges. They fall silent and
// settle when something happens below (event 'gulls:silence').
export class Birds {
  constructor(ctx) {
    this.ctx = ctx;
    this.roosts = new Map();
    ctx.events.on('roost', (r) => { if (!this.roosts.has(r.id)) this.roosts.set(r.id, r); });
    ctx.events.on('gulls:silence', () => { this.silence = 40; ctx.audio && (ctx.audio.gullSilence = 40); });
    const g = new THREE.BufferGeometry();
    // body + two wings (wings tagged by x sign for flapping in the vertex shader)
    const v = [0, 0, -0.25, 0.05, 0, 0.2, -0.05, 0, 0.2, 0, 0, -0.05, 0.55, 0.02, 0.05, 0, 0, 0.12, 0, 0, -0.05, 0, 0, 0.12, -0.55, 0.02, 0.05];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    prepGeometry(g, [0.85, 0.85, 0.82]);
    const m = mat('plastic').clone();
    m.side = THREE.DoubleSide;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uT = this.uT = { value: 0 };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = uT * 9.0 + float(gl_InstanceID) * 1.7;
          float flap = sin(ph) * (instanceColor.r > 0.5 ? 1.0 : 0.15);
          transformed.y += abs(transformed.x) * flap * 0.9;`);
    };
    m.customProgramCacheKey = () => 'gull';
    this.n = ctx.settings.q.birdCount;
    this.mesh = new THREE.InstancedMesh(g, m, this.n);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.n * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.scale.setScalar(1);
    ctx.scene.add(this.mesh);
    this.birds = Array.from({ length: this.n }, (_, i) => ({ a: Math.random() * 6.28, r: 15 + Math.random() * 30, h: 10 + Math.random() * 20, s: 0.25 + Math.random() * 0.2, roost: null, perched: i % 4 === 0, pos: new THREE.Vector3(), off: Math.random() * 100 }));
    this.silence = 0;
    this.t = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this.companionSetup();
  }
  // The boat gull: share fish once and it rides your bow. It leaves near the Deep.
  companionSetup() {
    const c = this.ctx;
    this.comp = { on: !!c.state.flags.gull_friend, away: false, pos: new THREE.Vector3(), mood: 1 };
    c.interact.add({ id: 'gull:feed', kind: 'gull', mode: 'boat', radius: 6, requireLook: true,   // only when you look at it, so E still gets you off the boat
      pos: (v) => v.set(c.boat.pos.x - Math.sin(c.boat.heading) * 2.4, 1.2, c.boat.pos.z - Math.cos(c.boat.heading) * 2.4),
      enabled: (cc) => !cc.state.flags.gull_friend && cc.time.out.night < 0.5 && (cc.inventory.has('canned_fish') || cc.inventory.has('kelp')) && cc.state.playTime > 120,
      prompt: 'A gull with a bent wing is watching you eat. Share some',
      onUse: (cc) => { cc.inventory.remove(cc.inventory.has('canned_fish') ? 'canned_fish' : 'kelp'); cc.state.flags.gull_friend = true; this.comp.on = true; cc.ui.whisper('The gull eats, then settles on your bow like it owns it. You decide to call it Captain.'); } });
  }
  updateCompanion(dt) {
    const c = this.ctx, k = this.comp; if (!k?.on) return;
    const nearDeep = Math.hypot(c.boat.pos.x - 96, c.boat.pos.z + 128) < 90 || c.state.glow > 0.7;
    if (nearDeep && !k.away) { k.away = true; c.ui.whisper('Captain lifts off the bow and flies hard for the towers. Animals don\'t stay near the Deep.'); }
    if (!nearDeep && k.away) { k.away = false; }
    const bow = new THREE.Vector3(0, 0.95, -2.35).applyMatrix4(c.boat.group.matrixWorld);
    if (k.away) bow.add(new THREE.Vector3(-120, 40, 60));
    k.pos.lerp(bow, Math.min(1, dt * (k.away ? 0.4 : 3)));
  }
  randomBirdPos() { const b = this.birds[Math.floor(Math.random() * this.n)]; return b && b.roost ? b.pos.clone() : null; }
  update(dt) {
    this.t += dt;
    if (this.uT) this.uT.value = this.t;
    this.silence = Math.max(0, this.silence - dt);
    const cam = this.ctx.camera.position;
    const roosts = [...this.roosts.values()].filter((r) => Math.hypot(r.x - cam.x, r.z - cam.z) < 260);
    const night = this.ctx.time.out.night > 0.6;
    const col = new THREE.Color();
    this.updateCompanion(dt);
    this.birds.forEach((b, i) => {
      if (i === 0 && this.comp?.on) { const perched = !this.comp.away && this.comp.pos.distanceTo(this.ctx.boat.pos) < 4; this._e.set(0, this.ctx.boat.heading, 0); this.mesh.setColorAt(i, new THREE.Color(perched ? 0 : 1, 0, 0)); this._m.compose(this.comp.pos, this._q.setFromEuler(this._e), new THREE.Vector3(1.1, 1.1, 1.1)); this.mesh.setMatrixAt(i, this._m); return; }
      if (!b.roost || !roosts.includes(b.roost)) b.roost = roosts.length ? roosts[(i * 7) % roosts.length] : null;
      if (!b.roost) { this._m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this._m); return; }
      const sit = b.perched || night || this.silence > 0 || this.ctx.weather.cur.rain > 0.6;
      if (sit) {
        const a = b.off;
        b.pos.set(b.roost.x + Math.cos(a) * 6, b.roost.y + 0.1, b.roost.z + Math.sin(a) * 6);
        this._e.set(0, a + Math.sin(this.t * 0.3 + b.off) * 0.3, 0);
        col.setRGB(0, 0, 0);
      } else {
        b.a += dt * b.s;
        const wob = Math.sin(this.t * 0.4 + b.off) * 6;
        b.pos.set(b.roost.x + Math.cos(b.a) * (b.r + wob), b.roost.y + b.h + Math.sin(this.t * 0.7 + b.off) * 3, b.roost.z + Math.sin(b.a) * (b.r + wob));
        this._e.set(0, -b.a, Math.sin(this.t + b.off) * 0.3);
        col.setRGB(1, 0, 0);
      }
      this.mesh.setColorAt(i, col);
      this._m.compose(b.pos, this._q.setFromEuler(this._e), new THREE.Vector3(1.3, 1.3, 1.3));
      this.mesh.setMatrixAt(i, this._m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
