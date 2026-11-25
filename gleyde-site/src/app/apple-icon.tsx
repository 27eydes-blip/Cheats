import { ImageResponse } from "next/og";
import { markDataUri } from "@/lib/brand-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon for iOS, generated at build time. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B0B0C" }}>
        <img src={markDataUri({ compact: true })} width={108} height={144} alt="" />
      </div>
    ),
    size,
  );
}
