import { create } from "qrcode/lib/core/qrcode";
import { render as renderSvg } from "qrcode/lib/renderer/svg-tag";

export function stickerUrl(base: string, citySlug: string, stickerId: string) {
  return `${base}/city/${citySlug}?src=${encodeURIComponent(stickerId)}`;
}

// "Q" (25% error correction) survives scuffs, sun-fade and partial stickers outdoors.
const EC = "Q" as const;
const MARGIN = 4; // quiet zone in modules (spec minimum)

export function qrSvg(text: string, width?: number): string {
  return renderSvg(create(text, { errorCorrectionLevel: EC }), { margin: MARGIN, width });
}

/** Render a QR code as a 1-bit grayscale PNG using only Web APIs (works on Workers). */
export async function qrPng(text: string, scale = 24): Promise<Uint8Array> {
  const qr = create(text, { errorCorrectionLevel: EC });
  const n = qr.modules.size;
  const dim = (n + MARGIN * 2) * scale;
  const rowBytes = Math.ceil(dim / 8);
  const raw = new Uint8Array((rowBytes + 1) * dim); // +1 filter byte per row
  for (let y = 0; y < dim; y++) {
    const my = Math.floor(y / scale) - MARGIN;
    const row = y * (rowBytes + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < dim; x++) {
      const mx = Math.floor(x / scale) - MARGIN;
      const dark = mx >= 0 && my >= 0 && mx < n && my < n && !!qr.modules.data[my * n + mx];
      // 1-bit grayscale: 1 = white
      if (!dark) raw[row + 1 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  const idat = await deflate(raw);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, dim);
  dv.setUint32(4, dim);
  ihdr[8] = 1; // bit depth
  ihdr[9] = 0; // color type: grayscale
  return concat([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array())]);
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
