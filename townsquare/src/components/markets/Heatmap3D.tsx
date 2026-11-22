"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FLAT_PCT, glowFor, HEAT_MODES, moveText, sectorAverage, tileFill, tileSpan, tiltFrom, topMovers, type HeatMode } from "@/lib/markets/heat";
import { SECTORS, STOCKS, type Ticker } from "@/lib/markets/universe";
import { useMedia } from "../ui/useMedia";
import { fmtPrice, useMarket } from "./MarketData";

/** Focus from the keyboard (not a tap), where the browser can tell us. */
function keyboardFocus(el: HTMLElement) {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

type CardAt = { symbol: string; x: number; y: number; below: boolean };
type TileProps = {
  t: Ticker;
  price: number | null;
  pct: number;
  high: number | null;
  low: number | null;
  flash: number;
  flashDir: 1 | -1 | 0;
  mover: boolean;
  mode: HeatMode;
  big: boolean;
  onShow: (symbol: string, el: HTMLElement) => void;
  onHide: () => void;
  onOpen: (symbol: string) => void;
};

/**
 * One raised tile. Memoized on plain values, so a price tick re-renders only
 * the tiles whose numbers changed (the parent passes no objects that change
 * identity per poll).
 */
const Tile = memo(function Tile({ t, price, pct, high, low, flash, flashDir, mover, mode, big, onShow, onHide, onOpen }: TileProps) {
  const g = glowFor(pct);
  const span = big ? { cols: 1, rows: 1 } : tileSpan(t.size, mode);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const [holding, setHolding] = useState(false);
  const label = `${t.name}, ${t.symbol}: ${price === null ? "no price yet" : `${fmtPrice(price)}, ${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(2)} percent`}. Open chart.`;
  const end = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
    if (held.current) setTimeout(() => (setHolding(false), onHide()), 1800);
  };
  return (
    <button
      type="button"
      data-symbol={t.symbol}
      data-mover={mover || undefined}
      data-held={holding || undefined}
      aria-label={label}
      onClick={(e) => {
        if (held.current) {
          held.current = false;
          e.preventDefault();
          return;
        }
        onOpen(t.symbol);
      }}
      onPointerEnter={(e) => e.pointerType === "mouse" && onShow(t.symbol, e.currentTarget)}
      onPointerLeave={(e) => e.pointerType === "mouse" && onHide()}
      onFocus={(e) => keyboardFocus(e.currentTarget) && onShow(t.symbol, e.currentTarget)}
      onBlur={onHide}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        held.current = false;
        const el = e.currentTarget;
        hold.current = setTimeout(() => {
          held.current = true;
          setHolding(true);
          onShow(t.symbol, el);
        }, 380);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
      className="hm-tile"
      style={{
        gridColumn: `span ${span.cols}`,
        gridRow: `span ${span.rows}`,
        ["--fill" as string]: g.fill,
        ["--lift" as string]: g.lift,
        ["--glow-a" as string]: g.alpha,
        ["--gc" as string]: g.dir < 0 ? "255 92 122" : "46 230 166",
      }}
    >
      {flash > 0 && <span key={flash} aria-hidden="true" className={flashDir > 0 ? "hm-flash hm-flash-up" : "hm-flash hm-flash-down"} />}
      <span className={`mono relative font-bold text-white ${span.cols > 1 && span.rows > 1 ? "text-[15px]" : big ? "text-[14px]" : "text-[11px]"}`}>{t.symbol}</span>
      {big && <span className="relative max-w-full truncate px-1 text-[10.5px] text-white/80">{t.name}</span>}
      <span className={`mono relative text-[10px] ${g.dir === 0 ? "text-white/75" : "text-white"}`}>{price === null ? "—" : moveText(pct)}</span>
      {mode === "cap" && span.rows > 1 && high !== null && low !== null && <span className="sr-only">Day range {fmtPrice(low)} to {fmtPrice(high)}</span>}
    </button>
  );
});

/**
 * The Markets heatmap as a lit glass floor of sector plates with raised tiles
 * (CSS 3D, no WebGL). Tile height and glow follow the size of the move;
 * hovering or touch-holding a tile lifts it and shows a card; a gentle pointer
 * tilt on desktop. Picking a sector zooms into it and filters the Big Board
 * below. Reduced motion and phones get a flat version of the same design.
 */
