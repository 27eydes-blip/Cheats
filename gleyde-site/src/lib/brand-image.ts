/**
 * Helpers shared by the generated Open Graph image and Apple touch icon.
 * Both are rendered to PNG at build time with next/og (Satori).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { markSvg } from "./brand";

/** The Gleyde mark as an SVG data URI (same geometry as the on-page logo). */
export function markDataUri(options?: { compact?: boolean }) {
  return `data:image/svg+xml;base64,${Buffer.from(markSvg(options)).toString("base64")}`;
}

/** Cinzel 600 from @fontsource (WOFF: Satori cannot read WOFF2). */
export async function cinzelFont() {
  const file = join(process.cwd(), "node_modules/@fontsource/cinzel/files/cinzel-latin-600-normal.woff");
  return readFile(file);
}
