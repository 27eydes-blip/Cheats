// Helpers for spoken output: split streamed text into sentences, and clean text so
// it sounds natural when read aloud.

const ABBREV = /\b(mr|mrs|ms|dr|st|vs|etc|e\.g|i\.e|approx|no|jr|sr|mt|ft|inc|ltd)\.$/i;

/**
 * Feed it text deltas; it hands back each sentence as soon as it's complete.
 * firstClauseAt: if the very first sentence runs past this many characters, it's split at the
 * first comma, semicolon, colon or dash instead, so speaking can start sooner (0 = off).
 */
export class SentenceSplitter {
  constructor(minLength = 12, { firstClauseAt = 0 } = {}) {
    this.buf = "";
    this.minLength = minLength;
    this.firstClauseAt = firstClauseAt;
    this.emitted = 0;
  }

  push(delta) {
    this.buf += delta;
    const out = [];
    let start = 0;
    const re = /([.!?…]+["')\]]?)(\s+)|(\n+)/g;
    let m;
    while ((m = re.exec(this.buf))) {
      const end = m.index + (m[1] ? m[1].length : 0);
      const candidate = this.buf.slice(start, end).trim();
      if (m[1] && ABBREV.test(candidate)) continue; // "Dr. Smith" is one sentence
      if (m[1] && /\d$/.test(this.buf.slice(0, m.index)) && /^\d/.test(this.buf.slice(re.lastIndex))) continue; // 7.30
      if (candidate.length < this.minLength && !m[3]) continue; // "Okay." waits to join the next bit
      if (candidate) out.push(candidate);
      start = re.lastIndex;
    }
    this.buf = this.buf.slice(start);
    if (out.length === 0 && this.emitted === 0 && this.firstClauseAt > 0 && this.buf.length >= this.firstClauseAt) {
      // a long first sentence: speak its first clause now ("Sure, here's the plan: ...")
      const clause = /[,;:–—](\s+)/g;
      let c;
      while ((c = clause.exec(this.buf))) {
        if (c.index < 25) continue; // too short to sound natural on its own
        if (/\d$/.test(this.buf.slice(0, c.index)) && /^\d/.test(this.buf.slice(clause.lastIndex))) continue; // 1,000
        out.push(this.buf.slice(0, c.index + 1).trim());
        this.buf = this.buf.slice(clause.lastIndex);
        break;
      }
    }
    this.emitted += out.length;
    return out;
  }

  flush() {
    const rest = this.buf.trim();
    this.buf = "";
    if (rest) this.emitted++;
    return rest ? [rest] : [];
  }
}

/** Last line of defence before text is spoken: no markdown, symbols or URLs. */
export function speakable(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // [label](url) -> label
    .replace(/https?:\/\/\S+/g, "a link")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "") // list markers
    .replace(/^\s*#+\s*/gm, "")
    .replace(/[*_~>#|]+/g, "")
    .replace(/\s*&\s*/g, " and ")
    .replace(/(\d)\s*%/g, "$1 percent")
    .replace(/\be\.g\./gi, "for example")
    .replace(/\bi\.e\./gi, "that is")
    .replace(/\bw\//gi, "with ")
    .replace(/\s*\/\s*/g, " or ")
    .replace(/\s*@\s*/g, " at ")
    .replace(/[(){}[\]]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
