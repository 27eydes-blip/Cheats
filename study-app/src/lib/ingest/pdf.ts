"use client";

/**
 * Renders each PDF page to an image (for the side-by-side view and the AI)
 * and keeps the PDF's own text layer as a hint for the reader.
 */
export async function pdfToPages(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<{ canvas: HTMLCanvasElement; text: string }[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: { canvas: HTMLCanvasElement; text: string }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, 1800 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const content = await page.getTextContent();
    const text = content.items
      .map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : ""))
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
    out.push({ canvas, text });
    onProgress?.(n, doc.numPages);
  }
  return out;
}
