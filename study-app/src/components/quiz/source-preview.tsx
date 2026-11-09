"use client";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { locateQuote } from "@/lib/quiz/source";

/** Shows the passage of the notes a question came from, highlighted in context. */
export function SourcePreview({
  pageText,
  quote,
  pageIndex,
  noteId,
}: {
  pageText: string | null | undefined;
  quote: string | null;
  pageIndex: number | null;
  noteId: string | null;
}) {
  if (!quote) return null;
  const loc = pageText ? locateQuote(pageText, quote) : null;
  const pad = 140;
  return (
    <div className="rounded-2xl border border-line bg-bg p-3 text-sm" data-testid="source-preview">
      <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
        <BookOpen className="size-3.5" /> From your notes{pageIndex != null ? `, page ${pageIndex + 1}` : ""}
      </p>
      {loc && pageText ? (
        <p className="whitespace-pre-wrap leading-relaxed">
          {loc.start > pad && "…"}
          {pageText.slice(Math.max(0, loc.start - pad), loc.start)}
          <mark className="rounded bg-uncertain px-0.5 text-uncertain-fg">{pageText.slice(loc.start, loc.end)}</mark>
          {pageText.slice(loc.end, loc.end + pad)}
          {loc.end + pad < pageText.length && "…"}
        </p>
      ) : (
        <p className="italic">“{quote}”</p>
      )}
      {noteId && (
        <Link href={`/notes/${noteId}`} className="mt-2 inline-block text-xs font-semibold text-primary">
          Open notes
        </Link>
      )}
    </div>
  );
}
