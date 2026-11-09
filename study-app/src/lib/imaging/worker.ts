/// <reference lib="webworker" />
import { cleanPage, type Img } from "./preprocess";

// Runs photo cleanup off the main thread so the camera UI stays smooth.
self.onmessage = (e: MessageEvent<{ id: number; img: Img; crop: boolean }>) => {
  const { id, img, crop } = e.data;
  try {
    const out = cleanPage(img, { crop });
    (self as unknown as Worker).postMessage({ id, ok: true, out }, [out.img.data.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
  }
};
