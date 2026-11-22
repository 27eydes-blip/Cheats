// Helpers for spoken output: split streamed text into sentences, and clean text so
// it sounds natural when read aloud.

const ABBREV = /\b(mr|mrs|ms|dr|st|vs|etc|e\.g|i\.e|approx|no|jr|sr|mt|ft|inc|ltd)\.$/i;

/** Feed it text deltas; it hands back each sentence as soon as it's complete. */
export class SentenceSplitter {
  constructor(minLength = 12) {
    this.buf = "";
    this.minLength = minLength;
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
    return out;
  }

  flush() {
    const rest = this.buf.trim();
    this.buf = "";
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
