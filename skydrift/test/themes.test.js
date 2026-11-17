import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, THEME_ORDER, ACTIVE_THEME, readability, contrast, gliderContrast, at, INK, INK_LIGHT } from '../public/themes.js';

const ALTS = Array.from({ length: 71 }, (_, i) => i * 10); // 0..700

test('every variation is complete and ACTIVE_THEME is one of them', () => {
  assert.ok(THEMES[ACTIVE_THEME], `ACTIVE_THEME "${ACTIVE_THEME}" is not a variation`);
  assert.deepEqual([...THEME_ORDER].sort(), Object.keys(THEMES).sort());
  for (const id of THEME_ORDER) {
    const t = THEMES[id];
    for (const k of ['name', 'mood', 'swatches', 'sky', 'light', 'celestial', 'rays', 'stars', 'haze', 'clouds', 'rock', 'top', 'stone', 'glow', 'details', 'particles', 'creatures', 'glider']) {
      assert.ok(t[k] !== undefined, `${id}.${k} missing`);
    }
    assert.equal(t.sky[0][0], 0);
    assert.equal(t.sky.at(-1)[0], 700);
    assert.ok(t.light.side === 1 || t.light.side === -1, `${id}: one light source, from the left or the right`);
  }
});

test('the glider stands out (3:1 non-text contrast) against sky, clouds and island rock at every altitude', () => {
  for (const id of THEME_ORDER) {
    const t = THEMES[id];
    for (const alt of ALTS) {
      const r = readability(t, alt);
      assert.ok(r.outlineContrast >= 3, `${id} @${alt}: glider vs sky ${r.outlineContrast.toFixed(2)}:1`);
    }
    for (const c of [...Object.values(t.clouds), ...Object.values(t.rock), t.haze]) {
      assert.ok(gliderContrast(t, c) >= 3, `${id}: glider only ${gliderContrast(t, c).toFixed(2)}:1 over ${c}`);
    }
  }
});

test('UI panels keep text and the red "wrong answer" hint at 4.5:1', () => {
  for (const id of THEME_ORDER) assert.ok(readability(THEMES[id], 0).cardContrast >= 4.5);
});

test('text drawn on the sky is readable (ink on its halo 4.5:1, never below 2.5:1 on bare sky)', () => {
  assert.ok(contrast(INK, INK_LIGHT) >= 4.5);
  for (const id of THEME_ORDER) {
    for (const alt of ALTS) {
      const r = readability(THEMES[id], alt);
      assert.ok(contrast(r.text, r.halo) >= 4.5);
      assert.ok(r.textContrast >= 2.5, `${id} @${alt}: sky text ${r.textContrast.toFixed(2)}:1 before its halo`);
    }
  }
});

test('backgrounds stay calm: limited particles, gentle light shafts, no flashing effects', () => {
  for (const id of THEME_ORDER) {
    const t = THEMES[id];
    const total = t.particles.reduce((s, p) => s + p.count, 0);
    assert.ok(total <= 30, `${id}: ${total} particles is too busy`);
    assert.ok(t.rays.alpha <= 0.25, `${id}: light shafts too strong`);
    assert.equal(t.lightning, undefined, `${id}: no lightning flashes in this direction`);
    for (const a of [0, 350, 700]) { const v = at(t.stars, a); assert.ok(v >= 0 && v <= 1); }
  }
});
