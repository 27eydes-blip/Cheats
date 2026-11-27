import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prepGeometry, boxGeometry } from '../world/Builder.js';
import { mat } from '../world/Materials.js';

// Tide Warden patrol boat. Runs a route around the district at night with a
// red running light and a sweeping searchlight. Stage 1: it only watches.
const ROUTE = [[-620, 600], [620, 600], [640, -40], [600, -620], [-600, -640], [-640, 60]];

export class Patrol {
  constructor(ctx) {
    this.ctx = ctx;
    const parts = [];
    const add = (g, c, x, y, z) => { g.translate(x, y, z); parts.push(prepGeometry(g, c)); };
    add(boxGeometry(3, 1.6, 10), [0.32, 0.34, 0.36], 0, 0.3, 0);
    add(boxGeometry(2.2, 1.6, 3.5), [0.45, 0.47, 0.5], 0, 1.9, 0.8);
    add(boxGeometry(0.12, 2.5, 0.12), [0.3, 0.3, 0.3], 0, 3.6, 1.5);
    add(boxGeometry(3.1, 0.25, 10.1), [0.85, 0.85, 0.82], 0, 1.0, 0);
    this.group = new THREE.Group();
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat('metal'));
    mesh.castShadow = true;
    this.group.add(mesh);
    this.red = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    this.red.position.set(0, 4.9, 1.5);
    this.group.add(this.red);
    this.spot = new THREE.SpotLight(0xe8f2ff, 0, 160, 0.13, 0.4, 1.0);
    this.spot.position.set(0, 3.2, -1.2);
    this.spot.layers.enableAll();
    this.spotTarget = new THREE.Object3D();
    this.spot.target = this.spotTarget;
    this.group.add(this.spot);
    // visible beam cone
    const cg = new THREE.ConeGeometry(9, 70, 16, 1, true); cg.translate(0, -35, 0); cg.rotateX(-Math.PI / 2);
    this.beam = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }));
    this.beam.layers.set(2);
    this.group.add(this.beam);
    ctx.scene.add(this.group, this.spotTarget);
    this.seg = 0; this.u = 0; this.speed = 7;
    this.active = false;
    this.sweep = 0;
    this.seen = 0;
    this.pos = new THREE.Vector3(...[ROUTE[0][0], 0, ROUTE[0][1]]);
    this.emitter = null;
  }
  update(dt) {
    const { time, waves, player, ui } = this.ctx;
    const h = time.hour;
    const want = h >= 21 || h < 4.5 || this.ctx.params.has('patrol');
    this.group.visible = want;
    if (!want) { this.spot.intensity = 0; return; }
    const a = ROUTE[this.seg], b = ROUTE[(this.seg + 1) % ROUTE.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    this.u += (this.speed * dt) / len;
    if (this.u >= 1) { this.u = 0; this.seg = (this.seg + 1) % ROUTE.length; }
    const x = a[0] + (b[0] - a[0]) * this.u, z = a[1] + (b[1] - a[1]) * this.u;
    this.pos.set(x, waves.height(x, z) - 0.1, z);
    this.group.position.copy(this.pos);
    const heading = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
    this.group.rotation.set(Math.sin(waves.time * 0.8) * 0.02, heading, Math.sin(waves.time * 0.6) * 0.03);
    this.sweep += dt * 0.35;
    const sa = Math.sin(this.sweep) * 1.1;
    const dir = new THREE.Vector3(Math.sin(sa), -0.12, -Math.cos(sa)).applyEuler(this.group.rotation);
    this.spotTarget.position.copy(this.spot.getWorldPosition(new THREE.Vector3())).addScaledVector(dir, 40);
    this.spotTarget.updateMatrixWorld();
    this.spot.intensity = 900;
    this.beam.rotation.set(-0.12, sa, 0);
    this.beam.position.copy(this.spot.position);
    this.beam.material.opacity = 0.05 + this.ctx.weather.cur.fog * 6 + this.ctx.weather.cur.rain * 0.05;
    this.red.visible = Math.sin(waves.time * 3) > 0;
    // is the player in the beam?
    const sp = this.spot.getWorldPosition(new THREE.Vector3());
    const toP = player.eye.clone().sub(sp);
    const d = toP.length();
    if (d < 120 && toP.normalize().dot(dir.normalize()) > Math.cos(0.15) && this.ctx.collision.raycast(sp, toP, d) >= d - 1) {
      this.seen += dt;
      if (this.seen > 0.8 && !this.warned) { this.warned = true; ui.whisper('The searchlight finds you. It holds for a long moment. Then it moves on.'); this.ctx.story.setFlag('seen_by_wardens'); }
    } else { this.seen = 0; if (d > 200) this.warned = false; }
    if (!this.emitter && this.ctx.audio?.started) this.emitter = this.ctx.audio.addEmitter({ type: 'generator', pos: (v) => v.copy(this.pos) });
  }
}
