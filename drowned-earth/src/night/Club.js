import * as THREE from 'three';
import { Builder } from '../world/Builder.js';
import { hullGeometry } from '../vehicles/Hulls.js';
import { Person } from '../humans/Person.js';
import { generatePerson, personFor } from '../humans/Roster.js';
import { Band } from '../audio/Band.js';
import { LAYER_FX } from '../render/Pipeline.js';
import { runGame } from './BarGames.js';

// THE GENTLEMAN'S CLUB — "the Club", "the Gill" to regulars and smugglers.
// A masked cabaret in the air-filled saloon of a sunken ferry. Reached by a
// hatch at the foot of the drowned Cape Orrin lighthouse, signalled at night
// by lanternfish pulsing amber (three short, one long). Inside: velvet, brass,
// sea-view glass with lanternfish drifting past, caustic light on the walls,
// a long bar, booths, a curtained stage with dancers as silhouettes, a band,
// Madame Ondine. Door check, eavesdropping, favours, games, the vault, and
// the raid that floods the hull.
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const _v = new THREE.Vector3();

export class Club {
  constructor(ctx) {
    this.ctx = ctx;
    this.d = ctx.data.club;
    if (!this.d || ctx.params.get('club') === 'off') return;
    this.state = { inside: false, entered: false, favors: {}, raidDone: false, vaultOpen: false, heard: {} };
    this.t = 0;
    const L = this.d.lighthouse, F = this.d.ferry;
    this.lh = new THREE.Vector3(L.pos[0], 0, L.pos[1]);
    // the saloon sits inside the wreck; this is its local origin (deck level)
    this.origin = new THREE.Vector3(F.pos[0], -F.depth + 1.2, F.pos[1]);
    this.dry = { min: new THREE.Vector3(-15, -1.5, -5.5).add(this.origin), max: new THREE.Vector3(15, 5, 5.5).add(this.origin), water: -999 };
    this.installDryZone();
    this.buildLighthouse();
    this.buildWreck();
    this.buildSaloon();
    ctx.events.on('tick:minute', () => this.minute());
  }
  get open() { const h = this.ctx.time.hour, [a, b] = this.d.hours; return a < b ? h >= a && h < b : h >= a || h < b; }

  // inside the saloon the sea isn't — until the raid lets it in
  installDryZone() {
    const w = this.ctx.waves, orig = w.height.bind(w), z = this.dry;
    w.height = (x, zz, t) => {
      if (x > z.min.x && x < z.max.x && zz > z.min.z && zz < z.max.z && this.camOrPlayerInside()) return z.water;
      return orig(x, zz, t);
    };
  }
  camOrPlayerInside() { const p = this.ctx.player.position; const z = this.dry; return p.y > z.min.y - 2 && p.y < z.max.y && p.x > z.min.x && p.x < z.max.x && p.z > z.min.z && p.z < z.max.z; }

