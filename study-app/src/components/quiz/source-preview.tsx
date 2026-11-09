"use client";
import Link from "next/link";
import { IconArrowRight, IconBook } from "@/components/icons";
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
    <div className="rounded-[20px] border border-line bg-bg p-4 text-[14px]" data-testid="source-preview">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        <IconBook size={14} className="text-accent-ink" /> From your notes{pageIndex != null ? ` · page ${pageIndex + 1}` : ""}
      </p>
      {loc && pageText ? (
        <p className="whitespace-pre-wrap leading-relaxed text-muted">
          {loc.start > pad && "…"}
          {pageText.slice(Math.max(0, loc.start - pad), loc.start)}
          <mark className="rounded-[5px] bg-accent px-1 py-0.5 font-medium text-accent-fg">{pageText.slice(loc.start, loc.end)}</mark>
          {pageText.slice(loc.end, loc.end + pad)}
          {loc.end + pad < pageText.length && "…"}
        </p>
      ) : (
        <p className="italic text-fg-2">“{quote}”</p>
      )}
      {noteId && (
        <Link href={`/notes/${noteId}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent-ink">
          Open notes <IconArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}
