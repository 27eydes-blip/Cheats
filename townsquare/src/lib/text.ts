/**
 * Safe text handling. Post bodies are stored as plain text and turned into
 * tokens here; components render tokens as React elements, so nothing user
 * written is ever injected as HTML.
 */
export type Token =
  | { t: "text"; v: string }
  | { t: "link"; v: string; href: string }
  | { t: "tag"; v: string; tag: string }
  | { t: "mention"; v: string; handle: string };

const TOKEN_RE = /(https?:\/\/[^\s<>"']+)|(#[\p{L}\p{N}_]{1,50})|(@[A-Za-z0-9_]{2,20})/gu;

export function tokenize(body: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN_RE)) {
    const i = m.index ?? 0;
    // a "#" or "@" glued to a word (e.g. email addresses) is not a token
    if ((m[2] || m[3]) && i > 0 && /[\p{L}\p{N}_]/u.test(body[i - 1])) continue;
    if (i > last) out.push({ t: "text", v: body.slice(last, i) });
    if (m[1]) {
      const { url, trailing } = trimUrl(m[1]);
      const href = safeHttpUrl(url);
      out.push(href ? { t: "link", v: url, href } : { t: "text", v: url });
      if (trailing) out.push({ t: "text", v: trailing });
    } else if (m[2]) out.push({ t: "tag", v: m[2], tag: m[2].slice(1).toLowerCase() });
    else if (m[3]) out.push({ t: "mention", v: m[3], handle: m[3].slice(1).toLowerCase() });
    last = i + m[0].length;
  }
  if (last < body.length) out.push({ t: "text", v: body.slice(last) });
  return out;
}

/** Drop trailing punctuation that is almost never part of a URL. */
function trimUrl(raw: string) {
  const m = raw.match(/[.,!?;:)\]]+$/);
  if (!m) return { url: raw, trailing: "" };
  return { url: raw.slice(0, -m[0].length), trailing: m[0] };
}

/** Returns a normalized URL only for http(s); anything else (javascript:, data:) is rejected. */
export function safeHttpUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function extractHashtags(body: string): string[] {
  return [...new Set(tokenize(body).flatMap((t) => (t.t === "tag" ? [t.tag] : [])))].slice(0, 20);
}

export function extractMentions(body: string): string[] {
  return [...new Set(tokenize(body).flatMap((t) => (t.t === "mention" ? [t.handle] : [])))].slice(0, 20);
}

export function extractLinks(body: string): string[] {
  return tokenize(body).flatMap((t) => (t.t === "link" ? [t.href] : []));
}

/** Remove control characters (keep newlines/tabs), normalize, trim, collapse 3+ blank lines. */
export function cleanText(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Character count the way users see it (emoji = 1). */
export function charCount(s: string): number {
  return [...s].length;
}
