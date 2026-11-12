import { uvLevel, type Conditions } from "@/lib/weather";

const UV_TEXT: Record<string, string> = {
  low: "text-uv-low",
  moderate: "text-uv-moderate",
  high: "text-uv-high",
  veryhigh: "text-uv-veryhigh",
  extreme: "text-uv-extreme",
};
const UV_BG: Record<string, string> = {
  low: "bg-uv-low/15 text-uv-low ring-uv-low/30",
  moderate: "bg-uv-moderate/15 text-uv-moderate ring-uv-moderate/30",
  high: "bg-uv-high/15 text-uv-high ring-uv-high/30",
  veryhigh: "bg-uv-veryhigh/15 text-uv-veryhigh ring-uv-veryhigh/30",
  extreme: "bg-uv-extreme/15 text-uv-extreme ring-uv-extreme/30",
};

function tickerItems(c: Conditions, cityName: string) {
  const uv = uvLevel(c.uvNow);
  const items: { k: string; v: string; cls?: string }[] = [
    { k: cityName.toUpperCase(), v: `${c.icon} ${c.tempF}°F ${c.desc}` },
    { k: "FEELS", v: `${c.feelsF}°` },
    { k: "UV", v: `${c.uvNow} ${uv.label.toUpperCase()}`, cls: UV_TEXT[uv.key] },
    { k: "WIND", v: `${c.windMph} MPH ${c.windDir}${c.gustMph && c.gustMph > c.windMph + 4 ? ` · GUSTS ${c.gustMph}` : ""}` },
  ];
  if (c.rainNext6h !== null) items.push({ k: "RAIN 6H", v: `${c.rainNext6h}%` });
  if (c.waterF !== null) items.push({ k: "WATER", v: `${c.waterF}°F` });
  if (c.wavesFt !== null) items.push({ k: "WAVES", v: `${c.wavesFt} FT` });
  if (c.highF !== null && c.lowF !== null) items.push({ k: "HI/LO", v: `${c.highF}° / ${c.lowF}°` });
  if (c.sunset) items.push({ k: c.isDay ? "SUNSET" : "SUNRISE", v: (c.isDay ? c.sunset : c.sunrise) ?? "" });
  return items;
}

/** Scrolling live-conditions ticker. Pure CSS; static and swipeable with reduced motion. */
export function WeatherTicker({ c, cityName }: { c: Conditions; cityName: string }) {
  const items = tickerItems(c, cityName);
  const row = (hidden: boolean) => (
    <div className="ticker-row" aria-hidden={hidden || undefined}>
      {items.map((it, i) => (
        <span key={i} className="flex shrink-0 items-baseline gap-1.5 pr-6">
          <span className="text-[10px] tracking-[0.18em] text-muted">{it.k}</span>
          <span className={`font-semibold ${it.cls ?? "text-zinc-100"}`}>{it.v}</span>
          <span className="pl-4 text-gold/40">◆</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="ticker border-y border-line bg-panel/80 font-mono text-[12px]" role="marquee" aria-label={`Live conditions in ${cityName}`}>
      <span className="ticker-live">
        <span className="live-dot" /> LIVE
      </span>
      <div className="ticker-viewport">
        <div className="ticker-track">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </div>
  );
}

/** Conditions dashboard at the top of the guide: temp, UV gauge + advice, hourly strip. */
export function ConditionsPanel({ c, cityName }: { c: Conditions; cityName: string }) {
  const uv = uvLevel(c.uvNow);
  const pos = Math.min(100, (Math.min(c.uvNow, 12) / 12) * 100);
  return (
    <section aria-label="Live conditions" className="hud relative overflow-hidden rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted">
            <span className="live-dot mr-1.5" />
            {cityName.toUpperCase()} · NOW
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-serif text-5xl leading-none text-white">{c.tempF}°</span>
            <span className="text-2xl">{c.icon}</span>
          </div>
          <p className="mt-1 text-sm text-zinc-300">
            {c.desc} · feels {c.feelsF}°
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-right font-mono text-[11px]">
          {c.highF !== null && (
            <>
              <dt className="text-muted">HI/LO</dt>
              <dd className="text-zinc-200">
                {c.highF}°/{c.lowF}°
              </dd>
            </>
          )}
          <dt className="text-muted">WIND</dt>
          <dd className="text-zinc-200">
            {c.windMph} {c.windDir}
          </dd>
          {c.waterF !== null && (
            <>
              <dt className="text-muted">WATER</dt>
              <dd className="text-zinc-200">{c.waterF}°F</dd>
            </>
          )}
          {c.wavesFt !== null && (
            <>
              <dt className="text-muted">WAVES</dt>
              <dd className="text-zinc-200">{c.wavesFt} ft</dd>
            </>
          )}
          {c.sunset && (
            <>
              <dt className="text-muted">SUNSET</dt>
              <dd className="text-gold-soft">{c.sunset}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between font-mono text-[11px]">
          <span className="tracking-[0.18em] text-muted">UV INDEX</span>
          <span className={`font-semibold ${UV_TEXT[uv.key]}`}>
            {c.uvNow} · {uv.label.toUpperCase()}
            {c.uvMax !== null && c.uvMax > c.uvNow && <span className="text-muted"> · MAX TODAY {c.uvMax}</span>}
          </span>
        </div>
        <div className="uv-bar relative mt-2 h-2 rounded-full">
          <span className="uv-marker" style={{ left: `${pos}%` }} />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[9px] text-zinc-600">
          <span>0</span>
          <span>3</span>
          <span>6</span>
          <span>8</span>
          <span>11+</span>
        </div>
        <p className="mt-2 text-[13px] text-zinc-300">{uv.advice}</p>
      </div>

      {c.hourly.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-4 flex gap-1 overflow-x-auto border-t border-line px-4 pt-3">
          {c.hourly.map((h, i) => {
            const lv = uvLevel(h.uv);
            return (
              <div key={i} className="flex min-w-[3.4rem] flex-1 flex-col items-center gap-1 font-mono text-[11px]">
                <span className="text-muted">{i === 0 ? "NOW" : h.label}</span>
                <span className="text-base">{h.icon}</span>
                <span className="text-zinc-100">{h.tempF}°</span>
                <span className={`rounded px-1 ring-1 ${UV_BG[lv.key]}`}>UV {h.uv}</span>
                {h.rain !== null && <span className={h.rain >= 40 ? "text-sky-300" : "text-zinc-500"}>{h.rain}%</span>}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 font-mono text-[9px] tracking-wider text-zinc-600">LIVE DATA · OPEN-METEO · READING {c.observedAt}</p>
    </section>
  );
}

/** One-line beach conditions under the Beaches heading. */
export function BeachLine({ c }: { c: Conditions }) {
  const uv = uvLevel(c.uvNow);
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px]">
      <span className={`rounded px-1.5 py-0.5 ring-1 ${UV_BG[uv.key]}`}>
        UV {c.uvNow} {uv.label.toUpperCase()}
      </span>
      {c.waterF !== null && <span className="py-0.5 text-sky-300">WATER {c.waterF}°F</span>}
      {c.wavesFt !== null && <span className="py-0.5 text-zinc-300">WAVES {c.wavesFt} FT</span>}
      {c.sunset && <span className="py-0.5 text-gold-soft">SUNSET {c.sunset}</span>}
    </p>
  );
}
