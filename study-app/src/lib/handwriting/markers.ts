/**
 * Uncertain-word markers. The AI writes words it's unsure about as
 * [[best guess|alt 1|alt 2]]. The review screen turns them into tappable chips;
 * once the student confirms or fixes each one, the plain text is saved.
 */

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "uncertain"; id: number; guess: string; alternatives: string[] };

const MARKER = /\[\[([^\[\]]*?)\]\]/g;

export function parseMarkers(raw: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  let id = 0;
  for (const m of raw.matchAll(MARKER)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ kind: "text", text: raw.slice(last, start) });
    const parts = m[1].split("|").map((s) => s.trim());
    const guess = parts[0] ?? "";
    const alternatives = [...new Set(parts.slice(1).filter((p) => p && p !== guess))];
    out.push({ kind: "uncertain", id: id++, guess, alternatives });
    last = start + m[0].length;
  }
  if (last < raw.length) out.push({ kind: "text", text: raw.slice(last) });
  return out;
}

export function countUncertain(raw: string): number {
  return [...raw.matchAll(MARKER)].length;
}

/** Plain text with every marker replaced by its guess (or a chosen value). */
export function resolveMarkers(raw: string, choices: Record<number, string> = {}): string {
  return parseMarkers(raw)
    .map((s) => (s.kind === "text" ? s.text : (choices[s.id] ?? s.guess)))
    .join("");
}

/** Rebuilds marked text after some markers were resolved (kept ones stay marked). */
export function serializeSegments(segments: Segment[]): string {
  return segments
    .map((s) => (s.kind === "text" ? s.text : `[[${[s.guess, ...s.alternatives].join("|")}]]`))
    .join("");
}

/** Short context around a segment, used when saving a correction. */
export function contextAround(segments: Segment[], index: number, radius = 60): string {
  const before = segments
    .slice(0, index)
    .map((s) => (s.kind === "text" ? s.text : s.guess))
    .join("")
    .slice(-radius);
  const after = segments
    .slice(index + 1)
    .map((s) => (s.kind === "text" ? s.text : s.guess))
    .join("")
    .slice(0, radius);
  const seg = segments[index];
  const mid = seg?.kind === "uncertain" ? seg.guess : "";
  return `${before}${mid}${after}`.replace(/\s+/g, " ").trim();
}
