import * as THREE from 'three';

// Something large passes at the edge of visibility in deep water. Never close,
// never lit, never explained.
export class DeepShapes {
  constructor(ctx) {
    this.ctx = ctx;
    const g = new THREE.CapsuleGeometry(2.2, 22, 4, 10);
    g.rotateZ(Math.PI / 2);
    g.scale(1, 0.55, 1);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x000000, fog: true }));
    this.mesh.visible = false;
    ctx.scene.add(this.mesh);
    this.cool = 40;
    this.t = 0;
  }
  update(dt) {
    const { player, atmosphere, worldMap, camera } = this.ctx;
    this.cool -= dt;
    if (this.mesh.visible) {
      this.t += dt;
      this.mesh.position.addScaledVector(this.vel, dt);
      this.mesh.rotation.y = Math.atan2(-this.vel.z, this.vel.x);
      if (this.t > 18 || !atmosphere.underwater) this.mesh.visible = false;
      return;
    }
    if (this.cool > 0 || !atmosphere.underwater || player.depth < 4) return;
    const sea = worldMap.seabedAt(camera.position.x, camera.position.z);
    if (sea > -14) return;
    this.cool = 90 + Math.random() * 120;
    const a = Math.random() * Math.PI * 2;
    const p = camera.position.clone().add(new THREE.Vector3(Math.cos(a) * 26, -12 - Math.random() * 8, Math.sin(a) * 26));
    this.mesh.position.copy(p);
    this.vel = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(3.2);
    this.mesh.visible = true;
    this.t = 0;
    this.ctx.audio?.play('deepMoan');
  }
}
