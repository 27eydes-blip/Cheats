import Link from "next/link";

/** A published context note under a dispatch or story: quiet, clearly labeled, with its source. */
export function NoteCard({ note, compact }: { note: { id: string; body: string; sourceUrl: string; sourceDomain: string }; compact?: boolean }) {
  return (
    <aside aria-label="Context note" className={`max-w-[520px] rounded-[12px] px-3 py-2 ring-1 ring-[var(--hairline)] ${compact ? "mt-2" : "mt-3"}`} onClick={(e) => e.stopPropagation()}>
      <p className="text-[12.5px] font-semibold text-ink-2">Readers added context</p>
      <p className={`mt-0.5 leading-snug text-ink-1 ${compact ? "text-[14px]" : "text-[15px]"}`}>{note.body}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
        <a href={note.sourceUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className="tap text-[var(--wn-blue-ink)] hover:underline">Source: {note.sourceDomain} ↗</a>
        <Link href={`/notes/${note.id}`} className="tap hover:text-ink-1 hover:underline">Why am I seeing this?</Link>
      </p>
    </aside>
  );
}
