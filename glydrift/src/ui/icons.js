// Small vector icons (crisp at any resolution), drawn into a Graphics centred on (0,0).

const TAU = Math.PI * 2;

function star(g, r, points = 5, inner = 0.45) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
  }
  return pts;
}

/** Draw achievement icon `id` with size ~ s (radius). */
export function drawIcon(g, id, s, color) {
  const w = Math.max(2.5, s * 0.12);
  g.lineStyle(w, color, 1);
  g.fillStyle(color, 1);
  switch (id) {
    case "first": {
      // wing
      g.beginPath();
      g.moveTo(-s * 0.7, s * 0.3);
      g.lineTo(s * 0.6, -s * 0.55);
      g.lineTo(s * 0.2, -s * 0.05);
      g.lineTo(s * 0.55, -s * 0.05);
      g.lineTo(-s * 0.1, s * 0.35);
      g.closePath();
      g.fillPath();
      break;
    }
    case "close": {
      // two arrows barely missing
      g.lineBetween(-s * 0.7, -s * 0.2, s * 0.7, -s * 0.2);
      g.strokeCircle(0, s * 0.35, s * 0.28);
      g.fillCircle(0, s * 0.35, s * 0.1);
      break;
    }
    case "daredevil": {
      // skull
      g.fillCircle(0, -s * 0.1, s * 0.55);
      g.fillRect(-s * 0.3, s * 0.25, s * 0.6, s * 0.35);
      g.fillStyle(0x0a0418, 1);
      g.fillCircle(-s * 0.22, -s * 0.1, s * 0.15);
      g.fillCircle(s * 0.22, -s * 0.1, s * 0.15);
      g.fillRect(-s * 0.05, s * 0.32, s * 0.1, s * 0.25);
      break;
    }
    case "solar": {
      g.fillCircle(0, 0, s * 0.32);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        g.lineBetween(
          Math.cos(a) * s * 0.45,
          Math.sin(a) * s * 0.45,
          Math.cos(a) * s * 0.75,
          Math.sin(a) * s * 0.75,
        );
      }
      break;
    }
    case "frozen": {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        const dx = Math.cos(a) * s * 0.75;
        const dy = Math.sin(a) * s * 0.75;
        g.lineBetween(-dx, -dy, dx, dy);
      }
      g.fillCircle(0, 0, s * 0.12);
      break;
    }
    case "glitch": {
      const p = s * 0.28;
      for (const [x, y] of [
        [-1.5, -1.5],
        [0.5, -1.5],
        [-0.5, -0.5],
        [0.5, 0.5],
        [-1.5, 0.5],
        [0.5, 1.5 - 1],
      ]) {
        g.fillRect(x * p, y * p, p * 0.9, p * 0.9);
      }
      break;
    }
    case "abyss": {
      // eye
      g.beginPath();
      g.moveTo(-s * 0.8, 0);
      g.lineTo(-s * 0.3, -s * 0.38);
      g.lineTo(s * 0.3, -s * 0.38);
      g.lineTo(s * 0.8, 0);
      g.lineTo(s * 0.3, s * 0.38);
      g.lineTo(-s * 0.3, s * 0.38);
      g.closePath();
      g.strokePath();
      g.fillCircle(0, 0, s * 0.2);
      break;
    }
    case "marathon": {
      // flag
      g.lineBetween(-s * 0.45, -s * 0.7, -s * 0.45, s * 0.75);
      g.fillRect(-s * 0.45, -s * 0.7, s * 0.95, s * 0.6);
      g.fillStyle(0x0a0418, 1);
      g.fillRect(-s * 0.2, -s * 0.7, s * 0.25, s * 0.3);
      g.fillRect(s * 0.25, -s * 0.4, s * 0.25, s * 0.3);
      break;
    }
    case "laser": {
      g.strokeCircle(-s * 0.6, 0, s * 0.18);
      g.strokeCircle(s * 0.6, 0, s * 0.18);
      g.lineStyle(w * 1.6, color, 1);
      g.lineBetween(-s * 0.4, 0, s * 0.4, 0);
      break;
    }
    case "portal": {
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const a = t * 4.5;
        pts.push({ x: Math.cos(a) * s * 0.75 * t, y: Math.sin(a) * s * 0.75 * t });
      }
      g.strokePoints(pts);
      break;
    }
    case "rich": {
      // coin stack
      for (let i = 0; i < 3; i++) g.strokeEllipse(0, s * 0.35 - i * s * 0.3, s * 1.2, s * 0.4);
      break;
    }
    case "streak": {
      // flame
      g.beginPath();
      g.moveTo(0, -s * 0.8);
      g.lineTo(s * 0.45, -s * 0.05);
      g.lineTo(s * 0.35, s * 0.55);
      g.lineTo(0, s * 0.75);
      g.lineTo(-s * 0.35, s * 0.55);
      g.lineTo(-s * 0.45, -s * 0.05);
      g.lineTo(-s * 0.15, -s * 0.3);
      g.closePath();
      g.fillPath();
      break;
    }
    case "daily5": {
      // calendar
      g.strokeRoundedRect(-s * 0.65, -s * 0.5, s * 1.3, s * 1.15, s * 0.12);
      g.fillRect(-s * 0.65, -s * 0.5, s * 1.3, s * 0.28);
      g.fillPoints(
        star(g, s * 0.3).map((p) => ({ x: p.x, y: p.y + s * 0.2 })),
        true,
      );
      break;
    }
    case "level10": {
      // chevrons
      for (let i = 0; i < 3; i++) {
        const y = s * 0.45 - i * s * 0.4;
        g.beginPath();
        g.moveTo(-s * 0.55, y + s * 0.2);
        g.lineTo(0, y - s * 0.15);
        g.lineTo(s * 0.55, y + s * 0.2);
        g.strokePath();
      }
      break;
    }
    case "collector": {
      // 2x2 roster
      for (const [x, y] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        g.strokeCircle(x * s * 0.33, y * s * 0.33, s * 0.24);
      break;
    }
    case "legend": {
      g.fillPoints(star(g, s * 0.8, 5, 0.42), true);
      break;
    }
    case "gear": {
      const teeth = 8;
      const pts = [];
      for (let i = 0; i < teeth * 4; i++) {
        const a = (i / (teeth * 4)) * TAU;
        const r = i % 4 < 2 ? s : s * 0.75;
        pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      g.fillPoints(pts, true);
      g.fillStyle(0x0a0418, 1);
      g.fillCircle(0, 0, s * 0.35);
      break;
    }
    case "dim_prism":
      g.fillTriangle(0, -s, s * 0.9, s * 0.7, -s * 0.9, s * 0.7);
      g.fillStyle(0x0a0418, 1).fillTriangle(0, -s * 0.35, s * 0.4, s * 0.4, -s * 0.4, s * 0.4);
      break;
    case "dim_tidal":
      g.fillCircle(0, s * 0.25, s * 0.65);
      g.fillTriangle(0, -s, s * 0.6, s * 0.05, -s * 0.6, s * 0.05);
      break;
    case "dim_chrono":
      g.fillCircle(0, 0, s);
      g.fillStyle(0x0a0418, 1).fillCircle(0, 0, s * 0.78);
      g.fillStyle(color, 1)
        .fillRect(-s * 0.08, -s * 0.6, s * 0.16, s * 0.65)
        .fillRect(0, -s * 0.08, s * 0.45, s * 0.16);
      break;
    case "dim_mirror":
      g.fillTriangle(-s * 0.8, -s * 0.12, s * 0.8, -s * 0.12, 0, -s);
      g.fillTriangle(-s * 0.8, s * 0.12, s * 0.8, s * 0.12, 0, s);
      break;
    case "arm_day": {
      // a flexed arm: upper arm out, forearm up, fist on top, bicep bump
      g.fillRoundedRect(-s * 0.75, s * 0.05, s * 0.9, s * 0.38, s * 0.18);
      g.fillCircle(-s * 0.3, -s * 0.02, s * 0.3);
      g.fillRoundedRect(s * 0.05, -s * 0.6, s * 0.36, s * 1.0, s * 0.16);
      g.fillCircle(s * 0.23, -s * 0.62, s * 0.26);
      break;
    }
    case "dim_all":
      g.fillPoints(star(g, s, 4, 0.35), true);
      break;
    default:
      g.fillPoints(star(g, s * 0.7), true);
  }
}
