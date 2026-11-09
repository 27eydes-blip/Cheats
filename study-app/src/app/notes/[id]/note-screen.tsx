"use client";
import clsx from "clsx";
import { AlertCircle, ImageIcon, Loader2, RotateCcw, Sparkles, Trash2, Type } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { QuizCard } from "@/components/cards";
import { ClassTopicPicker } from "@/components/class-topic-picker";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Spinner } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useDevice } from "@/hooks/use-device";
import { useLive } from "@/hooks/use-live";
import { api, deleteNote, getNote, listQuizSets, signedImageUrls, updateNote } from "@/lib/data";
import { countUncertain } from "@/lib/handwriting/markers";
import { isReading, readPages } from "@/lib/notes-client";
import { QUESTION_TYPE_LABELS, QUESTION_TYPES, type QuestionType } from "@/lib/quiz/schema";
import { PageText } from "./page-text";

const STUCK_MS = 3 * 60 * 1000;

export function NoteScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const device = useDevice();
  const note = useLive(`note:${id}`, () => getNote(id), ["notes", "note_pages"], undefined);
  const quizzes = useLive(`note-quizzes:${id}`, async () => (await listQuizSets()).filter((q) => q.note_id === id), ["quiz_sets"]);
  const [pageIdx, setPageIdx] = useState(0);
  const [view, setView] = useState<"photo" | "text">("text");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, []);

  const pages = useMemo(() => [...(note.data?.note_pages ?? [])].sort((a, b) => a.page_index - b.page_index), [note.data]);
  const page = pages[Math.min(pageIdx, pages.length - 1)];

  const imagePaths = pages.map((p) => p.image_path).filter((p): p is string => !!p).join("|");
  useEffect(() => {
    if (!imagePaths) return;
    signedImageUrls(imagePaths.split("|")).then(setUrls);
  }, [imagePaths]);

  // Resume reading pages that never started (e.g. the tab was closed mid-upload).
  useEffect(() => {
    const pending = pages.filter((p) => p.status === "pending" && !isReading(id, p.page_index));
    if (pending.length) void readPages(id, pending.map((p) => ({ index: p.page_index })));
  }, [pages, id]);

  if (note.loading) return <Spinner />;
  if (!note.data) return <EmptyState title="Notes not found" body="They may have been deleted." />;
  const n = note.data;
  const allRead = pages.length > 0 && pages.every((p) => p.status === "done");
  const totalUncertain = pages.reduce((s, p) => s + countUncertain(p.raw_text ?? ""), 0);

  const retry = async (index: number) => {
    const errs = await readPages(id, [{ index }]);
    if (errs.length) toast(errs[0], "error");
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            aria-label="Title"
            defaultValue={n.title}
            key={n.title}
            onBlur={(e) => e.target.value.trim() && e.target.value !== n.title && updateNote(id, { title: e.target.value.trim() })}
            className="w-full truncate bg-transparent text-2xl font-bold outline-none focus:underline"
          />
          <p className="text-sm text-muted">
            {allRead
              ? totalUncertain
                ? `Check ${totalUncertain} highlighted word${totalUncertain === 1 ? "" : "s"}, then make your quiz.`
                : "Looks good. Make your quiz below."
              : "Reading your notes…"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (!confirm("Delete these notes and their photos? Quizzes made from them are kept.")) return;
            await deleteNote(id);
            router.push("/library");
          }}
        >
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>

      <ClassTopicPicker
        classId={n.class_id}
        topicId={n.topic_id}
        onChange={(v) => updateNote(id, { class_id: v.classId, topic_id: v.topicId }).then(note.refresh)}
      />

      {pages.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Pages">
          {pages.map((p, i) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={i === pageIdx}
              onClick={() => setPageIdx(i)}
              className={clsx(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                i === pageIdx ? "border-primary bg-primary text-primary-fg" : "border-line bg-elev",
              )}
            >
              {p.status === "reading" || p.status === "pending" ? <Loader2 className="size-3.5 animate-spin" /> : p.status === "error" ? <AlertCircle className="size-3.5" /> : null}
              Page {i + 1}
              {countUncertain(p.raw_text ?? "") > 0 && <span className="size-2 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      )}

      {device === "phone" && page?.image_path && (
        <div className="flex rounded-2xl bg-elev p-1" role="tablist">
          {(["text", "photo"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={clsx("flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold", view === v ? "bg-primary text-primary-fg" : "text-muted")}
            >
              {v === "text" ? <Type className="size-4" /> : <ImageIcon className="size-4" />}
              {v === "text" ? "Text" : "Photo"}
            </button>
          ))}
        </div>
      )}

      {page && (
        <div className={clsx("grid gap-4", page.image_path && device !== "phone" && "md:grid-cols-2")}>
          {page.image_path && (device !== "phone" || view === "photo") && (
            <Card className="overflow-hidden p-2 md:sticky md:top-4 md:self-start">
              {urls[page.image_path] ? (
                <a href={urls[page.image_path]} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[page.image_path]} alt={`Page ${page.page_index + 1}`} className="max-h-[80vh] w-full rounded-2xl object-contain" />
                </a>
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center">
                  <Spinner />
                </div>
              )}
            </Card>
          )}
          {(device !== "phone" || view === "text" || !page.image_path) && (
            <Card className="p-4">
              {page.status === "done" ? (
                <PageText key={page.id} page={page} classId={n.class_id} />
              ) : page.status === "error" ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="flex items-center gap-2 text-danger">
                    <AlertCircle className="size-5" /> {page.error ?? "Couldn't read this page."}
                  </p>
                  <Button onClick={() => retry(page.page_index)}>
                    <RotateCcw className="size-4" /> Try again
                  </Button>
                </div>
              ) : (
                <ReadingSkeleton stuck={now > 0 && now - new Date(page.updated_at).getTime() > STUCK_MS && !isReading(id, page.page_index)} onRetry={() => retry(page.page_index)} />
              )}
              {page.status === "done" && (
                <button type="button" onClick={() => retry(page.page_index)} className="mt-3 flex items-center gap-1 text-xs font-semibold text-muted hover:text-primary">
                  <RotateCcw className="size-3.5" /> Read this page again
                </button>
              )}
            </Card>
          )}
        </div>
      )}

      {allRead && <MakeQuiz noteId={id} onMade={(qid) => router.push(`/quizzes/${qid}`)} />}

      {!!quizzes.data?.length && (
        <section>
          <h2 className="mb-3 font-bold">Quizzes from these notes</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quizzes.data.map((q) => (
              <QuizCard key={q.id} quiz={q} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ReadingSkeleton({ stuck, onRetry }: { stuck: boolean; onRetry: () => void }) {
  if (stuck) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted">This page is taking longer than usual.</p>
        <Button onClick={onRetry}>
          <RotateCcw className="size-4" /> Read again
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <p className="flex items-center gap-2 font-semibold">
        <Sparkles className="size-5 animate-pulse text-primary" /> Reading your handwriting…
      </p>
      {[90, 75, 85, 60, 80].map((w, i) => (
        <div key={i} className="h-4 animate-pulse rounded-full bg-primary-soft" style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}

function MakeQuiz({ noteId, onMade }: { noteId: string; onMade: (id: string) => void }) {
  const toast = useToast();
  const [types, setTypes] = useState<QuestionType[]>([...QUESTION_TYPES]);
  const [count, setCount] = useState(15);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (t: QuestionType) => setTypes((ts) => (ts.includes(t) ? (ts.length > 1 ? ts.filter((x) => x !== t) : ts) : [...ts, t]));

  const make = async () => {
    setBusy(true);
    try {
      const r = await api<{ quizSetId: string }>(`/api/notes/${noteId}/quiz`, { types, count, instructions: instructions || undefined });
      onMade(r.quizSetId);
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="text-lg font-bold">Make a quiz</h2>
      <div className="flex flex-wrap gap-2">
        {QUESTION_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={types.includes(t)}
            onClick={() => toggle(t)}
            className={clsx(
              "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
              types.includes(t) ? "border-primary bg-primary-soft text-primary" : "border-line text-muted",
            )}
          >
            {QUESTION_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-3 text-sm font-medium">
        Questions
        <input type="range" min={5} max={40} value={count} onChange={(e) => setCount(Number(e.target.value))} className="flex-1 accent-[var(--primary)]" aria-label="Number of questions" />
        <span className="w-8 text-right font-bold">{count}</span>
      </label>
      <input
        className="h-11 rounded-xl border border-line bg-bg px-3 text-[15px]"
        placeholder="Anything to focus on? (optional)"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        maxLength={500}
      />
      <Button size="lg" onClick={make} loading={busy}>
        <Sparkles className="size-5" /> {busy ? "Writing your questions…" : "Make quiz"}
      </Button>
    </Card>
  );
}
