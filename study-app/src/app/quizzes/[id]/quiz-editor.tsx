"use client";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ClassBadge } from "@/components/cards";
import {
  IconAlert,
  IconBook,
  IconCards,
  IconCheck,
  IconClose,
  IconCopy,
  IconEdit,
  IconLink,
  IconPlay,
  IconRetry,
  IconShare,
  IconSparkle,
  IconSpinner,
  IconTarget,
  IconTimer,
  IconTrash,
} from "@/components/icons";
import { answerText } from "@/components/quiz/answer-text";
import { QuestionEditor } from "@/components/quiz/question-editor";
import { SourcePreview } from "@/components/quiz/source-preview";
import { Button, buttonClass, IconButton } from "@/components/ui/button";
import { Card, EmptyState, Spinner } from "@/components/ui/card";
import { EditableTitle } from "@/components/ui/editable-title";
import { useToast } from "@/components/ui/toast";
import { useLive } from "@/hooks/use-live";
import { api, asQuestion, deleteQuestion, deleteQuizSet, getNote, getQuizSet, updateQuestion, updateQuizSet } from "@/lib/data";
import { resolveMarkers } from "@/lib/handwriting/markers";
import { QUESTION_TYPE_LABELS, QUESTION_TYPES, questionHeadline, type Question, type QuestionType } from "@/lib/quiz/schema";
import type { Json } from "@/lib/supabase/database.types";

