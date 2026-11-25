// Pure helpers for the Planner page (and its tests): time zones, positions and overlaps.
// Everything on the page is shown in the planner's time zone (America/Detroit by default),
// whatever time zone the phone or laptop itself is set to.

const fmts = new Map();
function parts(date, tz) {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
    fmts.set(tz, f);
  }
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, min: +o.minute, weekday: o.weekday };
}

const pad = (n) => String(n).padStart(2, "0");

/** An ISO instant -> { date: "YYYY-MM-DD", minutes: minutes after midnight } in the zone. */
export function isoToLocal(iso, tz) {
  const p = parts(new Date(iso), tz);
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, minutes: p.h * 60 + p.min };
}

/** A wall-clock time in the zone -> ISO instant (daylight saving handled). */
export function localToIso(date, minutes, tz) {
  const [y, m, d] = date.split("-").map(Number);
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  let guess = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(guess), tz);
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    const want = Date.UTC(y, m - 1, d, h, min);
    if (shown === want) break;
    guess += want - shown;
  }
  return new Date(guess).toISOString();
}

export const hhmmToMinutes = (s) => {
  const [h, m] = String(s).split(":").map(Number);
  return h * 60 + (m || 0);
};

export function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function weekdayOf(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "9:30 AM" */
export function clock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${pad(m)}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/** Which slot a point in a day column means: snapped to 15 minutes, inside waking hours. */
export function slotAt(offsetPx, { pxPerMin, startMin, endMin, snap = 15 }) {
  const raw = startMin + offsetPx / pxPerMin;
  const snapped = Math.round(raw / snap) * snap;
  return Math.max(startMin, Math.min(endMin - snap, snapped));
}

/** Top and height (px) of a timed block in a day column, clipped to waking hours. */
export function blockBox(startMin, endMin, { pxPerMin, dayStart, dayEnd, minHeight = 14 }) {
  const s = Math.max(dayStart, Math.min(dayEnd, startMin));
  const e = Math.max(dayStart, Math.min(dayEnd, endMin));
  return { top: (s - dayStart) * pxPerMin, height: Math.max(minHeight, (e - s) * pxPerMin), clipped: s !== startMin || e !== endMin };
}

/**
 * Side-by-side columns for overlapping blocks in one day: each gets { col, cols }.
 * Blocks are { start, end } in minutes. Greedy, in start order.
 */
export function layoutOverlaps(blocks) {
  const sorted = blocks.map((b, i) => ({ ...b, i })).sort((a, b) => a.start - b.start || b.end - a.end);
  const out = new Array(blocks.length);
  let group = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1));
    for (const g of group) out[g.i] = { col: g.col, cols };
    group = [];
  };
  const colEnds = [];
  for (const b of sorted) {
    if (b.start >= groupEnd && group.length) {
      flush();
      colEnds.length = 0;
    }
    let col = colEnds.findIndex((e) => e <= b.start);
    if (col < 0) col = colEnds.length;
    colEnds[col] = b.end;
    group.push({ ...b, col });
    groupEnd = Math.max(groupEnd, b.end);
  }
  if (group.length) flush();
  return out;
}

/** Hours and minutes, short: "3h 20m", "45m". */
export function shortHours(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
