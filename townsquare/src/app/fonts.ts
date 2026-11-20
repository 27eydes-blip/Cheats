import localFont from "next/font/local";

/** Self-hosted variable fonts (no third-party font requests; metric-matched fallbacks avoid layout shift). */
export const inter = localFont({ src: "./fonts/inter-var.woff2", variable: "--font-inter", weight: "100 900", display: "swap", preload: true, fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] });
export const newsreader = localFont({ src: "./fonts/newsreader-var.woff2", variable: "--font-newsreader", weight: "200 800", display: "swap", preload: true, fallback: ["Iowan Old Style", "Georgia", "serif"] });
export const mono = localFont({ src: "./fonts/mono-var.woff2", variable: "--font-mono-face", weight: "100 800", display: "swap", preload: false, fallback: ["ui-monospace", "Menlo", "Consolas", "monospace"] });