  // ---------------------------------------------------------------- the lighthouse
  buildLighthouse() {
    const g = new THREE.Group();
    // a tapering tower, white with a faded red band, broken off above the waterline
    const prof = []; for (let i = 0; i <= 20; i++) { const y = -14 + i * 1.4; prof.push(new THREE.Vector2(4.2 - i * 0.07, y)); }
    const tower = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), this.towerMat());
    tower.castShadow = true; g.add(tower);
    // jagged broken rim
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.85, 0.35, 6, 24), new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.9 })); rim.rotation.x = Math.PI / 2; rim.position.y = 14 - 14 + 0.1; rim.scale.z = 2; g.add(rim);
    // the hatch: a brass-ringed door at the base on the seaward side
    const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 20), new THREE.MeshStandardMaterial({ color: 0x9a7a3a, metalness: 0.85, roughness: 0.35 }));
    hatch.rotation.z = Math.PI / 2; hatch.position.set(4.05, -this.d.lighthouse.hatchDepth, 0); g.add(hatch);
    const fishM = new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false });
    const fish = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 12, Math.PI * 1.6), fishM); fish.position.set(4.13, -this.d.lighthouse.hatchDepth + 0.25, 0); fish.rotation.y = Math.PI / 2; g.add(fish);
    this.hatchPos = new THREE.Vector3(this.lh.x + 4.6, -this.d.lighthouse.hatchDepth, this.lh.z);
    g.position.copy(this.lh);
    this.ctx.scene.add(g);
    this.ctx.collision.addBox(this.lh.x - 3.2, -16, this.lh.z - 3.2, this.lh.x + 3.2, 0.4, this.lh.z + 3.2, 'concrete');
    // the amber signal: lanternfish circling the base, pulsing three short, one long
    const N = 160, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = Math.random() * 6.28, r = 5 + Math.random() * 7; pos.set([Math.cos(a) * r, -this.d.lighthouse.hatchDepth + (Math.random() - 0.5) * 5, Math.sin(a) * r], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.signalM = new THREE.PointsMaterial({ color: 0xffb347, size: 0.35, map: this.ctx.fx.soft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.signal = new THREE.Points(geo, this.signalM); this.signal.position.copy(this.lh); this.signal.layers.set(LAYER_FX); this.signal.frustumCulled = false;
    this.ctx.scene.add(this.signal);
    this.ctx.interact.add({ kind: 'club', mode: 'any', radius: 3, requireLook: false, pos: (v) => v.copy(this.hatchPos), prompt: () => this.hatchPrompt(), onUse: () => this.useHatch() });
  }
  towerMat() {
    const m = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.85 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vP = position;');
      sh.fragmentShader = 'varying vec3 vP;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float band = smoothstep(0.3, 0.0, abs(vP.y + 2.0) - 1.4);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.12, 0.1), band * 0.8);
        float wet = smoothstep(0.5, -1.0, vP.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.26, 0.2), wet * 0.7); // weed and silt below the tide line
        diffuseColor.rgb *= 0.8 + 0.25 * fract(sin(dot(floor(vP * 3.0), vec3(12.9, 78.2, 37.7))) * 43758.5);`);
    };
    return m;
  }
  hatchPrompt() {
    const st = this.ctx.story;
    if (!st.flag('lamp_map')) return 'A hatch, rusted shut. A brass fish worked into the wheel.';
    if (!this.open) return 'The hatch wheel won\'t turn. Whatever is below sleeps by day.';
    return st.flag('has_pin') ? 'Turn the wheel (the fish wears brass)' : 'The hatch wheel has a brass fish on it. Yours has none.';
  }
  useHatch() {
    const st = this.ctx.story, ui = this.ctx.ui;
    if (!st.flag('lamp_map') || !this.open) { ui.whisper('You put your hands on the wheel. It doesn\'t move. Somewhere far below, maybe, a trumpet.'); return; }
    if (!st.flag('has_pin')) { ui.whisper('A fish-shaped notch beside the wheel, empty. Something goes there.'); return; }
    ui.fade(1.4, () => this.enter());
  }

  // ---------------------------------------------------------------- the wreck outside
  buildWreck() {
    const F = this.d.ferry;
    const h = { length: 48, beam: 13, depth: 7, deadrise: 0.35, flare: 0.1, sheer: 0.15, transom: 0.85, bow: 0.6 };
    const hull = new THREE.Mesh(hullGeometry(h, { hull: [0.22, 0.26, 0.28], stripe: [0.6, 0.5, 0.25] }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    hull.rotation.y = F.heading; hull.rotation.z = 0.06;
    hull.position.set(F.pos[0], -F.depth + 2.5, F.pos[1]);
    this.ctx.scene.add(hull);
    this.wreck = hull;
    // a row of portholes that glow amber when the Club is open
    const pm = new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false });
    this.portholeM = pm;
    for (let i = 0; i < 14; i++) for (const sd of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12), pm);
      p.position.set(sd * 6.55, 1.2, -15 + i * 2.2); p.rotation.y = sd * Math.PI / 2;
      hull.add(p);
    }
  }

  // ---------------------------------------------------------------- the saloon
  buildSaloon() {
    const o = this.origin, F = this.d.ferry;
    const b = new Builder(new THREE.Vector3(), { shadows: false });
    const X0 = -14, X1 = 14, Z0 = -5, Z1 = 5, H = 3.6;
    // floor: dark parquet; walls: velvet; ceiling: pressed brass
    for (let i = 0; i < 56; i++) b.box(X0 + i * 0.5, -0.05, Z0, X0 + i * 0.5 + 0.49, 0, Z1, 'wood', { color: i % 2 ? [0.22, 0.12, 0.08] : [0.26, 0.15, 0.1], collide: false });
    b.collider(X0, -0.5, Z0, X1, 0, Z1, 'wood');
    b.box(X0, H, Z0, X1, H + 0.15, Z1, 'metal', { color: [0.5, 0.38, 0.18] });
    b.box(X0 - 0.2, 0, Z0 - 0.2, X0, H, Z1 + 0.2, 'fabric', { color: [0.32, 0.05, 0.07] });
    b.box(X1, 0, Z0 - 0.2, X1 + 0.2, H, Z1 + 0.2, 'fabric', { color: [0.32, 0.05, 0.07] });
    // the inboard wall (velvet) and the seaward wall: brass frames with glass
    b.box(X0, 0, Z0 - 0.2, X1, H, Z0, 'fabric', { color: [0.3, 0.05, 0.07] });
    b.box(X0, 0, Z1, X1, 0.9, Z1 + 0.2, 'fabric', { color: [0.3, 0.05, 0.07] });
    b.box(X0, H - 0.4, Z1, X1, H, Z1 + 0.2, 'metal', { color: [0.6, 0.45, 0.2] });
    for (let x = X0; x <= X1; x += 3.5) b.box(x - 0.08, 0.9, Z1, x + 0.08, H - 0.4, Z1 + 0.2, 'metal', { color: [0.6, 0.45, 0.2] });
    b.collider(X0, 0, Z1, X1, H, Z1 + 0.3);
    // wainscot: brass rail at hip height on the velvet
    b.box(X0, 1.0, Z0 + 0.0, X1, 1.06, Z0 + 0.06, 'metal', { color: [0.75, 0.58, 0.25], collide: false });
    // the long bar (inboard side), with a brass top
    b.box(-6, 0, Z0 + 0.9, 6, 1.05, Z0 + 1.5, 'wood', { color: [0.18, 0.08, 0.05] });
    b.box(-6.05, 1.05, Z0 + 0.82, 6.05, 1.12, Z0 + 1.58, 'metal', { color: [0.75, 0.58, 0.25], collide: false });
    for (const sh of [1.4, 1.9, 2.4]) b.box(-5.8, sh, Z0, 5.8, sh + 0.04, Z0 + 0.35, 'metal', { color: [0.6, 0.45, 0.2], collide: false });
    // booths along the glass: velvet banquettes and round tables
    this.booths = [];
    for (let i = 0; i < 4; i++) {
      const bx = -10 + i * 6.3, bz = Z1 - 1.3;
      b.box(bx - 1.3, 0, bz + 0.6, bx + 1.3, 0.45, bz + 1.1, 'fabric', { color: [0.45, 0.07, 0.1] });
      b.box(bx - 1.3, 0.45, bz + 0.95, bx + 1.3, 1.25, bz + 1.15, 'fabric', { color: [0.42, 0.06, 0.09], collide: false });
      b.box(bx - 0.05, 0, bz - 0.05, bx + 0.05, 0.74, bz + 0.05, 'metal', { color: [0.6, 0.45, 0.2] });
      b.box(bx - 0.55, 0.74, bz - 0.55, bx + 0.55, 0.78, bz + 0.55, 'wood', { color: [0.12, 0.05, 0.03], collide: false });
      this.booths.push(new THREE.Vector3(bx, 0, bz).add(o));
    }
    // the stage (port end), a riser and the curtain frame
    b.box(X0, 0, Z0, X0 + 4.2, 0.45, Z1, 'wood', { color: [0.16, 0.08, 0.05] });
    b.box(X0 + 4.2, 0, Z0, X0 + 4.4, H, Z0 + 0.6, 'metal', { color: [0.6, 0.45, 0.2] });
    b.box(X0 + 4.2, 0, Z1 - 0.6, X0 + 4.4, H, Z1, 'metal', { color: [0.6, 0.45, 0.2] });
    // the airlock door (starboard end) and the service tunnel door (beside the bar)
    b.box(X1 - 0.1, 0, -0.8, X1, 2.3, 0.8, 'metal', { color: [0.35, 0.33, 0.3], collide: false });
    b.box(6.6, 0, Z0 - 0.05, 8.0, 2.1, Z0 + 0.02, 'metal', { color: [0.28, 0.27, 0.26], collide: false });
    // Ondine's office door with a ship's-wheel handle (the vault is behind it)
    b.box(-12.8, 0, Z0 - 0.05, -11.6, 2.2, Z0 + 0.02, 'wood', { color: [0.2, 0.1, 0.06], collide: false });
    const mesh = b.build('club saloon');
    const grp = new THREE.Group(); grp.add(mesh); grp.position.copy(o); grp.rotation.y = 0;
    this.saloon = grp;
    for (const c of b.colliders) this.ctx.collision.addBox(c[0] + o.x, c[1] + o.y, c[2] + o.z, c[3] + o.x, c[4] + o.y, c[5] + o.z, c[6]);
    this.ctx.scene.add(grp);
    this.addCaustics(mesh);
    this.dressSaloon(grp, { X0, X1, Z0, Z1, H });
    this.addInteractions();
    grp.visible = false; // only drawn when you're near or inside
  }
  // caustic light rippling over everything in the room (the sea outside the glass)
  addCaustics(root) {
    this.cU = { uT: { value: 0 }, uK: { value: 1 } };
    root.traverse((m) => {
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat, i) => {
        const c = mat.clone();
        c.onBeforeCompile = (sh) => {
          mat.onBeforeCompile?.(sh);
          Object.assign(sh.uniforms, this.cU);
          sh.vertexShader = 'varying vec3 vCW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vCW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
          sh.fragmentShader = 'uniform float uT, uK; varying vec3 vCW;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            vec2 cp = vCW.xz * 0.9 + vCW.y * 0.3;
            float c1 = sin(cp.x * 3.1 + uT * 1.3) + sin(cp.y * 2.7 - uT * 1.1) + sin((cp.x + cp.y) * 2.2 + uT * 0.9);
            float caus = pow(max(0.0, 1.0 - abs(c1) * 0.6), 6.0);
            totalEmissiveRadiance += vec3(0.25, 0.55, 0.6) * caus * 0.12 * uK;`);
        };
        c.customProgramCacheKey = () => 'caustic' + (mat.customProgramCacheKey?.() || mat.type);
        if (Array.isArray(m.material)) m.material[i] = c; else m.material = c;
      });
    });
  }
  dressSaloon(grp, R) {
    const o = this.origin;
    // sea-view glass: a deep, moving dark with lanternfish drifting by
    const seaM = new THREE.ShaderMaterial({
      uniforms: { uT: this.cU.uT },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uT; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec3 deep = mix(vec3(0.004, 0.02, 0.03), vec3(0.02, 0.07, 0.08), vUv.y);
          float rays = pow(max(0.0, sin(vUv.x * 9.0 + uT * 0.2) * sin(vUv.x * 4.0 - uT * 0.13)), 4.0) * vUv.y * 0.08;
          vec3 c = deep + vec3(0.1, 0.25, 0.25) * rays;
          for (int i = 0; i < 18; i++) { float fi = float(i);
            vec2 fp = vec2(fract(h(vec2(fi, 1.0)) + uT * (0.004 + 0.006 * h(vec2(fi, 2.0)))), 0.15 + 0.7 * h(vec2(fi, 3.0)) + 0.03 * sin(uT * 0.7 + fi));
            float d = length((vUv - fp) * vec2(6.0, 1.0));
            c += vec3(0.4, 1.0, 0.85) * exp(-d * d * 9000.0) * (0.6 + 0.4 * sin(uT * 2.0 + fi)); }
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(R.X1 - R.X0, R.H - 1.3), seaM);
    sea.position.set(0, 0.9 + (R.H - 1.3) / 2, R.Z1 + 0.6); sea.rotation.y = Math.PI; grp.add(sea);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(R.X1 - R.X0, R.H - 1.3), new THREE.MeshStandardMaterial({ color: 0x9fc8c8, roughness: 0.02, metalness: 0.3, transparent: true, opacity: 0.12 }));
    glass.position.set(0, 0.9 + (R.H - 1.3) / 2, R.Z1 + 0.12); glass.rotation.y = Math.PI; grp.add(glass);
    // plaque at the airlock: gold letters on brass, with the monogram
    const c = document.createElement('canvas'); c.width = 1024; c.height = 384; const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 384); gr.addColorStop(0, '#6a4e1e'); gr.addColorStop(0.5, '#a07a32'); gr.addColorStop(1, '#5a4218'); x.fillStyle = gr; x.fillRect(0, 0, 1024, 384);
    x.strokeStyle = '#e8cf8a'; x.lineWidth = 8; x.strokeRect(18, 18, 988, 348);
    x.fillStyle = '#f6e3a6'; x.textAlign = 'center'; x.font = 'italic 700 64px Georgia'; x.fillText(this.d.plaque, 512, 200);
    x.font = 'italic 54px Georgia'; x.fillText(this.d.monogram.split('').join(' · '), 512, 300);
    x.font = '22px Georgia'; x.fillText('MEMBERS ONLY  ·  EST. BEFORE THE RISE', 512, 90);
    const pt = new THREE.CanvasTexture(c); pt.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshStandardMaterial({ map: pt, metalness: 0.7, roughness: 0.3 }));
    plaque.position.set(R.X1 - 0.12, 2.6, 0); plaque.rotation.y = -Math.PI / 2; grp.add(plaque);
    // velvet rope on brass posts by the door
    const postM = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.9, roughness: 0.25 });
    const post = new THREE.LatheGeometry([[0.001, 0], [0.14, 0], [0.14, 0.04], [0.04, 0.08], [0.035, 0.95], [0.06, 0.98], [0.05, 1.05], [0.001, 1.06]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
    const ropeM = new THREE.MeshStandardMaterial({ color: 0x6a0a14, roughness: 0.6 });
    [[R.X1 - 2.2, -1.2], [R.X1 - 2.2, 1.2]].forEach(([px, pz]) => { const m = new THREE.Mesh(post, postM); m.position.set(px, 0, pz); grp.add(m); });
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(R.X1 - 2.2, 0.95, -1.2), new THREE.Vector3(R.X1 - 2.2, 0.6, 0), new THREE.Vector3(R.X1 - 2.2, 0.95, 1.2));
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.035, 6), ropeM));
    // curtain: heavy folds, lit from behind; silhouettes of dancers move on it
    const cc = document.createElement('canvas'); cc.width = 512; cc.height = 256; this.curtainCanvas = cc;
    this.curtainTex = new THREE.CanvasTexture(cc); this.curtainTex.colorSpace = THREE.SRGBColorSpace;
    const curtainG = new THREE.PlaneGeometry(R.Z1 - R.Z0 - 1.2, R.H - 0.5, 60, 1);
    const P = curtainG.attributes.position; for (let i = 0; i < P.count; i++) P.setZ(i, Math.sin(P.getX(i) * 7) * 0.08);
    curtainG.computeVertexNormals();
    const curtain = new THREE.Mesh(curtainG, new THREE.MeshStandardMaterial({ map: this.curtainTex, emissive: 0xffffff, emissiveMap: this.curtainTex, emissiveIntensity: 0.6, roughness: 0.9, side: THREE.DoubleSide }));
    curtain.position.set(R.X0 + 4.3, (R.H - 0.5) / 2 + 0.45, 0); curtain.rotation.y = Math.PI / 2; grp.add(curtain);
    // bottles behind the bar, glasses on the tables, amber lamps
    const lampM = new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false });
    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const lx = R.X0 + 3 + i * 4.6;
      const shade = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0.25], [0.25, 0.0], [0.27, -0.02], [0.001, -0.02]].map(([r, y]) => new THREE.Vector2(r, y)), 16), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }));
      shade.position.set(lx, R.H - 0.5, 0.6); grp.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lampM); bulb.position.set(lx, R.H - 0.55, 0.6); grp.add(bulb);
      const l = new THREE.PointLight(0xffa860, 7, 9, 1.6); l.position.set(lx, R.H - 0.7, 0.6); grp.add(l); this.lights.push(l);
    }
    const stageL = new THREE.SpotLight(0xffc890, 60, 12, 0.6, 0.6, 1.2); stageL.position.set(R.X0 + 1.5, R.H - 0.3, 0); stageL.target.position.set(R.X0 + 4.3, 1.5, 0); grp.add(stageL, stageL.target); this.lights.push(stageL);
    // people: doorman, Ondine, bartender, masked patrons, band, singer
    this.people = [];
    if (this.ctx.humans) {
      const at = (p, x, z, face, clip) => { p.root.position.set(x, 0, z); p.root.rotation.y = face; p.play(clip, 0); grp.add(p.root); this.people.push(p); return p; };
      const mk = (seed, hints) => new Person(this.ctx, this.ctx.humans, { ...generatePerson(seed, hints), tier: 7 });
      this.doorman = at(mk(771, { sex: 1, age: 50 }), R.X1 - 1.6, -1.7, -Math.PI / 2, 'Idle_Loop');
      this.ondine = at(new Person(this.ctx, this.ctx.humans, { ...personFor('ondine'), tier: 7 }), -10, R.Z1 - 1.0, Math.PI, 'Sitting_Talking_Loop');
      this.barkeep = at(mk(4410, { sex: 0.9, age: 30 }), 0, R.Z0 + 0.5, 0, 'Idle_Talking_Loop');
      this.d.patrons.forEach((pd, i) => {
        if (pd.stage) { const s = at(mk(900 + i, { sex: 0.9, age: 32 }), R.X0 + 2, 0, Math.PI / 2, 'Idle_Talking_Loop'); s.root.position.y = 0.45; this.mask(s, pd.mask); pd.person = s; return; }
        const bx = this.booths[pd.booth - 1].clone().sub(this.origin);
        const p = at(mk(500 + i * 13, {}), bx.x + (i % 2 ? 0.5 : -0.5), bx.z + 0.85, Math.PI, 'Sitting_Talking_Loop');
        this.mask(p, pd.mask); pd.person = p;
      });
      for (let k = 0; k < 3; k++) { const m = at(mk(1300 + k, {}), R.X0 + 1 + k * 0.9, R.Z0 + 1.2, Math.PI / 2 - 0.4, k === 1 ? 'Sitting_Idle_Loop' : 'Idle_Talking_Loop'); m.root.position.y = 0.45; this.mask(m, 'plain black'); }
    }
    this.band = { emitter: null };
  }
  // a masquerade mask on the face: a curved half-mask with eye holes, coloured by name
  mask(person, kind) {
    const head = person.human.bone.head; if (!head) return;
    const col = /gold/.test(kind) ? 0xd4af37 : /silver/.test(kind) ? 0xc0c4c8 : /porcelain/.test(kind) ? 0xf0ece4 : /lace|black/.test(kind) ? 0x111111 : /stag|gilded/.test(kind) ? 0xb8902a : 0x222222;
    const s = new THREE.Shape(); s.moveTo(-0.085, 0.0); s.bezierCurveTo(-0.09, 0.04, -0.03, 0.045, 0, 0.02); s.bezierCurveTo(0.03, 0.045, 0.09, 0.04, 0.085, 0); s.bezierCurveTo(0.07, -0.035, 0.02, -0.03, 0, -0.012); s.bezierCurveTo(-0.02, -0.03, -0.07, -0.035, -0.085, 0);
    for (const sx of [-0.038, 0.038]) { const hole = new THREE.Path(); hole.absellipse(sx, 0.008, 0.018, 0.011, 0, Math.PI * 2, true); s.holes.push(hole); }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, curveSegments: 10 });
    const P = g.attributes.position; for (let i = 0; i < P.count; i++) P.setZ(i, P.getZ(i) - P.getX(i) * P.getX(i) * 6); // wrap around the face
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: col, metalness: /gold|silver|gilded/.test(kind) ? 0.85 : 0.1, roughness: 0.3 }));
    const h = person.human;
    const eyeH = h.restHeads[h.kit.boneIndex['eye.L']] || [0, h.height - 0.1, 0.08];
    const headH = h.restHeads[h.kit.boneIndex.head];
    m.position.set(0, eyeH[1] - headH[1], eyeH[2] - headH[2] + 0.025);
    head.add(m);
  }

  addInteractions() {
    const I = this.ctx.interact, w = (x, y, z) => (v) => v.set(x, y, z).add(this.origin);
    const inside = () => this.state.inside;
    I.add({ kind: 'club', mode: 'foot', radius: 2.2, pos: w(12.4, 1.5, -1.7), enabled: inside, prompt: 'Speak to the doorman', onUse: () => this.doorCheck() });
    I.add({ kind: 'club', mode: 'foot', radius: 1.6, pos: w(13.5, 1.2, 1.5), enabled: inside, prompt: 'Read the members\' ledger', onUse: () => this.ctx.ui.showNote('Members\' ledger', this.d.door.ledger) });
    I.add({ kind: 'club', mode: 'foot', radius: 2.2, pos: w(13.8, 1.3, 0), enabled: inside, prompt: 'Leave by the airlock', onUse: () => this.ctx.ui.fade(1.2, () => this.exit()) });
    I.add({ kind: 'club', mode: 'foot', radius: 2.4, pos: w(0, 1.3, -3.2), enabled: () => inside() && this.state.admitted, prompt: 'The long bar', onUse: () => this.barMenu() });
    I.add({ kind: 'club', mode: 'foot', radius: 2.2, pos: w(-10, 1.2, 3.6), enabled: () => inside() && this.state.admitted, prompt: 'Sit with Madame Ondine', onUse: () => this.ondineTalk() });
    this.d.patrons.forEach((pd) => {
      if (pd.stage) return;
      const bx = this.booths[pd.booth - 1].clone().sub(this.origin);
      I.add({ kind: 'club', mode: 'foot', radius: 2.4, pos: w(bx.x, 1.2, bx.z), enabled: () => inside() && this.state.admitted, prompt: () => `Booth ${pd.booth}: ${pd.who}, ${pd.mask} mask`, onUse: () => this.patron(pd) });
    });
    I.add({ kind: 'club', mode: 'foot', radius: 1.8, pos: w(-12.2, 1.2, -4.6), enabled: () => inside() && this.state.admitted && this.ctx.story.flag('ondine_trust3'), prompt: 'A door with a ship\'s wheel', onUse: () => this.vault() });
    I.add({ kind: 'club', mode: 'foot', radius: 1.8, pos: w(7.3, 1.2, -4.6), enabled: () => inside() && this.raid?.on, prompt: 'Service tunnel — get them out', onUse: () => this.tunnel() });
  }

  // ---------------------------------------------------------------- in and out
  enter() {
    const p = this.ctx.player;
    this.state.inside = true; this.saloon.visible = true;
    p.mode = 'foot'; p.teleport(_v.set(13, 0.1, 0).add(this.origin)); p.yaw = Math.PI / 2;
    this.ctx.story.setFlag('club_entered');
    this.ctx.events.emit('club:enter');
    this.ctx.ui.whisper('The airlock cycles with a long sigh. Then warm air, perfume, cigarette smoke and a trumpet, and you are standing on carpet four fathoms under the sea.');
    if (!this.band.emitter && this.ctx.audio) this.band.emitter = this.ctx.audio.addEmitter({ type: 'band', style: 'lounge', seed: 31, pos: (v) => v.set(-12, 1.5, 0).add(this.origin), gainFn: () => (this.state.inside ? (this.raid?.on ? 0 : 0.9) : 0) });
  }
  exit() {
    const p = this.ctx.player;
    this.state.inside = false; this.state.admitted = false;
    if (this.ctx.arms) this.ctx.arms.state.confiscated = false;
    p.mode = 'swim'; p.teleport(this.hatchPos.clone().add(_v.set(1.5, 0, 0)));
    this.ctx.events.emit('club:exit');
  }
  doorCheck() {
    const ui = this.ctx.ui, D = this.d.door;
    if (this.state.admitted) { ui.subtitle(`${D.doorman}: Enjoy your evening.`, 3, 'speech'); return; }
    if ((this.ctx.heat?.stars || 0) >= 3) { ui.showNote(D.doorman, D.refuseHot); return; }
    const opts = [D.password, ...D.wrong].sort(() => Math.random() - 0.5);
    ui.openPanel('club', `<button class="btn close" data-close>Step back</button><h2>${esc(this.d.name)}</h2><div class="sub">${esc(D.doorman)}, by the velvet rope</div>
      <div class="row"><div class="name hand" style="font-size:16px">“${esc(D.doormanLine)}”</div></div>
      ${opts.map((o, i) => `<div class="row"><button class="btn" data-o="${i}" style="flex:1;text-align:left">“${esc(o)}”</button></div>`).join('')}`, (el) => {
      el.querySelectorAll('[data-o]').forEach((b) => b.addEventListener('click', () => {
        const said = opts[+b.dataset.o];
        if (said !== D.password) { ui.close(); ui.showNote(D.doorman, '"I don\'t believe we\'ve met." He doesn\'t move. He doesn\'t need to.'); return; }
        if (!this.ctx.story.flag('has_pin')) { ui.close(); ui.showNote(D.doorman, D.refuseNoPin); return; }
        this.state.admitted = true; this.state.entered = true; ui.close();
        const armed = this.ctx.arms?.state.owned.length; if (armed) { this.ctx.arms.holster(); this.ctx.arms.state.confiscated = true; }
        ui.showNote(D.doorman, D.admit + (armed ? ' He holds out a velvet tray. "Your hardware, please. You\'ll have it back at the airlock."' : ''));
        this.ctx.events.emit('fame', { kind: 'ghost', text: 'Somebody new was seen wearing a brass fish. Nobody will say where.' });
      }));
    });
  }
  barMenu() {
    // the Club pours the same as the Anchor, at Concord prices, and offers fair-looking games
    const nl = this.ctx.nightlife;
    const bar = { id: 'club', name: 'The long bar', drinks: ['gold_seal', 'drowned_rat', 'rum_ration', 'tea_bitter'], games: this.d.games, rowdy: 0, community: 'club', bartender: { name: 'the bartender', tree: { start: { text: 'Good evening.', options: [{ text: 'A drink.', do: 'order' }, { text: 'Is there a game tonight?', do: 'game:tide_cards' }, { text: 'Bones?', do: 'game:bones' }, { text: 'Any work for me here?', do: 'clubjob' }, { text: 'Nothing, thanks.', do: 'leave' }] } }, greets: ['Good evening.'], greetsTab: ['Good evening.'], greetsRegular: ['Good evening, again.'], intro: 'Good evening.' }, blurb: 'Brass and amber and the sea against the glass.', open: [0, 24] };
    nl.bars.club = bar;
    const act = nl.act.bind(nl);
    nl.act = (b, what) => { if (b.id === 'club' && what === 'clubjob') return this.clubJobs(); return act(b, what); };
    nl.node(bar, 'start');
  }
  clubJobs() {
    const ui = this.ctx.ui;
    ui.openPanel('club', `<button class="btn close" data-close>Back</button><h2>Work at the Club</h2>${this.d.jobs.map((j, i) => `<div class="row"><div class="name">${esc(j.name)}<small>${esc(j.desc)}</small></div><button class="btn" data-j="${i}">${j.pay} scrap</button></div>`).join('')}`, (el) => {
      el.querySelectorAll('[data-j]').forEach((b) => b.addEventListener('click', () => {
        const j = this.d.jobs[+b.dataset.j]; ui.close();
        ui.fade(1.2, () => { this.ctx.time.hour = (this.ctx.time.hour + 3) % 24; this.ctx.inventory.add('scrap', j.pay); this.ctx.events.emit('club:job', j.id); if (j.id === 'informant') this.ctx.story.setFlag('club_informant'); ui.whisper(j.id === 'bartend' ? 'Three hours in a white jacket. You learn that a Concord accountant tips in confessions.' : j.id === 'musician' ? 'You hum with the band until your chest aches. The singer squeezes your hand after the last number.' : 'A page of what you heard, folded twice, into Ondine\'s glove. She doesn\'t read it in front of you.'); });
      }));
    });
  }
  ondineTalk() {
    const ui = this.ctx.ui, O = this.d.ondine, st = this.ctx.story;
    const next = O.favors.find((f) => !this.state.favors[f.id]);
    const done = O.favors.filter((f) => this.state.favors[f.id] === 'done');
    const greet = O.greet[Math.floor(Math.random() * O.greet.length)];
    const active = O.favors.find((f) => this.state.favors[f.id] === 'asked');
    ui.openPanel('club', `<button class="btn close" data-close>Leave her be</button><h2>${esc(O.name)}</h2><div class="sub">${esc(O.neutral)}</div>
      <div class="row"><div class="name hand" style="font-size:16px">“${esc(greet)}”</div></div>
      ${active ? `<div class="row"><div class="name">“${esc(active.ask)}”</div><button class="btn" data-done>It's done</button></div>` : next ? `<div class="row"><div class="name">“I have a small favour to ask.”</div><button class="btn" data-ask>Ask</button></div>` : '<div class="row"><div class="name">“You have done enough for me. For now.”</div></div>'}
      ${done.map((f) => `<div class="row"><div class="name" style="opacity:.7">${esc(f.reward)}</div></div>`).join('')}`, (el) => {
      el.querySelector('[data-ask]')?.addEventListener('click', () => { this.state.favors[next.id] = 'asked'; ui.close(); ui.showNote(O.name, next.ask); });
      el.querySelector('[data-done]')?.addEventListener('click', () => {
        // the meeting favour is done by listening at booth three; the others trust you (and the world remembers)
        if (active.id === 'f_meeting' && !st.flag('cathedral_overheard')) { ui.close(); ui.showNote(O.name, '"You haven\'t listened yet. Booth three. Patience is the only currency I can\'t forge."'); return; }
        this.state.favors[active.id] = 'done'; st.setFlag(active.sets); this.ctx.inventory.add('scrap', active.pay); ui.close(); ui.showNote(O.name, `"${active.reward}"`);
        this.ctx.economy.rumours.unshift({ day: this.ctx.time.day, text: active.reward });
        if (active.id === 'f_song') st.setFlag('raid_night'); // a favour noticed by the wrong people
      });
    });
  }
  patron(pd) {
    const ui = this.ctx.ui;
    const line = pd.lines[Math.floor(Math.random() * pd.lines.length)];
    const canListen = pd.listen && !this.state.heard[pd.id] && (!pd.listen.requires || this.ctx.story.flag(pd.listen.requires));
    ui.openPanel('club', `<button class="btn close" data-close>Move on</button><h2>${esc(pd.who)}</h2><div class="sub">${esc(pd.mask)} mask</div>
      <div class="row"><div class="name hand" style="font-size:16px">“${esc(line)}”</div></div>
      ${canListen ? '<div class="row"><div class="name">Sit nearby, back turned, and listen.</div><button class="btn" data-l>Eavesdrop</button></div>' : pd.listen && this.state.heard[pd.id] ? '<div class="row"><div class="name" style="opacity:.6">You\'ve heard what this booth has to say.</div></div>' : ''}`, (el) => {
      el.querySelector('[data-l]')?.addEventListener('click', () => this.eavesdrop(pd));
    });
  }
  // the listening game: keep your attention tuned to the conversation as the room noise shifts
  eavesdrop(pd) {
    const ui = this.ctx.ui, Ls = pd.listen;
    let got = 0, hold = 0, raf = 0, t0 = performance.now(), attn = 0.5, lost = 0;
    const p = ui.openPanel('club', `<button class="btn close" data-close>Stop listening</button><h2>${esc(Ls.title)}</h2><div class="sub">Hold your attention where their voices are. The band, the glasses and the sea keep pulling it away. ← → or drag.</div>
      <div style="position:relative;height:28px;border:1px solid var(--line);margin:12px 0;background:rgba(255,255,255,.04)"><div class="zone" style="position:absolute;top:0;bottom:0;width:18%;background:rgba(240,200,90,.3)"></div><div class="mk" style="position:absolute;top:-4px;bottom:-4px;width:4px;background:#fff"></div></div>
      <input class="sl" type="range" min="0" max="1000" value="500" style="width:100%;pointer-events:auto">
      <div class="frag logtext hand" style="min-height:120px"></div>`, () => {});
    this.ctx.paused = true;
    const zone = p.querySelector('.zone'), mk = p.querySelector('.mk'), sl = p.querySelector('.sl'), frag = p.querySelector('.frag');
    const keys = (e) => { if (e.code === 'ArrowLeft') attn = Math.max(0, attn - 0.04); if (e.code === 'ArrowRight') attn = Math.min(1, attn + 0.04); sl.value = attn * 1000; };
    addEventListener('keydown', keys);
    sl.addEventListener('input', () => (attn = sl.value / 1000));
    const loop = () => {
      if (!document.body.contains(mk)) { removeEventListener('keydown', keys); return; }
      const t = (performance.now() - t0) / 1000;
      const zc = 0.5 + Math.sin(t * 0.7) * 0.3 + Math.sin(t * 1.9) * 0.08;
      zone.style.left = ((zc - 0.09) * 100) + '%'; mk.style.left = (attn * 100) + '%';
      const inZone = Math.abs(attn - zc) < 0.09;
      hold = inZone ? hold + 1 / 60 : Math.max(0, hold - 1 / 30);
      if (!inZone) lost += 1 / 60;
      if (hold > 2.2) { hold = 0; frag.innerHTML += `<p>“${esc(Ls.fragments[got])}”</p>`; got++; if (got >= Ls.fragments.length) return this.heard(pd, true); }
      if (lost > 14) return this.heard(pd, false);
      raf = requestAnimationFrame(loop);
    };
    loop();
    void raf;
  }
  heard(pd, ok) {
    const ui = this.ctx.ui;
    this.state.heard[pd.id] = ok;
    if (!ok) { ui.close(); ui.whisper('The band swells, a glass breaks, somebody laughs too loud. When the room settles, the booth has gone quiet and someone is looking at you.'); this.ctx.events.emit('club:noticed'); return; }
    this.ctx.story.setFlag(pd.listen.reveals);
    (this.ctx.state.notes ||= []).push({ text: `Overheard at the Club (${pd.listen.title}): ${pd.listen.fragments.join(' ')}`, day: this.ctx.time.day });
    this.ctx.events.emit('club:overheard', pd.listen.reveals);
    setTimeout(() => { ui.close(); ui.whisper(pd.listen.reveals === 'cathedral_overheard' ? 'The gentleman in the gold sun mask stands, straightens his cuffs and walks past you without seeing you. You realise your hands are cold. The Cathedral isn\'t all flooded.' : 'You keep your eyes on your glass. You heard every word.'); }, 2200);
  }
  vault() {
    const ui = this.ctx.ui, V = this.d.vault, h = this.ctx.time.hour;
    if (!(h >= V.hour[0] && h < V.hour[1])) { ui.whisper('The wheel turns a quarter and stops. A clock inside the door ticks. Not yet.'); return; }
    if (!this.ctx.story.flag('vault_code')) { ui.whisper('Four dials under the wheel: letters and numbers. You don\'t know the combination.'); return; }
    const mature = this.ctx.settings.mature === true;
    const art = V.art.map((a) => (a.mature && !mature ? { ...a, ...a.clean } : a));
    this.state.vaultOpen = true;
    this.ctx.events.emit('club:vault');
    ui.openPanel('club', `<button class="btn close" data-close>Close the door</button><h2>The vault</h2><div class="sub">${esc(V.intro)}</div>
      <h3>The ledger</h3>${V.ledgerLines.map((l) => `<div class="row"><div class="name hand">${esc(l)}</div></div>`).join('')}
      <h3>On the walls</h3>${art.map((a) => `<div class="row"><div class="name">${esc(a.title)}<small>${esc(a.desc)}</small></div></div>`).join('')}`);
    this.ctx.story.setFlag('ledger_read');
  }

  // ---------------------------------------------------------------- the raid
  startRaid() {
    if (this.raid || this.state.raidDone) return;
    const R = this.d.raid;
    this.raid = { on: true, t: R.seconds, saved: 0, total: R.guests, water: -1.0 };
    this.dry.water = this.origin.y - 1.0;
    this.ctx.ui.whisper(R.alarm);
    setTimeout(() => this.ctx.ui.showNote('The Club is flooding', R.brief), 2500);
    this.ctx.events.emit('club:raid');
    this.ctx.events.emit('music:moment', 'danger');
    for (const l of this.lights) l.color?.setHex(0xff3020);
  }
  tunnel() {
    // each trip down the tunnel gets one or two people out
    const r = this.raid; if (!r) return;
    const n = Math.min(r.total - r.saved, 1 + (Math.random() < 0.5 ? 1 : 0));
    r.saved += n; r.t -= 6;
    this.ctx.ui.toast(`${r.saved} / ${r.total} out through the tunnel`);
    if (r.saved >= r.total) this.endRaid();
  }
  endRaid() {
    const r = this.raid, R = this.d.raid; if (!r) return;
    r.on = false; this.state.raidDone = true; this.dry.water = -999;
    for (const l of this.lights) l.color?.setHex(0xffa860);
    const msg = (r.saved >= r.total * 0.5 ? R.saved : R.lost).replace('{n}', r.saved).replace('{total}', r.total);
    this.ctx.ui.fade(1.5, () => { this.exit(); this.ctx.ui.whisper(msg); });
    if (r.saved >= r.total * 0.5) { this.ctx.story.setFlag('ondine_owes'); this.ctx.story.setFlag('vault_code'); this.ctx.events.emit('fame', { kind: 'legend', text: 'Somebody pulled a dozen masked strangers out of a flooding hull. Nobody will say who, or where.' }); }
    this.raid = null;
  }

  // ---------------------------------------------------------------- per frame
  minute() {
    // the lanternfish signal is only seen at night, near the lighthouse
    const p = this.ctx.player.position;
    if (!this.ctx.story.flag('lamp_seen') && this.ctx.story.flag('coded_lamp') && this.ctx.time.out.night > 0.5 && p.distanceTo(this.lh) < 70) { this.ctx.story.setFlag('lamp_seen'); this.ctx.ui.whisper('Under the drowned lighthouse the lanternfish brighten, amber: three short, one long. Three short, one long.'); }
    // the raid comes on the night after a certain favour, if you're inside
    if (this.state.inside && this.ctx.story.flag('raid_night') && !this.state.raidDone && this.open && Math.random() < 0.25) this.startRaid();
  }
  update(dt) {
    if (!this.d) return;
    this.t += dt;
    const near = this.ctx.player.position.distanceTo(this.origin) < 80;
    this.saloon.visible = near || this.state.inside;
    this.wreck.visible = !this.state.inside; // from inside, the saloon is the hull
    this.cU.uT.value = this.t;
    // the signal: three short, one long (5 s cycle), at night only
    const night = this.ctx.time.out.night, c = this.t % 5;
    const pulse = (c < 0.35 || (c > 0.7 && c < 1.05) || (c > 1.4 && c < 1.75)) ? 1 : (c > 2.4 && c < 3.6) ? 1 : 0.15;
    this.signalM.opacity = night * pulse * (this.ctx.story.flag('coded_lamp') ? 1 : 0.6);
    this.portholeM.color.setScalar(this.open ? 0.4 + night * 1.2 : 0.05);
    // the curtain: dancers as silhouettes, moving slowly, elegant and clothed
    if (this.saloon.visible) this.drawCurtain();
    for (const p of this.people) p.update(dt, this.state.inside ? this.ctx.player.eye : null);
    if (this.raid?.on) {
      this.raid.t -= dt;
      this.dry.water = Math.min(this.origin.y + 3.2, this.origin.y - 1 + (1 - this.raid.t / this.d.raid.seconds) * 4.2);
      if (this.raid.t <= 0) this.endRaid();
    }
    if (this.state.inside && !this.ctx.atmosphere.underwater) this.ctx.atmosphere.indoor = 1;
  }
  drawCurtain() {
    const c = this.curtainCanvas, x = c.getContext('2d'), t = this.t;
    const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#5a0a10'); g.addColorStop(0.6, '#b8402a'); g.addColorStop(1, '#3a0508');
    x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(0,0,0,${0.12 + 0.1 * Math.sin(i * 1.7)})`; x.fillRect(i * 13, 0, 5, 256); }
    // two dancers in long gowns, as shadows on the lit cloth
    x.fillStyle = 'rgba(20,4,6,0.85)';
    for (const [cx0, ph] of [[170, 0], [340, 1.7]]) {
      const cx = cx0 + Math.sin(t * 0.6 + ph) * 40, sway = Math.sin(t * 1.2 + ph) * 8;
      x.beginPath(); x.ellipse(cx + sway * 0.3, 70, 11, 14, 0, 0, Math.PI * 2); x.fill();                  // head
      x.beginPath(); x.moveTo(cx - 14, 88); x.lineTo(cx + 14, 88); x.lineTo(cx + 30 + sway, 230); x.lineTo(cx - 30 + sway, 230); x.closePath(); x.fill(); // gown
      x.lineWidth = 6; x.strokeStyle = 'rgba(20,4,6,0.85)'; x.beginPath(); x.moveTo(cx - 12, 94); x.quadraticCurveTo(cx - 40, 70 + Math.sin(t * 1.5 + ph) * 20, cx - 30, 40 + Math.sin(t + ph) * 15); x.stroke(); // an arm raised
      x.beginPath(); x.moveTo(cx + 12, 94); x.quadraticCurveTo(cx + 34, 120, cx + 26, 150 + Math.sin(t * 1.3 + ph) * 10); x.stroke();
    }
    this.curtainTex.needsUpdate = true;
  }
  toJSON() { return this.state; }
  load(o) { if (o) this.state = { ...this.state, ...o, inside: false, admitted: false }; }
}
void Band; void runGame;
