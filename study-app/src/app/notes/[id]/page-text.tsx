"use client";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { IconCheck, IconChevronRight, IconClose, IconEdit, IconTarget } from "@/components/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { saveCorrections, updatePage, type NotePageRow } from "@/lib/data";
import { wordCorrections } from "@/lib/handwriting/diff";
import { contextAround, parseMarkers, resolveMarkers, serializeSegments, type Segment } from "@/lib/handwriting/markers";

type Focus = { quote: string; from?: string };

/**
 * The extracted text for one page. Words the AI wasn't sure about are
 * highlighted; tap one to pick an alternative or type the right word. Every
 * fix is saved as a correction so future reads learn this handwriting.
 */
export function PageText({ page, classId }: { page: NotePageRow; classId: string | null }) {
  const toast = useToast();
  const source = page.raw_text ?? "";
  const [segments, setSegments] = useState<Segment[]>(() => parseMarkers(source));
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [focus, setFocus] = useState<Focus[]>(() => (Array.isArray(page.focus) ? (page.focus as Focus[]) : []));
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Pick up a fresh AI read (e.g. after "Read again").
  const lastSource = useRef(source);
  useEffect(() => {
    if (source !== lastSource.current) {
      lastSource.current = source;
      setSegments(parseMarkers(source));
      setFocus(Array.isArray(page.focus) ? (page.focus as Focus[]) : []);
    }
  }, [source, page.focus]);

  const uncertain = useMemo(() => segments.flatMap((s, i) => (s.kind === "uncertain" ? [i] : [])), [segments]);

  const persist = async (next: Segment[]) => {
    const raw = serializeSegments(next);
    lastSource.current = raw;
    await updatePage(page.id, { raw_text: raw, text: resolveMarkers(raw) });
  };

  const resolve = async (index: number, value: string) => {
    const seg = segments[index];
    if (seg?.kind !== "uncertain") return;
    const v = value.trim();
    const next: Segment[] = segments.map((s, i) => (i === index ? { kind: "text", text: v || seg.guess } : s));
    setSegments(next);
    const nextUncertain = next.findIndex((s, i) => i > index && s.kind === "uncertain");
    setOpen(nextUncertain >= 0 ? nextUncertain : null);
    try {
      await persist(next);
      if (v && v !== seg.guess) {
        await saveCorrections([
          { original: seg.guess, corrected: v, context: contextAround(segments, index), note_page_id: page.id, class_id: classId },
        ]);
      }
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const acceptAll = async () => {
    const next: Segment[] = segments.map((s) => (s.kind === "uncertain" ? { kind: "text", text: s.guess } : s));
    setSegments(next);
    setOpen(null);
    await persist(next);
  };

  const startEdit = () => {
    setDraft(resolveMarkers(serializeSegments(segments)));
    setEditing(true);
    setOpen(null);
  };
  const saveEdit = async () => {
    const before = resolveMarkers(serializeSegments(segments));
    const fixes = wordCorrections(before, draft);
    const next: Segment[] = [{ kind: "text", text: draft }];
    setSegments(next);
    setEditing(false);
    try {
      await persist(next);
      if (fixes.length) {
        await saveCorrections(fixes.map((f) => ({ ...f, note_page_id: page.id, class_id: classId })));
        toast(`Saved. Learned ${fixes.length} fix${fixes.length === 1 ? "" : "es"} for your handwriting.`, "success");
      }
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const saveFocus = async (next: Focus[]) => {
    setFocus(next);
    try {
      await updatePage(page.id, { focus: next });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  // Select text, then "Quiz me harder on this".
  const onSelect = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!sel || !text || text.length < 3 || !box.current?.contains(sel.anchorNode)) return setSelection(null);
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const host = box.current.getBoundingClientRect();
    setSelection({ text: text.slice(0, 400), x: rect.left - host.left + rect.width / 2, y: rect.top - host.top });
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <textarea
          aria-label="Edit text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[50vh] w-full rounded-2xl border border-line bg-bg p-5 font-mono text-[13px] leading-relaxed outline-none focus:border-accent"
        />
        <div className="flex gap-2">
          <Button onClick={saveEdit}>
            <IconCheck size={16} /> Save
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const openSeg = open !== null ? segments[open] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {uncertain.length > 0 ? (
          <>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => setOpen(uncertain[0])}
              className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft py-1.5 pl-3 pr-2 text-sm font-semibold text-warn"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-warn" />
              {uncertain.length} word{uncertain.length === 1 ? "" : "s"} to check <IconChevronRight size={16} />
            </motion.button>
            <Button size="sm" variant="ghost" onClick={acceptAll}>
              All look right
            </Button>
          </>
        ) : (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft py-1.5 pl-2 pr-3 text-sm font-semibold text-accent-ink"
          >
            <span className="flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg">
              <IconCheck size={13} strokeWidth={3} />
            </span>
            All words checked
          </motion.span>
        )}
        <Button size="sm" variant="ghost" onClick={startEdit} className="ml-auto">
          <IconEdit size={16} /> Edit text
        </Button>
      </div>

      <div ref={box} className="relative" onMouseUp={onSelect} onTouchEnd={() => setTimeout(onSelect, 50)}>
        <div data-testid="page-text" className="whitespace-pre-wrap break-words rounded-[20px] bg-bg p-5 text-[15.5px] leading-[1.75] text-fg-2 md:text-base">
          {segments.map((s, i) =>
            s.kind === "text" ? (
              <span key={i}>{s.text}</span>
            ) : (
              <button
                key={i}
                type="button"
                data-uncertain
                onClick={() => setOpen(open === i ? null : i)}
                className={clsx(
                  "rounded-md px-1 py-0.5 font-semibold underline decoration-dotted decoration-2 underline-offset-4 transition-all",
                  open === i ? "bg-accent text-accent-fg no-underline shadow-glow" : "bg-warn-soft text-warn hover:brightness-110",
                )}
              >
                {s.guess}
              </button>
            ),
          )}
          {!segments.length && <span className="text-muted">No text found on this page.</span>}
        </div>
        {selection && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              void saveFocus([...focus, { quote: selection.text, from: "selection" }]);
              setSelection(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-full items-center whitespace-nowrap rounded-full bg-fg px-3.5 py-2 text-xs font-bold text-bg shadow-lift"
            style={{ left: selection.x, top: selection.y - 6 }}
          >
            <IconTarget size={14} className="mr-1.5 text-accent-ink" /> Quiz me harder on this
          </button>
        )}
      </div>

      <AnimatePresence>
        {openSeg?.kind === "uncertain" && open !== null && (
          <FixPopover key={open} seg={openSeg} onPick={(v) => resolve(open, v)} onClose={() => setOpen(null)} />
        )}
      </AnimatePresence>

      {focus.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[20px] border border-accent/40 bg-accent-soft p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-accent-ink">
            <IconTarget size={17} /> Quizzed harder
          </p>
          {focus.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="flex-1">“{f.quote}”</span>
              <button type="button" aria-label="Remove focus" onClick={() => saveFocus(focus.filter((_, j) => j !== i))} className="rounded-full p-1 text-muted hover:bg-danger-soft hover:text-danger">
                <IconClose size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-faint">Tip: select any text to get quizzed harder on it.</p>
    </div>
  );
}

function FixPopover({ seg, onPick, onClose }: { seg: Extract<Segment, { kind: "uncertain" }>; onPick: (v: string) => void; onClose: () => void }) {
  const [value, setValue] = useState("");
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="fixed inset-x-3 bottom-28 z-40 rounded-[26px] border border-line-strong bg-elev p-5 shadow-lift md:static md:inset-auto md:shadow-soft"
      role="dialog"
      aria-label="Fix word"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">
          We read <span className="font-semibold text-fg">“{seg.guess}”</span>. What does it say?
        </p>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-elev-2">
          <IconClose size={16} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onPick(seg.guess)}>
          <IconCheck size={15} /> {seg.guess}
        </Button>
        {seg.alternatives.map((a) => (
          <Button key={a} size="sm" variant="secondary" onClick={() => onPick(a)}>
            {a}
          </Button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onPick(value);
        }}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type the right word"
          aria-label="Correct word"
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 outline-none focus:border-accent"
        />
        <Button size="sm" type="submit" variant="secondary">
          Fix
        </Button>
      </form>
    </motion.div>
  );
}
