const parse = (h: string) => {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
export const mix = (a: string, b: string, t: number) => {
  const A = parse(a), B = parse(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
export const rgba = (h: string, a: number) => {
  const [r, g, b] = parse(h);
  return `rgba(${r},${g},${b},${a})`;
};
