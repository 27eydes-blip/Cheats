"use client";
import { cleanPage, type CleanResult, type Img } from "./preprocess";

/** Longest side we keep. Enough detail for messy handwriting, small uploads. */
export const MAX_SIDE = 2000;

export async function loadBitmap(src: Blob): Promise<ImageBitmap> {
  // Respects EXIF orientation from phone cameras.
  return createImageBitmap(src, { imageOrientation: "from-image" });
}

export function bitmapToImg(bmp: ImageBitmap | HTMLCanvasElement, maxSide = MAX_SIDE): Img {
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: data.data };
}

export function imgToCanvas(img: Img): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.88): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), type, quality),
  );
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: CleanResult | Error) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const cb = pending.get(e.data.id);
      pending.delete(e.data.id);
      cb?.(e.data.ok ? e.data.out : new Error(e.data.error));
    };
    return worker;
  } catch {
    return null;
  }
}

/** Cleans a page image (crop, straighten, de-shadow, contrast) in a worker. */
export async function cleanImg(img: Img, crop = true): Promise<CleanResult> {
  const w = getWorker();
  if (!w) return cleanPage(img, { crop });
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, (r) => (r instanceof Error ? reject(r) : resolve(r)));
    const copy = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
    w.postMessage({ id, img: copy, crop }, [copy.data.buffer]);
  });
}
