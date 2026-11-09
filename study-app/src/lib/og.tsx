import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { APP_CONFIG } from "@/config/app";

/**
 * Shared look for link-preview images (iMessage, Snapchat, WhatsApp, etc.):
 * dark canvas, lime glow, big title. 1200x630 is what every app expects.
 */
export const OG_SIZE = { width: 1200, height: 630 };

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

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: LIME, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 40px rgba(196,248,42,0.5)" }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#0b0c0e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 19V6.5A2.5 2.5 0 0 1 7.5 4H19v13H7.5A2.5 2.5 0 0 0 5 19.5 2.5 2.5 0 0 0 7.5 22H19" />
          <path d="m9 10.5 2 2 4-4" />
        </svg>
      </div>
      <div style={{ fontSize: 32, fontWeight: 600, color: "#f4f5f6", letterSpacing: -0.5 }}>{APP_CONFIG.shortName}</div>
    </div>
  );
}

export function OgFrame({ eyebrow, title, chips, cta }: { eyebrow?: string | null; title: string; chips: string[]; cta: string }) {
  const size = title.length > 60 ? 64 : title.length > 34 ? 78 : 96;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: "#08090b",
        backgroundImage: "radial-gradient(circle at 85% 0%, rgba(196,248,42,0.28), transparent 45%), radial-gradient(circle at 0% 100%, rgba(196,248,42,0.10), transparent 40%)",
        fontFamily: "Geist",
        position: "relative",
      }}
    >
      {/* Decorative quiz cards */}
      <div style={{ position: "absolute", right: 64, top: 150, width: 300, height: 360, borderRadius: 36, background: "#111317", border: "1px solid rgba(255,255,255,0.08)", transform: "rotate(8deg)", display: "flex" }} />
      <div
        style={{
          position: "absolute",
          right: 96,
          top: 132,
          width: 300,
          height: 360,
          borderRadius: 36,
          background: "#15181d",
          border: "1px solid rgba(255,255,255,0.12)",
          transform: "rotate(-4deg)",
          display: "flex",
          flexDirection: "column",
          padding: 28,
          gap: 14,
        }}
      >
        <div style={{ height: 14, width: 120, borderRadius: 8, background: "rgba(255,255,255,0.16)", display: "flex" }} />
        <div style={{ height: 18, width: 220, borderRadius: 9, background: "rgba(255,255,255,0.28)", display: "flex", marginBottom: 12 }} />
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 48,
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              padding: "0 16px",
              background: i === 1 ? LIME : "rgba(255,255,255,0.05)",
              border: i === 1 ? "none" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ height: 10, width: i === 1 ? 140 : 110 + i * 14, borderRadius: 6, background: i === 1 ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.18)", display: "flex" }} />
          </div>
        ))}
      </div>

      <Brand />
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 720, gap: 22 }}>
        {eyebrow && (
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", color: "#d3d6db", fontSize: 26, fontWeight: 500 }}>
              <div style={{ width: 10, height: 10, borderRadius: 999, background: LIME, display: "flex" }} />
              {eyebrow}
            </div>
          </div>
        )}
        <div style={{ fontSize: size, fontWeight: 600, color: "#f4f5f6", lineHeight: 1.02, letterSpacing: -2.5, display: "flex" }}>{title}</div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {chips.map((c) => (
            <div key={c} style={{ display: "flex", padding: "10px 20px", borderRadius: 999, background: "rgba(255,255,255,0.07)", color: "#d3d6db", fontSize: 26, fontWeight: 500 }}>
              {c}
            </div>
          ))}
          <div style={{ display: "flex", padding: "10px 24px", borderRadius: 999, background: LIME, color: "#0b0c0e", fontSize: 26, fontWeight: 600 }}>{cta}</div>
        </div>
      </div>
    </div>
  );
}
