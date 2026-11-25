/**
 * Helpers shared by the generated Open Graph image and Apple touch icon.
 * Both are rendered to PNG at build time with next/og (Satori).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** The Gleyde mark as an SVG data URI (same geometry as GleydeMark.tsx). */
export function markDataUri(strokeScale = 1) {
  const w = (n: number) => (n * strokeScale).toFixed(2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160" fill="none">
<defs><linearGradient id="g" x1="0" y1="0" x2="120" y2="160" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#E6C97A"/><stop offset=".5" stop-color="#C9A24B"/><stop offset="1" stop-color="#E6C97A"/>
</linearGradient></defs>
<g stroke="url(#g)" stroke-linecap="square" stroke-miterlimit="12">
<path d="M60 3 L117 80 L60 157 L3 80 Z" stroke-width="${w(1.2)}"/>
<path d="M60 15 L105 80 L60 145 L15 80 Z" stroke-width="${w(0.7)}"/>
<path d="M75.56 64.44 A22 22 0 1 0 82 80 L63 80" stroke-width="${w(1.9)}"/>
<path d="M60 22 L60 52 M60 108 L60 138 M22 80 L32 80 M88 80 L98 80" stroke-width="${w(0.7)}"/>
</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Cinzel 600 from @fontsource (WOFF: Satori cannot read WOFF2). */
export async function cinzelFont() {
  const file = join(process.cwd(), "node_modules/@fontsource/cinzel/files/cinzel-latin-600-normal.woff");
  return readFile(file);
}