export function Heatmap3D() {
  const { quotes, ticks, select, sector, setSector } = useMarket();
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const flat = useMedia("(hover: none), (max-width: 640px)");
  const [mode, setMode] = useState<HeatMode>("cap");
  const [zoom, setZoom] = useState<string | null>(null);
  const [card, setCard] = useState<CardAt | null>(null);
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const tiltOn = !reduced && !flat;

  // Another sector filter (chips, sector board) moves the zoom with it.
  useEffect(() => {
    if (zoom && sector !== zoom) setZoom(sector || null);
  }, [sector, zoom]);

  const movers = useMemo(() => topMovers(STOCKS.map((t) => quotes[t.symbol]).filter((q) => !!q)), [quotes]);

  const onShow = useCallback((symbol: string, el: HTMLElement) => {
    const r = root.current?.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (!r) return;
    const below = b.top - r.top < 150;
    setCard({ symbol, x: Math.min(Math.max(b.left - r.left + b.width / 2, 130), r.width - 130), y: below ? b.bottom - r.top + 8 : b.top - r.top - 8, below });
  }, []);
  const onHide = useCallback(() => setCard(null), []);
  const onOpen = useCallback(
    (symbol: string) => {
      select(symbol);
      document.getElementById("focus-chart")?.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" });
    },
    [select, reduced],
  );

  const zoomTo = (key: string) => {
    setZoom(key);
    setSector(key);
    setCard(null);
    // A tap can land focus on the tile that slides under the finger; don't leave a card open for it.
    setTimeout(() => setCard(null), 50);
    root.current?.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };
  const back = () => {
    if (zoom && sector === zoom) setSector("");
    setZoom(null);
    setCard(null);
  };

  // Pointer tilt: written straight to CSS variables once per frame (no React renders).
  const onMove = (e: React.PointerEvent) => {
    if (!tiltOn || e.pointerType !== "mouse") return;
    const r = root.current!.getBoundingClientRect();
    const { rx, ry } = tiltFrom((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      stage.current?.style.setProperty("--rx", `${rx}deg`);
      stage.current?.style.setProperty("--ry", `${ry}deg`);
    });
  };
  const onLeave = () => {
    cancelAnimationFrame(frame.current);
    stage.current?.style.setProperty("--rx", "0deg");
    stage.current?.style.setProperty("--ry", "0deg");
  };

  const plates = zoom ? SECTORS.filter((s) => s.key === zoom) : SECTORS;
  const cq = card ? quotes[card.symbol] : null;
  const ct = card ? STOCKS.find((t) => t.symbol === card.symbol) : null;

  return (
    <section
      ref={root}
      aria-labelledby="heat"
      data-reduced={reduced || undefined}
      data-flat={flat || undefined}
      data-zoomed={zoom || undefined}
      className="hm-floor scroll-mt-20"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onKeyDown={(e) => e.key === "Escape" && zoom && (e.stopPropagation(), back())}
    >
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-3">
          {zoom && (
            <button type="button" onClick={back} className="inline-flex h-11 items-center gap-1 rounded-[10px] border border-white/15 px-3 text-[13px] font-semibold text-white hover:border-white/35">
              ← Back <span className="sr-only">to all sectors</span>
            </button>
          )}
          <h2 id="heat" className="folio text-[var(--wn-cyan-ink)]">{zoom ? `Heatmap · ${zoom}` : `Heatmap · ${STOCKS.length} stocks`}</h2>
        </div>
        <div role="group" aria-label="Tile size" className="mono flex gap-1 rounded-[10px] bg-black/40 p-1">
          {HEAT_MODES.map((m) => (
            <button key={m.key} type="button" aria-pressed={mode === m.key} onClick={() => setMode(m.key)} className={`min-h-9 rounded-[8px] px-2.5 text-[11.5px] font-bold ${mode === m.key ? "bg-[var(--wn-blue-fill)] text-white" : "text-white/65 hover:text-white"}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <Legend />

      <div ref={stage} className="hm-stage relative z-10 px-3 pt-3 pb-5 sm:px-4">
        <div className={zoom ? "hm-zoom" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"}>
          {plates.map((s) => {
            const list = STOCKS.filter((t) => t.sector === s.key);
            const avg = sectorAverage(list, quotes);
            const big = !!zoom;
            return (
              <div key={s.key} className="hm-plate">
                <div className="flex items-center justify-between gap-2 px-2.5 pt-1">
                  {big ? (
                    <p className="flex min-h-11 items-center gap-2 text-[14px] font-bold text-white">{s.key}</p>
                  ) : (
                    <button type="button" onClick={() => zoomTo(s.key)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-[12.5px] font-bold text-white hover:text-[var(--wn-cyan-ink)]" aria-label={`${s.key}: ${avg === null ? "no prices yet" : `average ${avg >= 0 ? "up" : "down"} ${Math.abs(avg).toFixed(2)} percent`}. Zoom in and filter the Big Board.`}>
                      <span className="truncate">{s.key}</span>
                      <span aria-hidden="true" className="text-[10px] text-white/45">⤢</span>
                    </button>
                  )}
                  <span className={`mono shrink-0 text-[11.5px] font-bold ${avg === null || Math.abs(avg) < FLAT_PCT ? "text-white/70" : avg > 0 ? "text-[#2ee6a6]" : "text-[#ff7a92]"}`}>{avg === null ? "—" : moveText(avg)}</span>
                </div>
                <div className={`grid grid-flow-dense gap-[4px] p-2 pt-1 ${big ? "auto-rows-[64px] grid-cols-3 sm:grid-cols-5 lg:grid-cols-8" : "auto-rows-[44px] grid-cols-4"}`}>
                  {list.map((t) => {
                    const q = quotes[t.symbol];
                    const tick = ticks[t.symbol];
                    return (
                      <Tile key={t.symbol} t={t} price={q?.price ?? null} pct={q?.changePct ?? 0} high={q?.high ?? null} low={q?.low ?? null} flash={tick?.n ?? 0} flashDir={tick?.dir ?? 0} mover={movers.has(t.symbol)} mode={mode} big={big} onShow={onShow} onHide={onHide} onOpen={onOpen} />
                    );
                  })}
                </div>
                {big && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 pb-2.5">
                    <p className="text-[12px] text-white/60">{list.length} stocks · the Big Board below is filtered to {s.key}.</p>
                    <button type="button" onClick={() => document.getElementById("big-board")?.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" })} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[var(--wn-cyan-ink)] hover:underline">See them in the table ↓</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {card && cq && ct && (
        <div role="tooltip" className="hm-card" style={{ left: card.x, top: card.y, transform: `translate(-50%, ${card.below ? "0" : "-100%"})` }}>
          <p className="text-[13.5px] font-bold text-white">{ct.name} <span className="mono text-[12px] font-semibold text-white/60">{ct.symbol}</span></p>
          <p className="mono mt-1 text-[18px] text-white">{fmtPrice(cq.price)} <span className={`text-[13px] font-bold ${cq.changePct >= 0 ? "text-[#2ee6a6]" : "text-[#ff7a92]"}`}>{moveText(cq.changePct)}</span></p>
          <p className="mono mt-1 text-[11px] text-white/60">DAY {fmtPrice(cq.low)} – {fmtPrice(cq.high)} · CHG {cq.change >= 0 ? "+" : ""}{cq.change.toFixed(2)}</p>
          <p className="mt-0.5 text-[11px] text-white/60">{ct.sector}</p>
        </div>
      )}
    </section>
  );
}

/** Color scale (−3% to +3%) and glow scale (small, medium, big move). */
function Legend() {
  const swatch = (pct: number) => {
    const g = glowFor(pct);
    return <span className="hm-swatch" style={{ ["--fill" as string]: g.fill, ["--glow-a" as string]: g.alpha, ["--gc" as string]: "46 230 166" }} />;
  };
  return (
    <div className="relative z-10 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 pt-3 text-[10.5px] text-white/60" aria-label="Legend">
      <span className="mono flex items-center gap-1.5">
        ▼ −3%
        <span className="h-2 w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${tileFill(-1, 1)}, ${tileFill(0, 0)}, ${tileFill(1, 1)})` }} />
        +3% ▲
      </span>
      <span className="flex items-center gap-1.5">
        <span className="mono">GLOW</span> {swatch(0.3)} small {swatch(1)} medium {swatch(3)} big move
      </span>
      <span>Market cap mode sizes tiles by company size</span>
    </div>
  );
}
