"use client";
import clsx from "clsx";
import { AlertCircle, BookOpen, Clock, Layers, Loader2, Pencil, Play, RefreshCw, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ClassBadge } from "@/components/cards";
import { answerText } from "@/components/quiz/answer-text";
import { QuestionEditor } from "@/components/quiz/question-editor";
import { SourcePreview } from "@/components/quiz/source-preview";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, EmptyState, Spinner } from "@/components/ui/card";
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
  const pageText = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of note.data?.note_pages ?? []) m.set(p.page_index, p.text ?? resolveMarkers(p.raw_text ?? ""));
    return m;
  }, [note.data]);

  if (quiz.loading) return <Spinner />;
  if (!quiz.data) return <EmptyState title="Quiz not found" />;
  const q = quiz.data;
  const questions = q.questions.map(asQuestion);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <ClassBadge name={q.classes?.name} color={q.classes?.color} className="self-start" />
        <input
          aria-label="Quiz title"
          key={q.title}
          defaultValue={q.title}
          onBlur={(e) => e.target.value.trim() && e.target.value !== q.title && updateQuizSet(id, { title: e.target.value.trim() })}
          className="w-full bg-transparent text-3xl font-bold outline-none focus:underline"
        />
        <p className="text-sm text-muted">
          {questions.length} questions
          {noteId && (
            <>
              {" · "}
              <Link href={`/notes/${noteId}`} className="font-semibold text-primary">
                View notes
              </Link>
            </>
          )}
        </p>
      </div>

      {q.status === "generating" && (
        <Card className="flex items-center gap-3 p-5">
          <Loader2 className="size-5 animate-spin text-primary" /> Writing questions from your notes…
        </Card>
      )}
      {q.status === "error" && (
        <Card className="flex items-center gap-3 p-5 text-danger">
          <AlertCircle className="size-5" /> Something went wrong making this quiz. Go back to your notes and try again.
        </Card>
      )}

      {questions.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href={`/quizzes/${id}/play?mode=quiz`} className={buttonClass("primary", "lg")}>
            <Play className="size-5" /> Practice
          </Link>
          <Link href={`/quizzes/${id}/play?mode=flashcards`} className={buttonClass("secondary", "lg")}>
            <Layers className="size-5" /> Flashcards
          </Link>
          <Link href={`/quizzes/${id}/play?mode=test`} className={buttonClass("secondary", "lg")}>
            <Clock className="size-5" /> Practice test
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-3" data-testid="question-list">
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
      </div>

      <button
        type="button"
        className="self-start text-sm font-semibold text-danger"
        onClick={async () => {
          if (!confirm("Delete this quiz?")) return;
          await deleteQuizSet(id);
          router.push("/library");
        }}
      >
        Delete quiz
      </button>
    </div>
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
    <Card className={clsx("p-4", busy && "opacity-60")} data-testid="question-item">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="text-muted">{index + 1}.</span>
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">{QUESTION_TYPE_LABELS[question.type]}</span>
        <span className="text-muted" aria-label={`Difficulty ${question.difficulty} of 3`}>
          {"●".repeat(question.difficulty)}
          <span className="opacity-30">{"●".repeat(3 - question.difficulty)}</span>
        </span>
        {question.is_focus && (
          <span className="flex items-center gap-1 rounded-full bg-[#ff00d4]/10 px-2 py-0.5 text-[#d100ad]">
            <Target className="size-3" /> Focus
          </span>
        )}
        {question.edited && <span className="text-muted">Edited</span>}
        {busy && <Loader2 className="size-4 animate-spin text-primary" />}
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
          <p className="font-medium">{questionHeadline(question)}</p>
          {question.type === "multiple_choice" ? (
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {question.data.choices.map((c, i) => (
                <li key={i} className={clsx("rounded-xl px-3 py-1.5", i === question.data.answer_index ? "bg-success-soft font-semibold text-success" : "bg-bg")}>
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 whitespace-pre-wrap text-sm text-success">{answerText(question)}</p>
          )}
          {question.explanation && <p className="mt-2 text-sm text-muted">{question.explanation}</p>}
        </>
      )}

      {!editing && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Edit
          </Button>
          <div className="relative">
            <Button size="sm" variant="ghost" onClick={() => setRegenOpen((o) => !o)} disabled={busy || !noteId}>
              <RefreshCw className="size-4" /> Regenerate
            </Button>
            {regenOpen && (
              <div className="absolute left-0 top-10 z-20 flex w-56 flex-col rounded-2xl border border-line bg-elev p-1 shadow-card">
                <button type="button" onClick={() => regenerate()} className="rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-primary-soft">
                  New version
                </button>
                <p className="px-3 pt-2 text-xs text-muted">Change to:</p>
                {QUESTION_TYPES.filter((t) => t !== question.type).map((t) => (
                  <button key={t} type="button" onClick={() => regenerate(t)} className="rounded-xl px-3 py-2 text-left text-sm hover:bg-primary-soft">
                    {QUESTION_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            )}
          </div>
          {question.source_quote && (
            <Button size="sm" variant="ghost" onClick={() => setShowSource((s) => !s)} aria-expanded={showSource}>
              <BookOpen className="size-4" /> Source
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto hover:bg-danger-soft"
            onClick={async () => {
              await deleteQuestion(question.id);
              onChanged();
            }}
            aria-label="Delete question"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
      {showSource && (
        <div className="mt-2">
          <SourcePreview pageText={pageText} quote={question.source_quote} pageIndex={question.source_page} noteId={noteId} />
        </div>
      )}
    </Card>
  );
}
