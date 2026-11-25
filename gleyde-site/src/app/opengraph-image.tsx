import { ImageResponse } from "next/og";
import { cinzelFont, markDataUri } from "@/lib/brand-image";
import { site } from "@/lib/site";

export const alt = "Gleyde Technologies: Games. Software. Security.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share card, generated at build time. */
export default async function OpenGraphImage() {
  const cinzel = await cinzelFont();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 45%, #1d1810 0%, #0A0A0A 62%)",
          color: "#F5F0E6",
          fontFamily: "Cinzel",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: 40, left: 40, right: 40, bottom: 40, border: "1px solid rgba(201,162,75,0.35)", display: "flex" }} />
        <img src={markDataUri(2.2)} width={168} height={224} alt="" />
        <div style={{ marginTop: 36, fontSize: 84, letterSpacing: 10, display: "flex" }}>Gleyde</div>
        <div style={{ marginTop: 8, fontSize: 26, letterSpacing: 18, color: "#E6C97A", display: "flex" }}>TECHNOLOGIES</div>
        <div style={{ marginTop: 34, fontSize: 24, letterSpacing: 6, color: "rgba(245,240,230,0.7)", display: "flex" }}>
          {site.tagline}
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Cinzel", data: cinzel, weight: 600, style: "normal" }] },
  );
}
