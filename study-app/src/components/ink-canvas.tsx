"use client";
import clsx from "clsx";
import { Eraser, Highlighter, PenLine, Redo2, Trash2, Undo2 } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * Pressure-sensitive drawing surface tuned for Apple Pencil.
 * - Palm rejection: once a pen is detected, finger touches don't draw.
 * - Uses coalesced pointer events for smooth, low-latency strokes.
 * - "focus" highlighter draws in a reserved magenta that the AI reader
 *   understands as "quiz me harder on this".
 * Strokes are kept as vectors in a fixed logical coordinate space so the
 * page exports at full resolution whatever the screen size.
 */

export type InkTool = "pen" | "focus" | "eraser";
export const FOCUS_COLOR = "#ff00d4";
const PEN_COLORS = ["#111111", "#1d4ed8", "#dc2626", "#047857"];

interface Point {
  x: number;
  y: number;
  p: number;
}
interface Stroke {
  tool: "pen" | "focus";
  color: string;
  size: number;
  points: Point[];
}

export interface InkCanvasHandle {
  /** Background + strokes composited at logical resolution. */
  exportCanvas: () => HTMLCanvasElement;
  isEmpty: () => boolean;
  hasFocusMarks: () => boolean;
  clear: () => void;
}

interface Props {
  width: number;
  height: number;
  background?: HTMLCanvasElement | HTMLImageElement | ImageBitmap | null;
  tools?: InkTool[];
  initialTool?: InkTool;
  ruled?: boolean;
  className?: string;
  onChange?: () => void;
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const pts = s.points;
  if (!pts.length) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.tool === "focus") {
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (pts.length === 1) ctx.lineTo(pts[0].x + 0.1, pts[0].y);
    ctx.stroke();
  } else {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, (s.size * (0.5 + pts[0].p)) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Variable width: draw each smoothed segment with its own pressure width.
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      ctx.lineWidth = s.size * (0.45 + 0.9 * ((a.p + b.p) / 2));
      ctx.beginPath();
      const prevMid = i > 1 ? { x: (pts[i - 2].x + a.x) / 2, y: (pts[i - 2].y + a.y) / 2 } : a;
      ctx.moveTo(prevMid.x, prevMid.y);
      ctx.quadraticCurveTo(a.x, a.y, mid.x, mid.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function hitStroke(s: Stroke, x: number, y: number, r: number) {
  return s.points.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= (r + s.size / 2) ** 2);
}

export const InkCanvas = forwardRef<InkCanvasHandle, Props>(function InkCanvas(
  { width, height, background, tools = ["pen", "focus", "eraser"], initialTool, ruled, className, onChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const redo = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const penSeen = useRef(false);
  const activePointer = useRef<number | null>(null);
  const [tool, setTool] = useState<InkTool>(initialTool ?? tools[0]);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [, force] = useState(0);

  const paint = useCallback(
    (target?: HTMLCanvasElement, forExport = false) => {
      const canvas = target ?? canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      if (background) ctx.drawImage(background, 0, 0, width, height);
      else if (ruled) {
        ctx.strokeStyle = forExport ? "#e5e7eb" : "#dbe3f0";
        ctx.lineWidth = 1.5;
        for (let y = 120; y < height; y += 56) {
          ctx.beginPath();
          ctx.moveTo(40, y);
          ctx.lineTo(width - 40, y);
          ctx.stroke();
        }
      }
      for (const s of strokes.current) drawStroke(ctx, s);
      if (current.current) drawStroke(ctx, current.current);
    },
    [background, height, ruled, width],
  );

  // Keep the backing store sharp for the screen's pixel density.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      paint();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [paint]);

  const toLogical = (e: PointerEvent | React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const pressure = e.pointerType === "pen" ? e.pressure || 0.5 : 0.5;
    return { x: ((e.clientX - rect.left) / rect.width) * width, y: ((e.clientY - rect.top) / rect.height) * height, p: pressure };
  };

  const eraseAt = (pt: Point) => {
    const before = strokes.current.length;
    strokes.current = strokes.current.filter((s) => !hitStroke(s, pt.x, pt.y, 18));
    if (strokes.current.length !== before) {
      paint();
      onChange?.();
    }
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "pen") penSeen.current = true;
    // Palm rejection: after a Pencil is seen, fingers scroll instead of drawing.
    if (penSeen.current && e.pointerType === "touch") return;
    if (activePointer.current !== null) return;
    activePointer.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = toLogical(e);
    if (tool === "eraser" || e.button === 5) {
      eraseAt(pt);
      return;
    }
    current.current =
      tool === "focus"
        ? { tool: "focus", color: FOCUS_COLOR, size: 34, points: [pt] }
        : { tool: "pen", color, size: 4.2, points: [pt] };
    paint();
  };

  const onMove = (e: React.PointerEvent) => {
    if (activePointer.current !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    if (tool === "eraser" && !current.current) {
      for (const ev of events) eraseAt(toLogical(ev));
      return;
    }
    if (!current.current) return;
    for (const ev of events) current.current.points.push(toLogical(ev));
    paint();
  };

  const onUp = (e: React.PointerEvent) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    if (current.current) {
      strokes.current.push(current.current);
      current.current = null;
      redo.current = [];
      paint();
      onChange?.();
      force((n) => n + 1);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      exportCanvas: () => {
        const out = document.createElement("canvas");
        out.width = width;
        out.height = height;
        paint(out, true);
        return out;
      },
      isEmpty: () => strokes.current.length === 0,
      hasFocusMarks: () => strokes.current.some((s) => s.tool === "focus"),
      clear: () => {
        strokes.current = [];
        redo.current = [];
        paint();
        force((n) => n + 1);
      },
    }),
    [height, paint, width],
  );

  const undo = () => {
    const s = strokes.current.pop();
    if (s) redo.current.push(s);
    paint();
    onChange?.();
    force((n) => n + 1);
  };
  const doRedo = () => {
    const s = redo.current.pop();
    if (s) strokes.current.push(s);
    paint();
    onChange?.();
    force((n) => n + 1);
  };

  const toolBtn = (t: InkTool, icon: React.ReactNode, label: string) =>
    tools.includes(t) && (
      <button
        type="button"
        aria-label={label}
        aria-pressed={tool === t}
        onClick={() => setTool(t)}
        className={clsx(
          "flex size-10 items-center justify-center rounded-xl transition",
          tool === t ? "bg-primary text-primary-fg" : "hover:bg-primary-soft",
        )}
      >
        {icon}
      </button>
    );

  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-line bg-elev p-1.5">
        {toolBtn("pen", <PenLine className="size-5" />, "Pen")}
        {toolBtn("focus", <Highlighter className="size-5" style={{ color: tool === "focus" ? undefined : FOCUS_COLOR }} />, "Focus highlighter: quiz me harder on this")}
        {toolBtn("eraser", <Eraser className="size-5" />, "Eraser")}
        {tools.includes("pen") && tool === "pen" && (
          <div className="ml-1 flex items-center gap-1">
            {PEN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Ink color ${c}`}
                onClick={() => setColor(c)}
                className={clsx("size-7 rounded-full border-2", color === c ? "border-primary" : "border-transparent")}
                style={{ background: c }}
              />
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-label="Undo" onClick={undo} disabled={!strokes.current.length} className="flex size-10 items-center justify-center rounded-xl hover:bg-primary-soft disabled:opacity-40">
            <Undo2 className="size-5" />
          </button>
          <button type="button" aria-label="Redo" onClick={doRedo} disabled={!redo.current.length} className="flex size-10 items-center justify-center rounded-xl hover:bg-primary-soft disabled:opacity-40">
            <Redo2 className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Clear page"
            onClick={() => {
              strokes.current = [];
              paint();
              onChange?.();
              force((n) => n + 1);
            }}
            className="flex size-10 items-center justify-center rounded-xl hover:bg-danger-soft"
          >
            <Trash2 className="size-5" />
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        data-testid="ink-canvas"
        className="ink-surface w-full rounded-2xl border border-line bg-white shadow-card"
        style={{ aspectRatio: `${width} / ${height}`, cursor: tool === "eraser" ? "cell" : "crosshair" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {tools.includes("focus") && (
        <p className="text-xs text-muted">
          <span className="font-semibold" style={{ color: FOCUS_COLOR }}>
            Focus highlighter:
          </span>{" "}
          circle or highlight anything you want to be quizzed on harder.
        </p>
      )}
    </div>
  );
});
