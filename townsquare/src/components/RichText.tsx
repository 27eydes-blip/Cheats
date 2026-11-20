"use client";

import Link from "next/link";
import { tokenize } from "@/lib/text";

/** Renders post text as React elements: links, #hashtags and @mentions become links. No HTML injection. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {tokenize(text).map((t, i) => {
        switch (t.t) {
          case "link":
            return (
              <a key={i} href={t.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-accent underline decoration-accent/30 decoration-1 underline-offset-[3px] hover:decoration-accent" onClick={stop}>
                {prettyUrl(t.v)}
              </a>
            );
          case "tag":
            return (
              <Link key={i} href={`/search?q=${encodeURIComponent(`#${t.tag}`)}`} className="text-accent underline decoration-accent/30 decoration-1 underline-offset-[3px] hover:decoration-accent" onClick={stop}>
                {t.v}
              </Link>
            );
          case "mention":
            return (
              <Link key={i} href={`/u/${t.handle}`} className="text-accent underline decoration-accent/30 decoration-1 underline-offset-[3px] hover:decoration-accent" onClick={stop}>
                {t.v}
              </Link>
            );
          default:
            return <span key={i}>{t.v}</span>;
        }
      })}
    </>
  );
}

function stop(e: React.MouseEvent) {
  e.stopPropagation();
}

function prettyUrl(u: string) {
  const s = u.replace(/^https?:\/\/(www\.)?/, "");
  return s.length > 40 ? `${s.slice(0, 38)}…` : s;
}
