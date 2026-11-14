// Half vision. The server also stops sending enemies beyond the vision radius.
export const VISION = 430;
export default {
  id: 'blackout', name: 'BLACKOUT', desc: 'Lights out — vision halved!', color: '#3b2a7a', duration: 15,
  mods: () => ({ vision: VISION }),
  drawScreen(ctx, p, phase, t, W, H, scale) {
    if (phase !== 'on') return;
    const r = VISION * scale;
    const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.75, W / 2, H / 2, r * 1.05);
    g.addColorStop(0, 'rgba(10,5,30,0)'); g.addColorStop(1, 'rgba(10,5,30,0.93)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  },
};
