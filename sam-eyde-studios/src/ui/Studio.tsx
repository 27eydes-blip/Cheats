import { useEffect, useRef } from "react";
import { rememberLatency, setUi, updateProject, useStore } from "../state/store";
import { importFile, startAudio, tick } from "../studio/controller";
import { computeView, projectDuration } from "../studio/timeline";
import type { TrackKind } from "../types";
import { formatTime } from "../util";
import { Header } from "./Header";
import { IconMic, IconMinus, IconMusic, IconPlus } from "./Icons";
import { LANE_HEIGHT, Ruler } from "./Lane";
import { TrackCard } from "./TrackCard";
import { Transport } from "./Transport";
import { getState } from "../state/store";

function ImportButton({ kind, children }: { kind: TrackKind; children: React.ReactNode }) {
  return (
    <label className="btn import" aria-label={`Import ${kind}`} onClick={() => startAudio()}>
      {children}
      <input
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac"
        data-import={kind}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importFile(file, kind);
        }}
      />
    </label>
  );
}

function RecordingLane() {
  return (
    <section className="track vocal recording-track">
      <div className="track-head">
        <span className="rec-badge">● REC</span>
        <span className="track-name static">New take</span>
      </div>
      <div className="lane" style={{ height: LANE_HEIGHT }}>
        <div className="rec-region" />
        <div className="playhead" />
      </div>
    </section>
  );
}

export function Studio({
  headerLeft,
  headerRight,
  extra,
}: {
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const project = useStore((s) => s.project);
  const recording = useStore((s) => s.ui.recording);
  const countingIn = useStore((s) => s.ui.countingIn);
  const zoom = useStore((s) => s.ui.zoom);
  const loading = useStore((s) => s.ui.loading);
  const tracksRef = useRef<HTMLDivElement>(null);
  const recStart = useRef(0);

  // Measure the lane width (all lanes share one timeline scale).
  useEffect(() => {
    const el = tracksRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(120, Math.floor(el.clientWidth - 24));
      if (w !== getState().ui.laneWidth) setUi({ laneWidth: w });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // One animation loop drives the playhead and the clock without re-rendering React.
  useEffect(() => {
    let raf = 0;
    let lastText = "";
    let lastTotal = "";
    const loop = () => {
      const pos = tick();
      const s = getState();
      const dur = projectDuration(s.project);
      const view = computeView(dur, s.ui.minViewSec, s.ui.laneWidth, s.ui.zoom, s.ui.scrollSec);
      const el = tracksRef.current;
      if (el) {
        const x = (pos - view.scroll) * view.pps;
        el.style.setProperty("--ph", `${x.toFixed(1)}px`);
        el.style.setProperty("--ph-show", x < -1 || x > s.ui.laneWidth + 1 ? "0" : "1");
        if (s.ui.recording) {
          if (!recStart.current || pos < recStart.current) recStart.current = pos;
          el.style.setProperty("--rec-x", `${((recStart.current - view.scroll) * view.pps).toFixed(1)}px`);
          el.style.setProperty("--rec-w", `${Math.max(2, (pos - recStart.current) * view.pps).toFixed(1)}px`);
        } else recStart.current = 0;
      }
      const text = formatTime(pos);
      if (text !== lastText) {
        const now = document.getElementById("time-now");
        if (now) now.textContent = text;
        lastText = now ? text : "";
      }
      const total = `/ ${formatTime(dur)}`;
      if (total !== lastTotal) {
        const node = document.getElementById("time-total");
        if (node) node.textContent = total;
        lastTotal = total;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!project) return null;
  const dur = projectDuration(project);
  const setZoom = (z: number) => {
    const next = Math.max(1, Math.min(32, z));
    const s = getState();
    const span = Math.max(dur * 1.04, s.ui.minViewSec, 20) / next;
    setUi({ zoom: next, scrollSec: Math.max(0, tick() - span / 2) });
  };

  return (
    <div className="studio">
      <Header left={headerLeft} right={headerRight} />
      <main className="main">
        <div className="toolbar">
          <ImportButton kind="beat">
            <IconMusic />
            <span>
              <span className="wide-only">Import </span>beat
            </span>
          </ImportButton>
          <ImportButton kind="vocal">
            <IconMic />
            <span>
              <span className="wide-only">Import </span>vocal
            </span>
          </ImportButton>
          <span className="spacer" />
          <div className="zoom" role="group" aria-label="Zoom">
            <button type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(zoom / 2)}>
              <IconMinus />
            </button>
            <button type="button" aria-label="Zoom in" disabled={zoom >= 32} onClick={() => setZoom(zoom * 2)}>
              <IconPlus />
            </button>
          </div>
        </div>

        <div className="tracks" ref={tracksRef}>
          <div className="ruler-wrap">
            <Ruler />
          </div>
          {project.tracks.map((t) => (
            <TrackCard key={t.id} track={t} />
          ))}
          {recording && !countingIn && <RecordingLane />}
          {project.tracks.length === 0 && !recording && (
            <div className="empty">
              <p className="empty-title">Start your session</p>
              <p>
                Import a beat, then hit the red button to record a take over it. Use headphones so the beat
                doesn't bleed into the mic.
              </p>
            </div>
          )}
        </div>

        <section className="panel">
          <label className="slider-row tall">
            <span className="slider-label wide">Latency fix</span>
            <input
              type="range"
              min={0}
              max={400}
              step={5}
              value={project.latencyMs}
              aria-label="Latency compensation"
              onChange={(e) => {
                const ms = Number(e.target.value);
                updateProject({ latencyMs: ms });
                rememberLatency(ms);
              }}
            />
            <span className="slider-value">{project.latencyMs} ms</span>
          </label>
          <p className="hint">
            Drag a take left or right to move it, or pull its white edge handles to trim. Zoom in (+) for fine
            moves.
          </p>
          <p className="hint">
            Latency fix shifts recorded takes earlier so they sit on the beat. If your takes sound late, raise it; if
            they sound early, lower it.
          </p>
        </section>
        {extra}
      </main>
      {loading && (
        <div className="busy" role="status">
          <span className="spinner" /> Working…
        </div>
      )}
      <Transport />
    </div>
  );
}