export function QuizEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const quiz = useLive(`quiz:${id}`, () => getQuizSet(id), ["quiz_sets", "questions"]);
  const noteId = quiz.data?.note_id ?? null;
  const note = useLive(noteId ? `quiz-note:${noteId}` : null, () => getNote(noteId!), ["note_pages"]);
  const [sharing, setSharing] = useState(false);
  const pageText = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of note.data?.note_pages ?? []) m.set(p.page_index, p.text ?? resolveMarkers(p.raw_text ?? ""));
    return m;
  }, [note.data]);

  if (quiz.loading) return <Spinner />;
  if (!quiz.data)
    return (
      <EmptyState art="lost" title="Quiz not found" body="It may have been deleted.">
        <Link href="/library" className={buttonClass("secondary")}>
          Go to library
        </Link>
      </EmptyState>
    );
  const q = quiz.data;
  const questions = q.questions.map(asQuestion);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <ClassBadge name={q.classes?.name ?? "No class"} />
          {questions.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setSharing(true)}>
              <IconShare size={16} /> Share
            </Button>
          )}
        </div>
        <EditableTitle
          label="Quiz title"
          value={q.title}
          onSave={(v) => updateQuizSet(id, { title: v })}
          className="text-[32px] font-semibold leading-[1.08] tracking-[-0.04em] md:text-[44px]"
        />
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-muted">
          <span className="flex items-center gap-1.5">
            <IconCards size={17} /> {questions.length} questions
          </span>
          {questions.some((x) => x.is_focus) && (
            <span className="flex items-center gap-1.5">
              <IconTarget size={17} /> {questions.filter((x) => x.is_focus).length} on your focus areas
            </span>
          )}
          {noteId && (
            <Link href={`/notes/${noteId}`} className="flex items-center gap-1.5 font-medium text-accent-ink">
              <IconBook size={17} /> View notes
            </Link>
          )}
        </p>
      </div>

      {q.status === "generating" && (
        <Card className="flex items-center gap-4 p-6">
          <span className="relative flex size-11 items-center justify-center">
            <span className="animate-pulse-ring absolute inset-0 rounded-full bg-accent" />
            <IconSparkle size={22} className="relative text-accent-ink" />
          </span>
          <div>
            <p className="font-semibold">Writing questions from your notes…</p>
            <p className="text-sm text-muted">They&apos;ll appear here as soon as they&apos;re ready.</p>
          </div>
        </Card>
      )}
      {q.status === "error" && (
        <Card className="flex items-center gap-3 p-6 text-danger">
          <IconAlert /> Something went wrong making this quiz. Go back to your notes and try again.
        </Card>
      )}

      {questions.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <ModeCard href={`/quizzes/${id}/play?mode=quiz`} icon={<IconPlay size={22} />} title="Practice" body="Instant feedback" primary />
          <ModeCard href={`/quizzes/${id}/play?mode=flashcards`} icon={<IconCards size={22} />} title="Flashcards" body="Swipe to review" />
          <ModeCard href={`/quizzes/${id}/play?mode=test`} icon={<IconTimer size={22} />} title="Practice test" body="Timed, like the exam" />
        </div>
      )}

      {questions.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-[-0.02em]">Questions</h2>
          <div className="flex flex-col gap-3" data-testid="question-list">
            <AnimatePresence initial={false}>
              {questions.map((question, i) => (
                <QuestionItem
                  key={question.id}
                  index={i}
                  question={question}
                  noteId={noteId}
                  pageText={question.source_page != null ? pageText.get(question.source_page) : undefined}
                  onChanged={quiz.refresh}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      <button
        type="button"
        className="self-start text-sm font-medium text-muted transition hover:text-danger"
        onClick={async () => {
          if (!confirm("Delete this quiz?")) return;
          await deleteQuizSet(id);
          router.push("/library");
        }}
      >
        Delete quiz
      </button>

      <AnimatePresence>
        {sharing && (
          <ShareSheet
            title={q.title}
            code={q.share_code}
            count={questions.length}
            visibility={q.visibility}
            onEnable={() => updateQuizSet(id, { visibility: "link" })}
            onClose={() => setSharing(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ModeCard({ href, icon, title, body, primary }: { href: string; icon: React.ReactNode; title: string; body: string; primary?: boolean }) {
  return (
    <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} transition={{ type: "spring", stiffness: 450, damping: 26 }}>
      <Link
        href={href}
        className={clsx(
          "flex items-center gap-4 rounded-[24px] border p-4 transition-shadow sm:flex-col sm:items-start sm:p-5",
          primary ? "border-transparent bg-accent text-accent-fg shadow-glow" : "card-sheen border-line bg-elev shadow-soft hover:shadow-lift",
        )}
      >
        <span className={clsx("flex size-11 items-center justify-center rounded-2xl", primary ? "bg-black/10" : "bg-accent-soft text-accent-ink")}>{icon}</span>
        <span>
          <span className="block text-[17px] font-semibold tracking-[-0.02em]">{title}</span>
          <span className={clsx("block text-sm", primary ? "text-black/60" : "text-muted")}>{body}</span>
        </span>
      </Link>
    </motion.div>
  );
}

function ShareSheet({
  title,
  code,
  count,
  visibility,
  onEnable,
  onClose,
}: {
  title: string;
  code: string;
  count: number;
  visibility: string;
  onEnable: () => Promise<void>;
  onClose: () => void;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/q/${code}`;
  const ensure = async () => {
    if (visibility !== "link") await onEnable();
  };
  const copy = async () => {
    await ensure();
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    toast("Link copied. Paste it in the group chat!", "success");
    setTimeout(() => setCopied(false), 2000);
  };
  const native = async () => {
    await ensure();
    try {
      await navigator.share({ title, text: `Quiz: ${title} (${count} questions)`, url });
    } catch {
      /* cancelled */
    }
  };
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Share quiz"
        className="w-full max-w-md rounded-[32px] border border-line-strong bg-elev p-6 shadow-lift"
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Share with your class</h2>
            <p className="mt-1 text-sm text-muted">Anyone with the link can take it, no sign-up needed.</p>
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
            <IconClose size={18} />
          </IconButton>
        </div>
        <div className="mb-4 flex items-center gap-3 rounded-[20px] border border-line bg-bg p-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
            <IconLink size={18} />
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-fg-2">{url.replace(/^https?:\/\//, "")}</span>
        </div>
        <div className="mb-5 flex items-center justify-center gap-3 rounded-[20px] bg-elev-2 py-4">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Code</span>
          <span className="font-mono text-2xl font-semibold tracking-[0.2em]">{code}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={copy}>
            {copied ? <IconCheck size={18} /> : <IconCopy size={18} />} {copied ? "Copied" : "Copy link"}
          </Button>
          <Button onClick={native}>
            <IconShare size={18} /> Share
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function QuestionItem({
  question,
  index,
  noteId,
  pageText,
  onChanged,
}: {
  question: Question;
  index: number;
  noteId: string | null;
  pageText?: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const regenerate = async (type?: QuestionType) => {
    setRegenOpen(false);
    setBusy(true);
    try {
      await api(`/api/questions/${question.id}/regenerate`, { type });
      onChanged();
      toast("New question ready", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30, height: 0, marginBottom: -12 }} transition={{ type: "spring", stiffness: 400, damping: 34 }}>
      <Card className={clsx("p-5 transition-opacity md:p-6", busy && "opacity-60")} data-testid="question-item">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="flex size-6 items-center justify-center rounded-full bg-elev-2 text-[11px] text-muted">{index + 1}</span>
          <span className="rounded-full border border-line px-2.5 py-1 text-fg-2">{QUESTION_TYPE_LABELS[question.type]}</span>
          <span className="flex gap-0.5" aria-label={`Difficulty ${question.difficulty} of 3`}>
            {[1, 2, 3].map((d) => (
              <span key={d} className={clsx("h-1.5 w-3 rounded-full", d <= question.difficulty ? "bg-accent" : "bg-line-strong")} />
            ))}
          </span>
          {question.is_focus && (
            <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-accent-ink">
              <IconTarget size={12} /> Focus
            </span>
          )}
          {question.edited && <span className="text-faint">Edited</span>}
          {busy && <IconSpinner size={16} className="text-accent-ink" />}
        </div>

        {editing ? (
          <QuestionEditor
            question={question}
            onCancel={() => setEditing(false)}
            onSave={async (data, explanation) => {
              await updateQuestion(question.id, { data: data as NonNullable<Json>, explanation });
              setEditing(false);
              onChanged();
            }}
          />
        ) : (
          <>
            <p className="text-[17px] font-semibold leading-snug tracking-[-0.01em]">{questionHeadline(question)}</p>
            {question.type === "multiple_choice" ? (
              <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
                {question.data.choices.map((c, i) => (
                  <li
                    key={i}
                    className={clsx(
                      "flex items-center gap-2 rounded-2xl px-3.5 py-2.5",
                      i === question.data.answer_index ? "bg-accent-soft font-semibold text-fg" : "bg-elev-2 text-fg-2",
                    )}
                  >
                    {i === question.data.answer_index && <IconCheck size={15} className="text-accent-ink" />}
                    {c}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 flex items-start gap-2 whitespace-pre-wrap text-[15px] text-fg-2">
                <IconCheck size={17} className="mt-0.5 shrink-0 text-accent-ink" />
                {answerText(question)}
              </p>
            )}
            {question.explanation && <p className="mt-3 text-sm leading-relaxed text-muted">{question.explanation}</p>}
          </>
        )}

        {!editing && (
          <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-line pt-3">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <IconEdit size={16} /> Edit
            </Button>
            <div className="relative">
              <Button size="sm" variant="ghost" onClick={() => setRegenOpen((o) => !o)} disabled={busy || !noteId}>
                <IconRetry size={16} /> Regenerate
              </Button>
              <AnimatePresence>
                {regenOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-11 z-20 flex w-60 origin-top-left flex-col rounded-[20px] border border-line-strong bg-elev p-1.5 shadow-lift"
                  >
                    <button type="button" onClick={() => regenerate()} className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-elev-2">
                      <IconSparkle size={16} className="text-accent-ink" /> New version
                    </button>
                    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Change to</p>
                    {QUESTION_TYPES.filter((t) => t !== question.type).map((t) => (
                      <button key={t} type="button" onClick={() => regenerate(t)} className="rounded-2xl px-3 py-2 text-left text-sm text-fg-2 hover:bg-elev-2 hover:text-fg">
                        {QUESTION_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {question.source_quote && (
              <Button size="sm" variant="ghost" onClick={() => setShowSource((s) => !s)} aria-expanded={showSource} className={clsx(showSource && "!text-accent-ink")}>
                <IconBook size={16} /> Source
              </Button>
            )}
            <IconButton
              label="Delete question"
              className="ml-auto hover:!bg-danger-soft hover:!text-danger"
              onClick={async () => {
                await deleteQuestion(question.id);
                onChanged();
              }}
            >
              <IconTrash size={17} />
            </IconButton>
          </div>
        )}
        <AnimatePresence>
          {showSource && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="pt-3">
                <SourcePreview pageText={pageText} quote={question.source_quote} pageIndex={question.source_page} noteId={noteId} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
