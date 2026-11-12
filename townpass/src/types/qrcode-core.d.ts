// Pure-JS internals of `qrcode` (avoids its Node-only PNG/fs renderer on Workers).
declare module "qrcode/lib/core/qrcode" {
  export function create(
    text: string,
    opts?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" },
  ): { modules: { size: number; data: Uint8Array | boolean[] } };
}
declare module "qrcode/lib/renderer/svg-tag" {
  export function render(qr: unknown, opts?: { margin?: number; width?: number; color?: { dark?: string; light?: string } }): string;
}
