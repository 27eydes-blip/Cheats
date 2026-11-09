import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { APP_CONFIG } from "@/config/app";

/**
 * Shared look for link-preview images (iMessage, Snapchat, WhatsApp, etc.):
 * dark canvas, lime glow, big title. 1200x630 is what every app expects.
 */
export const OG_SIZE = { width: 1200, height: 630 };

/** The full Flashdrop logo as a data URI (satori renders it as an image). */
export async function ogLogo() {
  const svg = await readFile(join(process.cwd(), "assets/brand/logo-full.svg"));
  return `data:image/svg+xml;base64,${svg.toString("base64")}`;
}

export async function ogFonts() {
  const [semi, medium] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Geist-SemiBold.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Geist-Medium.ttf")),
  ]);
  return [
    { name: "Geist", data: semi, weight: 600 as const, style: "normal" as const },
    { name: "Geist", data: medium, weight: 500 as const, style: "normal" as const },
  ];
}

const LIME = "#c4f82a";

/**
 * Non-breaking spaces for short labels: the image renderer mis-measures some
 * words before a normal space and leaves a visibly wider gap.
 */
const nb = (s: string) => s.replace(/ /g, "\u00a0");

function Brand({ logo }: { logo: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} width={72} height={72} alt="" style={{ borderRadius: 17, boxShadow: "0 0 40px rgba(196,248,42,0.35)" }} />
      <div style={{ fontSize: 44, fontWeight: 600, color: "#ffffff", letterSpacing: -0.8 }}>{APP_CONFIG.shortName}</div>
    </div>
  );
}

export function OgFrame({ eyebrow, title, chips, cta, logo }: { eyebrow?: string | null; title: string; chips: string[]; cta: string; logo: string }) {
  const size = title.length > 60 ? 58 : title.length > 34 ? 72 : 86;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "52px 64px 56px",
        background: "#08090b",
        backgroundImage: "radial-gradient(circle at 85% 0%, rgba(196,248,42,0.28), transparent 45%), radial-gradient(circle at 0% 100%, rgba(196,248,42,0.10), transparent 40%)",
        fontFamily: "Geist",
        position: "relative",
      }}
    >
      {/* Decorative quiz cards */}
      <div style={{ position: "absolute", right: 36, top: 110, width: 220, height: 270, borderRadius: 30, opacity: 0.8, background: "#111317", border: "1px solid rgba(255,255,255,0.08)", transform: "rotate(8deg)", display: "flex" }} />
      <div
        style={{
          position: "absolute",
          right: 60,
          top: 92,
          width: 220,
          height: 270,
          borderRadius: 30,
          opacity: 0.85,
          background: "#15181d",
          border: "1px solid rgba(255,255,255,0.12)",
          transform: "rotate(-4deg)",
          display: "flex",
          flexDirection: "column",
          padding: 22,
          gap: 11,
        }}
      >
        <div style={{ height: 12, width: 90, borderRadius: 6, background: "rgba(255,255,255,0.16)", display: "flex" }} />
        <div style={{ height: 16, width: 160, borderRadius: 8, background: "rgba(255,255,255,0.28)", display: "flex", marginBottom: 12 }} />
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 36,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              padding: "0 16px",
              background: i === 1 ? LIME : "rgba(255,255,255,0.05)",
              border: i === 1 ? "none" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ height: 10, width: i === 1 ? 110 : 80 + i * 12, borderRadius: 6, background: i === 1 ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.18)", display: "flex" }} />
          </div>
        ))}
      </div>

      <Brand logo={logo} />
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 860, gap: 24 }}>
        {eyebrow && (
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 30px", borderRadius: 999, background: "#23272e", border: "3px solid rgba(196,248,42,0.6)", color: "#ffffff", fontSize: 44, fontWeight: 600 }}>
              <div style={{ width: 16, height: 16, borderRadius: 999, background: LIME, display: "flex" }} />
              {nb(eyebrow)}
            </div>
          </div>
        )}
        <div style={{ fontSize: size, fontWeight: 600, color: "#f4f5f6", lineHeight: 1.02, letterSpacing: -2.5, display: "flex" }}>{title}</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {chips.map((c) => (
            <div key={c} style={{ display: "flex", padding: "16px 32px", borderRadius: 999, background: "#2a2e35", color: "#ffffff", fontSize: 46, fontWeight: 600 }}>
              {nb(c)}
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 34px", borderRadius: 999, background: LIME, color: "#0b0c0e", fontSize: 48, fontWeight: 600, boxShadow: "0 10px 40px rgba(196,248,42,0.35)" }}>
            {nb(cta)}
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#0b0c0e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
