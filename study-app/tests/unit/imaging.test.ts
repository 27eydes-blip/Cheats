import { describe, expect, it } from "vitest";
import { cleanPage, createImg, estimateSkew, findPaper, flattenLighting, rotate, toGray, type Img } from "@/lib/imaging/preprocess";

function setPx(img: Img, x: number, y: number, v: number) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
}

/** White page with horizontal "text lines" (dark bars with gaps, like words). */
function textPage(w: number, h: number): Img {
  const img = createImg(w, h, 245);
  for (let y = 20; y < h - 20; y += 16) {
    for (let x = 20; x < w - 20; x++) {
      if (x % 40 < 30) for (let t = 0; t < 3; t++) setPx(img, x, y + t, 30);
    }
  }
  return img;
}

const mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / a.length;

describe("photo cleanup", () => {
  it("finds the sheet of paper on a dark desk", () => {
    const img = createImg(400, 300, 40);
    const page = textPage(240, 200);
    for (let y = 0; y < 200; y++) img.data.set(page.data.subarray(y * 240 * 4, (y + 1) * 240 * 4), ((y + 50) * 400 + 80) * 4);
    const r = findPaper(img)!;
    expect(r).not.toBeNull();
    expect(Math.abs(r.x - 80)).toBeLessThan(6);
    expect(Math.abs(r.y - 50)).toBeLessThan(6);
    expect(Math.abs(r.width - 240)).toBeLessThan(10);
    expect(Math.abs(r.height - 200)).toBeLessThan(10);
  });

  it("does not crop a photo that is already just the page", () => {
    expect(findPaper(textPage(300, 300))).toBeNull();
  });

  it("measures text skew", () => {
    const page = textPage(400, 400);
    expect(Math.abs(estimateSkew(page))).toBeLessThanOrEqual(0.5);
    const tilted = rotate(page, 5);
    expect(Math.abs(Math.abs(estimateSkew(tilted)) - 5)).toBeLessThanOrEqual(1);
  });

  it("straightens a tilted page", () => {
    const tilted = rotate(textPage(400, 400), 6);
    const fixed = cleanPage(tilted, { crop: false });
    expect(Math.abs(fixed.angle)).toBeGreaterThan(4);
    expect(Math.abs(estimateSkew(fixed.img))).toBeLessThanOrEqual(1);
  });

  it("removes a shadow across the page", () => {
    const img = textPage(300, 300);
    // Shadow: left half much darker.
    for (let y = 0; y < 300; y++) {
      for (let x = 0; x < 150; x++) {
        const i = (y * 300 + x) * 4;
        for (let c = 0; c < 3; c++) img.data[i + c] = img.data[i + c] * 0.45;
      }
    }
    const paperLeft = (g: Float32Array) => g[10 * 300 + 10];
    const paperRight = (g: Float32Array) => g[10 * 300 + 290];
    const before = toGray(img);
    expect(paperRight(before) - paperLeft(before)).toBeGreaterThan(100);
    const after = toGray(flattenLighting(img));
    expect(Math.abs(paperRight(after) - paperLeft(after))).toBeLessThan(25);
  });

  it("makes tinted paper white", () => {
    const img = textPage(200, 200);
    for (let i = 0; i < img.data.length; i += 4) img.data[i + 2] = img.data[i + 2] * 0.8; // yellow cast
    const out = flattenLighting(img);
    const i = (10 * 200 + 10) * 4;
    expect(Math.abs(out.data[i] - out.data[i + 2])).toBeLessThan(6);
  });

  it("runs the whole pipeline and keeps ink dark and paper white", () => {
    const out = cleanPage(rotate(textPage(300, 300), 4)).img;
    const g = toGray(out);
    expect(g[10 * 300 + 150]).toBeGreaterThan(240); // margin
    expect(mean(g)).toBeGreaterThan(150);
    expect(Math.min(...g)).toBeLessThan(60);
  });
});
