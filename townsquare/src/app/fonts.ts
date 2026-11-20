import localFont from "next/font/local";

/** Self-hosted fonts (no third-party font requests; fallbacks avoid layout shift). */
export const inter = localFont({ src: "./fonts/inter-var.woff2", variable: "--font-inter", weight: "100 900", display: "swap", preload: true, fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] });
/** Headlines: Barlow Condensed (SIL Open Font License, see fonts/barlow-condensed-OFL.txt). */
export const condensed = localFont({
  src: [
    { path: "./fonts/barlow-condensed-700.woff2", weight: "700" },
    { path: "./fonts/barlow-condensed-800.woff2", weight: "800" },
  ],
  variable: "--font-condensed",
  display: "swap",
  preload: true,
  fallback: ["Arial Narrow", "Roboto Condensed", "system-ui", "sans-serif"],
});
export const mono = localFont({ src: "./fonts/mono-var.woff2", variable: "--font-mono-face", weight: "100 800", display: "swap", preload: false, fallback: ["ui-monospace", "Menlo", "Consolas", "monospace"] });
