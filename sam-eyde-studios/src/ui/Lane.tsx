import { useEffect, useRef } from "react";
import type { Peaks } from "../audio/peaks";
import { useStore } from "../state/store";
import { peaks, seek, startAudio } from "../studio/controller";
import { clipLength, clipStart, type View } from "../studio/timeline";
import type { Project, Track } from "../types";
import { useView } from "./useView";

export const LANE_HEIGHT = 68;

function setupCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return g;
}

function drawGrid(g: CanvasRenderingContext2D, w: number, h: number, view: View, bpm: number) {
  const bar = (60 / bpm) * 4;
  let step = bar;
  while (step * view.pps < 14) step *= 2;
  g.fillStyle = "rgba(255,255,255,0.05)";
  const first = Math.ceil(view.scroll / step);
  for (let i = first; i * step < view.scroll + view.span; i++) {
    g.fillRect(Math.round((i * step - view.scroll) * view.pps), 0, 1, h);
  }
  void w;
}

function drawLane(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  track: Track,
  project: Project,
  pk: Peaks | undefined,
  view: View,
) {
  const g = setupCanvas(canvas, w, h);
  if (!g) return;
  drawGrid(g, w, h, view, project.bpm);
  const color = track.kind === "beat" ? "45,212,191" : "167,139,250";
  const x0 = (clipStart(track, project) - view.scroll) * view.pps;
  const cw = clipLength(track) * view.pps;
  const left = Math.max(0, x0);
  const right = Math.min(w, x0 + cw);
  if (right <= left) return;

  g.fillStyle = `rgba(${color},0.16)`;
  g.beginPath();
  g.roundRect(x0, 1, Math.max(2, cw), h - 2, 6);
  g.fill();
  g.strokeStyle = `rgba(${color},0.55)`;
  g.lineWidth = 1;
  g.stroke();

  if (!pk) return;
  const mid = h / 2;
  const amp = h / 2 - 4;
  g.fillStyle = `rgb(${color})`;
  const perPx = pk.rate / view.pps;
  for (let x = Math.floor(left); x < right; x++) {
    const t = track.trimStart + (x - x0) / view.pps;
    const a = Math.floor(t * pk.rate);
    const b = Math.max(a + 1, Math.floor(t * pk.rate + perPx));
    let lo = 0;
    let hi = 0;
    for (let i = Math.max(0, a); i < b && i < pk.min.length; i++) {
      if (pk.min[i] < lo) lo = pk.min[i];
      if (pk.max[i] > hi) hi = pk.max[i];
    }
    const y1 = mid - Math.min(1, hi) * amp;
    const y2 = mid - Math.max(-1, lo) * amp;
    g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }
}

export function Lane({ track }: { track: Track }) {
  const project = useStore((s) => s.project);
  const ready = useStore((s) => s.ui.audioReady[track.audioId]);
  const view = useView();
  const ref = useRef<HTMLCanvasElement>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (ref.current && project) {
      drawLane(ref.current, view.width, LANE_HEIGHT, track, project, peaks.get(track.audioId), view);
    }
  }, [track, project, ready, view.pps, view.scroll, view.width, view.span]);

  return (
    <div
      className="lane"
      style={{ height: LANE_HEIGHT }}
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const d = down.current;
        down.current = null;
        if (!d || Math.abs(e.clientX - d.x) > 8 || Math.abs(e.clientY - d.y) > 8) return;
        startAudio();
        const rect = e.currentTarget.getBoundingClientRect();
        seek(view.scroll + (e.clientX - rect.left) / view.pps);
      }}
    >
      <canvas ref={ref} style={{ width: view.width, height: LANE_HEIGHT }} />
      <div className="playhead" />
    </div>
  );
}

/** Time ruler above the tracks: tap or drag to move the playhead. */
export function Ruler() {
  const bpm = useStore((s) => s.project?.bpm ?? 120);
  const view = useView();
  const ref = useRef<HTMLCanvasElement>(null);
  const H = 26;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = setupCanvas(canvas, view.width, H);
    if (!g) return;
    const bar = (60 / bpm) * 4;
    let step = 1;
    while (step * bar * view.pps < 34) step *= 2;
    g.font = "10px -apple-system, system-ui, sans-serif";
    g.textBaseline = "top";
    const first = Math.ceil(view.scroll / (bar * step));
    for (let i = first; i * step * bar < view.scroll + view.span; i++) {
      const x = Math.round((i * step * bar - view.scroll) * view.pps);
      g.fillStyle = "rgba(255,255,255,0.28)";
      g.fillRect(x, H - 9, 1, 9);
      g.fillStyle = "rgba(255,255,255,0.5)";
      g.fillText(String(i * step + 1), x + 3, 4);
    }
  }, [bpm, view.pps, view.scroll, view.width, view.span]);

  const seekTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seek(view.scroll + Math.max(0, e.clientX - rect.left) / view.pps);
  };

  return (
    <div
      className="ruler"
      style={{ height: H }}
      onPointerDown={(e) => {
        startAudio();
        e.currentTarget.setPointerCapture(e.pointerId);
        seekTo(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons || e.pointerType === "touch") {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekTo(e);
        }
      }}
    >
      <canvas ref={ref} style={{ width: view.width, height: H }} />
      <div className="playhead head" />
    </div>
  );
}
