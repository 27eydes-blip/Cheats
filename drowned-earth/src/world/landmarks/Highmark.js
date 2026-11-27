import * as THREE from 'three';
import { RNG, fbm2 } from '../../core/rng.js';
import { G } from '../WorldShader.js';

// Highmark, seen from the drowned district: the last dry land on Earth.
// Lives in the far layer: terraced green slopes, white towers, a ring wall,
// a lighthouse whose beam sweeps the sea, city lights and patrol lights at night.
export class Highmark {
  constructor(ctx, def) {
    this.ctx = ctx;
    const [px, pz] = def.pos;
    this.group = new THREE.Group();
    this.group.name = 'Highmark';
    this.group.position.set(px, 0, pz);
    const rng = new RNG(4242);
    // island heightfield with terraces
    const R = 3600, seg = 110;
    const g = new THREE.PlaneGeometry(R * 2, R * 2, seg, seg);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const r = Math.hypot(x * 1.0, z * 1.35) / R;
      const n = fbm2(x * 0.0012, z * 0.0012, 7, 4);
      let h = Math.max(0, 1 - r) ** 1.5 * 980 * (0.75 + n * 0.5) - 25;
      const ridge = Math.max(0, 1 - Math.hypot(x + 900, z - 300) / 1400) ** 2 * 380;
      h += ridge;
      const terr = h > 20 && h < 520;
      if (terr) { const step = 22; const q = Math.floor(h / step) * step; h = q + Math.min(1, (h - q) / step * 3.5) * step * 0.25; }
      p.setY(i, h);
      if (h < 4) c.setRGB(0.35, 0.33, 0.28);
      else if (terr) c.setRGB(0.18 + n * 0.1, 0.32 + n * 0.12, 0.14);
      else if (h < 650) c.setRGB(0.36, 0.38, 0.3);
      else c.setRGB(0.5, 0.5, 0.48);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.heightAt = (x, z) => {
      const r = Math.hypot(x, z * 1.35) / R;
      const n = fbm2(x * 0.0012, z * 0.0012, 7, 4);
      return Math.max(0, 1 - r) ** 1.5 * 980 * (0.75 + n * 0.5) - 25 + Math.max(0, 1 - Math.hypot(x + 900, z - 300) / 1400) ** 2 * 380;
    };
    const island = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    this.group.add(island);
    // white towers: terraced city on the upper south slope + crown
    const tg = new THREE.BoxGeometry(1, 1, 1); tg.translate(0, 0.5, 0);
    const towers = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.6, metalness: 0.05 }), 340);
    const m = new THREE.Matrix4();
    const lightPos = [];
    for (let i = 0; i < 340; i++) {
      const crown = i < 60;
      const a = crown ? rng.range(0, Math.PI * 2) : rng.range(Math.PI * 0.15, Math.PI * 0.85);
      const rr = crown ? rng.range(0, 500) : rng.range(500, 2100);
      const x = Math.cos(a) * rr * 1.1, z = Math.sin(a) * rr;
      const base = this.heightAt(x, z);
      if (base < 6) { m.makeScale(0, 0, 0); towers.setMatrixAt(i, m); continue; }
      const w = rng.range(30, 80), h = crown ? rng.range(90, 260) : rng.range(25, 110);
      m.compose(new THREE.Vector3(x, base - 5, z), new THREE.Quaternion(), new THREE.Vector3(w, h, w * rng.range(0.6, 1.2)));
      towers.setMatrixAt(i, m);
      for (let k = 0; k < (crown ? 6 : 3); k++) lightPos.push(x + rng.range(-w / 2, w / 2), base + rng.range(5, h), z + w * 0.5);
    }
    this.group.add(towers);
    // ring wall at the waterline
    const wallG = new THREE.BoxGeometry(1, 1, 1); wallG.translate(0, 0.5, 0);
    const walls = new THREE.InstancedMesh(wallG, new THREE.MeshStandardMaterial({ color: 0xbdb8ac, roughness: 0.8 }), 72);
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const rx = Math.cos(a) * R * 0.86, rz = Math.sin(a) * R * 0.86 / 1.35;
      m.compose(new THREE.Vector3(rx, -2, rz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2), new THREE.Vector3(300, 45, 18));
      walls.setMatrixAt(i, m);
      lightPos.push(rx, 46, rz);
    }
    this.group.add(walls);
    // lighthouse on the southern promontory (toward the district)
    const lh = new THREE.Group();
    const lhx = 300, lhz = R * 0.86 / 1.35 + 80;
    lh.position.set(lhx, 0, lhz);
    const towerM = new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.5 });
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(22, 34, 190, 16), towerM); t1.position.y = 95;
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 12, 16), new THREE.MeshStandardMaterial({ color: 0x2a2f33 })); t2.position.y = 196;
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff6dd, fog: false }));
    this.lamp.position.y = 210;
    lh.add(t1, t2, this.lamp);
    // the beam: two long cones back to back
    this.beam = new THREE.Group();
    this.beam.position.y = 210;
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uI: { value: 1 } },
      vertexShader: 'varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = uv.y; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform float uI; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float a = edge * pow(vT, 1.4) * 0.22 * uI; gl_FragColor = vec4(vec3(1.0,0.95,0.82)*a, a); }',
    });
    this.beamMat = beamMat;
    for (const s of [1, -1]) {
      const cg = new THREE.ConeGeometry(260, 9000, 20, 1, true);
      cg.translate(0, -4500, 0);
      const cone = new THREE.Mesh(cg, beamMat);
      cone.rotation.z = s * Math.PI / 2 - s * 0.012;
      cone.frustumCulled = false;
      this.beam.add(cone);
    }
    lh.add(this.beam);
    this.group.add(lh);
    this.lighthouseWorld = new THREE.Vector3(px + lhx, 210, pz + lhz);
    // night lights
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lightPos, 3));
    this.lightsMat = new THREE.PointsMaterial({ color: 0xffd9a0, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.group.add(new THREE.Points(lg, this.lightsMat));
    // patrol lights on the sea lanes
    const pg = new THREE.BufferGeometry();
    this.patrols = Array.from({ length: 5 }, (_, i) => ({ a: i * 1.3, r: R * 0.95 + i * 260, s: 0.004 + i * 0.0013 }));
    pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(this.patrols.length * 3), 3));
    this.patrolMat = new THREE.PointsMaterial({ color: 0xff4030, size: 3, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.patrolPts = new THREE.Points(pg, this.patrolMat);
    this.patrolPts.frustumCulled = false;
    this.group.add(this.patrolPts);
    ctx.farScene.add(this.group);
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const night = G.uNight.value;
    const fogK = Math.exp(-((this.ctx.atmosphere.farFog.density * 13500) ** 2));
    this.beam.rotation.y = this.t * 0.42;
    this.beamMat.uniforms.uI.value = (0.12 + night * 1.2) * fogK * (1 + this.ctx.weather.cur.fog * 30);
    this.lamp.material.color.setScalar(0.4 + night * 3);
    this.lightsMat.opacity = Math.min(1, night * 1.3) * fogK;
    this.patrolMat.opacity = night * fogK;
    const pos = this.patrolPts.geometry.attributes.position;
    this.patrols.forEach((p, i) => { p.a += p.s * dt; pos.setXYZ(i, Math.cos(p.a) * p.r, 4, Math.sin(p.a) * p.r / 1.3); });
    pos.needsUpdate = true;
  }
}
