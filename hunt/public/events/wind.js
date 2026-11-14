// Storm wind pushes players and bullets in one direction.
export default {
  id: 'wind', name: 'STORM WIND', desc: 'The wind is pushing everyone!', color: '#b8f1ff', duration: 15,
  prepare(sim) { const a = Math.floor(sim.rand() * 8) * Math.PI / 4; return { a: Math.round(a * 1000) / 1000 }; },
  mods: (p) => ({ wx: Math.cos(p.a) * 95, wy: Math.sin(p.a) * 95, bulletWind: 220 }),
  drawScreen(ctx, p, phase, t, W, H) {
    ctx.save();
    ctx.strokeStyle = phase === 'on' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    const c = Math.cos(p.a), s = Math.sin(p.a);
    const n = phase === 'on' ? 46 : 14;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const k = (i * 7919) % 1000 / 1000, j = (i * 104729) % 1000 / 1000;
      const sp = 600 + k * 500;
      const L = W + H;
      const u = ((t * sp + k * L) % L) - L / 2, v = (j - 0.5) * L;
      const x = W / 2 + c * u - s * v, y = H / 2 + s * u + c * v;
      ctx.moveTo(x, y); ctx.lineTo(x - c * 40, y - s * 40);
    }
    ctx.stroke();
    ctx.restore();
  },
};
