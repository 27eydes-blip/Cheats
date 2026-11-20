"use client";

import { useEffect, useRef, useState } from "react";

const RATIOS: [string, number | null][] = [["Original", null], ["Square", 1], ["4:5", 4 / 5], ["16:9", 16 / 9]];

/**
 * Simple crop: pick a frame shape, drag the photo to position it, zoom with
 * the slider. Produces a new image file in the browser (nothing uploads until
 * you post).
 */
export function CropDialog({ src, file, onDone, onCancel }: { src: string; file: File; onDone: (f: File, url: string) => void; onCancel: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [ratio, setRatio] = useState<number | null>(1);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const FRAME = 300;

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);
  useEffect(() => setOff({ x: 0, y: 0 }), [ratio]);
  if (!img) return null;

  const r = ratio ?? img.width / img.height;
  const fw = r >= 1 ? FRAME : FRAME * r;
  const fh = r >= 1 ? FRAME / r : FRAME;
  // Image scaled to cover the frame, then zoomed.
  const base = Math.max(fw / img.width, fh / img.height);
  const s = base * zoom;
  const iw = img.width * s;
  const ih = img.height * s;
  const clamp = (o: { x: number; y: number }) => ({ x: Math.min((iw - fw) / 2, Math.max(-(iw - fw) / 2, o.x)), y: Math.min((ih - fh) / 2, Math.max(-(ih - fh) / 2, o.y)) });
  const o = clamp(off);

  const apply = async () => {
    const outW = Math.round(Math.min(2048, fw / s));
    const outH = Math.round(outW / r);
    const c = document.createElement("canvas");
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext("2d")!;
    const sx = (iw / 2 - fw / 2 - o.x) / s;
    const sy = (ih / 2 - fh / 2 - o.y) / s;
    ctx.drawImage(img, sx, sy, fw / s, fh / s, 0, 0, outW, outH);
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), type, 0.92));
    const f = new File([blob], file.name.replace(/\.\w+$/, type === "image/png" ? ".png" : ".jpg"), { type });
    onDone(f, URL.createObjectURL(f));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgb(3_6_12/0.8)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Crop image" onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <div className="card w-full max-w-[380px] p-4">
        <h2 className="font-display text-[22px] font-extrabold uppercase">Crop</h2>
        <div className="mt-3 flex gap-1.5">
          {RATIOS.map(([label, v]) => (
            <button key={label} type="button" onClick={() => setRatio(v)} aria-pressed={ratio === v} className={`min-h-9 flex-1 rounded-[9px] text-[12.5px] font-bold ${ratio === v ? "bg-[var(--wn-blue-fill)] text-white" : "text-ink-2 ring-1 ring-rule"}`}>{label}</button>
          ))}
        </div>
        <div className="mt-3 flex h-[300px] items-center justify-center">
          <div
            className="relative touch-none overflow-hidden rounded-[10px] ring-2 ring-[var(--wn-cyan)]"
            style={{ width: fw, height: fh, cursor: "grab" }}
            onPointerDown={(e) => ((e.target as Element).setPointerCapture(e.pointerId), (drag.current = { x: e.clientX, y: e.clientY, ox: o.x, oy: o.y }))}
            onPointerMove={(e) => drag.current && setOff(clamp({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }))}
            onPointerUp={() => (drag.current = null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" draggable={false} className="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none" style={{ width: iw, height: ih, transform: `translate(calc(-50% + ${o.x}px), calc(-50% + ${o.y}px))` }} />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_33%,rgb(255_255_255/0.25)_33%,rgb(255_255_255/0.25)_calc(33%+1px),transparent_calc(33%+1px),transparent_66%,rgb(255_255_255/0.25)_66%,rgb(255_255_255/0.25)_calc(66%+1px),transparent_calc(66%+1px)),linear-gradient(90deg,transparent_33%,rgb(255_255_255/0.25)_33%,rgb(255_255_255/0.25)_calc(33%+1px),transparent_calc(33%+1px),transparent_66%,rgb(255_255_255/0.25)_66%,rgb(255_255_255/0.25)_calc(66%+1px),transparent_calc(66%+1px))]" />
          </div>
        </div>
        <label className="mt-3 flex items-center gap-3 text-[13px] text-ink-2">Zoom
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[var(--wn-blue)]" />
        </label>
        <p className="mt-1 text-[12px] text-ink-3">Drag the photo to position it.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
          <button type="button" onClick={apply} className="btn-primary">Apply crop</button>
        </div>
      </div>
    </div>
  );
}
