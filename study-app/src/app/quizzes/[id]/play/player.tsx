"use client";
import clsx from "clsx";
import { motion } from "framer-motion";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { IconArrowLeft, IconCards, IconPlay, IconTimer } from "@/components/icons";
import { Flashcards, Practice, PracticeTest } from "@/components/quiz/study-modes";
import { EmptyState, Spinner } from "@/components/ui/card";
import { useLive } from "@/hooks/use-live";
import { asQuestion, getNote, getQuizSet } from "@/lib/data";
import { resolveMarkers } from "@/lib/handwriting/markers";

export type Mode = "quiz" | "flashcards" | "test";

export function Player() {
  const { id } = useParams<{ id: string }>();
  const mode = (useSearchParams().get("mode") as Mode) ?? "quiz";
  const quiz = useLive(`play:${id}`, () => getQuizSet(id), []);
  const noteId = quiz.data?.note_id ?? null;
  const note = useLive(noteId ? `play-note:${noteId}` : null, () => getNote(noteId!), []);
  const pageText = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of note.data?.note_pages ?? []) m.set(p.page_index, p.text ?? resolveMarkers(p.raw_text ?? ""));
    return m;
  }, [note.data]);

  if (quiz.loading) return <Spinner />;
  if (!quiz.data?.questions.length) return <EmptyState art="quiz" title="No questions yet" body="Make a quiz from your notes first." />;
  const questions = quiz.data.questions.map(asQuestion);
  const ctx = { pageText, noteId, classId: quiz.data.class_id, doneHref: `/quizzes/${id}` };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href={`/quizzes/${id}`} aria-label="Back to quiz" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-elev text-fg-2 hover:text-fg">
          <IconArrowLeft size={18} />
        </Link>
        <p className="min-w-0 flex-1 truncate font-semibold tracking-[-0.01em]">{quiz.data.title}</p>
      </div>
      <ModeSwitch mode={mode} base={`/quizzes/${id}/play`} />
      {mode === "flashcards" ? (
        <Flashcards key="f" questions={questions} ctx={ctx} />
      ) : mode === "test" ? (
        <PracticeTest key="t" questions={questions} ctx={ctx} />
      ) : (
        <Practice key="p" questions={questions} ctx={ctx} />
      )}
    </div>
  );
}

/** Practice / Flashcards / Test switcher with a sliding pill. */
export function ModeSwitch({ mode, base }: { mode: Mode; base: string }) {
  const items: { m: Mode; label: string; icon: React.ReactNode }[] = [
    { m: "quiz", label: "Practice", icon: <IconPlay size={16} /> },
    { m: "flashcards", label: "Flashcards", icon: <IconCards size={16} /> },
    { m: "test", label: "Test", icon: <IconTimer size={16} /> },
  ];
  return (
    <div className="flex rounded-full border border-line bg-elev p-1" role="tablist">
      {items.map((it) => (
        <Link
          key={it.m}
          href={`${base}?mode=${it.m}`}
          replace
          role="tab"
          aria-selected={mode === it.m}
          className={clsx("relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold transition-colors", mode === it.m ? "text-fg" : "text-muted hover:text-fg")}
        >
          {mode === it.m && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-full bg-elev-2" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <span className="relative flex items-center gap-1.5">
            {it.icon}
            {it.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
