// Finds a heavy sans font for captions. Override with MARKETING_FONT=/path/to/font.ttf

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const CANDIDATES = [
  process.env.MARKETING_FONT,
  new URL("../assets/fonts/caption.ttf", import.meta.url).pathname,
  new URL("../assets/fonts/caption.otf", import.meta.url).pathname,
  // Linux
  "/usr/share/fonts/opentype/inter/Inter-Black.otf",
  "/usr/share/fonts/opentype/inter/InterDisplay-Black.otf",
  "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  // macOS
  "/System/Library/Fonts/Supplemental/Arial Black.ttf",
  "/Library/Fonts/Arial Black.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  // Windows
  "C:/Windows/Fonts/ariblk.ttf",
  "C:/Windows/Fonts/arialbd.ttf",
];

export function captionFont() {
  for (const f of CANDIDATES) if (f && existsSync(f)) return f;
  try {
    const f = execFileSync("fc-match", ["-f", "%{file}", "sans:bold"]).toString().trim();
    if (f && existsSync(f)) return f;
  } catch {}
  throw new Error("No bold font found. Set MARKETING_FONT=/path/to/a/bold.ttf");
}
