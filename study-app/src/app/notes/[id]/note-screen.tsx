"use client";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { QuizCard } from "@/components/cards";
import { ClassTopicPicker } from "@/components/class-topic-picker";
import { IconAlert, IconCheck, IconImage, IconRetry, IconSparkle, IconSpinner, IconText, IconTrash } from "@/components/icons";
import { ReadingLines, ScanOverlay } from "@/components/scan-overlay";
import { Button, buttonClass, IconButton } from "@/components/ui/button";
import { EditableTitle } from "@/components/ui/editable-title";
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
  if (!note.data)
    return (
      <EmptyState art="lost" title="Notes not found" body="They may have been deleted, or they belong to someone else.">
        <Link href="/library" className={buttonClass("secondary")}>
          Go to library
        </Link>
      </EmptyState>
    );
  const n = note.data;
  const allRead = pages.length > 0 && pages.every((p) => p.status === "done");
  const totalUncertain = pages.reduce((s, p) => s + countUncertain(p.raw_text ?? ""), 0);

  const retry = async (index: number) => {
    const errs = await readPages(id, [{ index }]);
    if (errs.length) toast(errs[0], "error");
  };

  const stepIndex = !allRead ? 0 : totalUncertain ? 1 : 2;
  const reading = page && (page.status === "pending" || page.status === "reading");

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-5">
        <Stepper index={stepIndex} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <EditableTitle
              label="Title"
              value={n.title}
              onSave={(v) => updateNote(id, { title: v })}
              className="text-[28px] font-semibold leading-tight tracking-[-0.035em] md:text-[40px]"
            />
            <p className="mt-1 text-[15px] text-muted">
              {allRead
                ? totalUncertain
                  ? `Tap the ${totalUncertain} highlighted word${totalUncertain === 1 ? "" : "s"}${pages.length > 1 ? ` across ${pages.length} pages` : ""} to check them, then make your quiz.`
                  : "Everything looks good. Make your quiz below."
                : "Reading your notes. This usually takes a few seconds per page."}
            </p>
          </div>
          <IconButton
            label="Delete notes"
            className="hover:!bg-danger-soft hover:!text-danger"
            onClick={async () => {
              if (!confirm("Delete these notes and their photos? Quizzes made from them are kept.")) return;
              await deleteNote(id);
              router.push("/library");
            }}
          >
            <IconTrash size={18} />
          </IconButton>
        </div>
        <ClassTopicSummary
          className={n.classes?.name ?? null}
          topic={n.topics?.name ?? null}
          picker={<ClassTopicPicker classId={n.class_id} topicId={n.topic_id} onChange={(v) => updateNote(id, { class_id: v.classId, topic_id: v.topicId }).then(note.refresh)} />}
        />
      </div>

      {pages.length > 1 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Pages">
          {pages.map((p, i) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={i === pageIdx}
              onClick={() => setPageIdx(i)}
              className={clsx(
                "relative flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                i === pageIdx ? "text-accent-fg" : "text-muted hover:text-fg",
              )}
            >
              {i === pageIdx && <motion.span layoutId="page-tab" className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
              <span className="relative flex items-center gap-1.5">
                {p.status === "reading" || p.status === "pending" ? <IconSpinner size={14} /> : p.status === "error" ? <IconAlert size={14} /> : null}
                Page {i + 1}
                {countUncertain(p.raw_text ?? "") > 0 && <span className="size-1.5 rounded-full bg-warn" />}
              </span>
            </button>
          ))}
        </div>
      )}

      {device === "phone" && page?.image_path && !reading && (
        <div className="flex rounded-full border border-line bg-elev p-1" role="tablist">
          {(["text", "photo"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={clsx("relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-semibold transition-colors", view === v ? "text-fg" : "text-muted")}
            >
              {view === v && <motion.span layoutId="view-toggle" className="absolute inset-0 rounded-full bg-elev-2" />}
              <span className="relative flex items-center gap-1.5">
                {v === "text" ? <IconText size={17} /> : <IconImage size={17} />}
                {v === "text" ? "Text" : "Photo"}
              </span>
            </button>
          ))}
        </div>
      )}

      {page && (
        <div className={clsx("grid gap-5", page.image_path && device !== "phone" && "md:grid-cols-2")}>
          {page.image_path && (device !== "phone" || view === "photo" || reading) && (
            <div className="relative overflow-hidden rounded-[28px] border border-line bg-elev-2 shadow-soft md:sticky md:top-6 md:self-start">
              {urls[page.image_path] ? (
                <a href={urls[page.image_path]} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[page.image_path]} alt={`Page ${page.page_index + 1}`} className="max-h-[78vh] w-full object-contain" />
                </a>
              ) : (
                <div className="skeleton aspect-[3/4]" />
              )}
              {reading && <ScanOverlay seed={page.page_index + 1} />}
            </div>
          )}
          {(device !== "phone" || view === "text" || !page.image_path) && !(device === "phone" && reading && page.image_path) && (
            <Card className="p-5 md:p-6">
              {page.status === "done" ? (
                <PageText key={page.id} page={page} classId={n.class_id} />
              ) : page.status === "error" ? (
                <div className="flex flex-col items-start gap-4 py-4">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-danger-soft text-danger">
                    <IconAlert size={22} />
                  </span>
                  <div>
                    <p className="font-semibold">We couldn&apos;t read this page</p>
                    <p className="text-sm text-muted">{page.error ?? "Something went wrong."}</p>
                  </div>
                  <Button onClick={() => retry(page.page_index)}>
                    <IconRetry size={17} /> Try again
                  </Button>
                </div>
              ) : now > 0 && now - new Date(page.updated_at).getTime() > STUCK_MS && !isReading(id, page.page_index) ? (
                <div className="flex flex-col items-start gap-4 py-4">
                  <p className="text-muted">This page is taking longer than usual.</p>
                  <Button onClick={() => retry(page.page_index)}>
                    <IconRetry size={17} /> Read again
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-5" aria-live="polite">
                  <p className="flex items-center gap-2 text-sm font-semibold text-accent-ink">
                    <IconSparkle size={18} /> Reading page {page.page_index + 1}…
                  </p>
                  <ReadingLines />
                </div>
              )}
              {page.status === "done" && (
                <button type="button" onClick={() => retry(page.page_index)} className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-fg">
                  <IconRetry size={14} /> Read this page again
                </button>
              )}
            </Card>
          )}
        </div>
      )}

      <AnimatePresence>{allRead && <MakeQuiz noteId={id} onMade={(qid) => router.push(`/quizzes/${qid}`)} />}</AnimatePresence>

      {!!quizzes.data?.length && (
        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-[-0.02em]">Quizzes from these notes</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quizzes.data.map((q) => (
              <QuizCard key={q.id} quiz={q} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** "AP Biology · Cells  Change" line that expands into the full picker. */
function ClassTopicSummary({ className, topic, picker }: { className: string | null; topic: string | null; picker: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-elev px-3 py-1.5 font-medium text-fg-2">
          <span className="size-1.5 rounded-full bg-accent" />
          {className ?? "No class"}
          {topic && <span className="text-muted">· {topic}</span>}
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} className="font-semibold text-accent-ink" aria-expanded={open}>
          {open ? "Done" : className ? "Change" : "Add class"}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            {picker}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stepper({ index }: { index: number }) {
  const steps = ["Read", "Check", "Quiz"];
  return (
    <ol className="flex items-center gap-2 text-[13px] font-semibold" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={clsx(
              "flex size-6 items-center justify-center rounded-full text-[11px] transition-colors",
              i < index ? "bg-accent text-accent-fg" : i === index ? "border-2 border-accent text-accent-ink" : "border border-line-strong text-faint",
            )}
          >
            {i < index ? <IconCheck size={13} strokeWidth={3} /> : i + 1}
          </span>
          <span className={i <= index ? "text-fg" : "text-faint"}>{s}</span>
          {i < steps.length - 1 && <span className={clsx("h-px w-6 md:w-10", i < index ? "bg-accent" : "bg-line-strong")} />}
        </li>
      ))}
    </ol>
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
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
      <Card className="relative flex flex-col gap-6 overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-accent opacity-15 blur-3xl" />
        <div className="relative">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">Make your quiz</h2>
          <p className="mt-1 text-[15px] text-muted">Pick the question types you want. We&apos;ll mix them up.</p>
        </div>
        <div className="relative flex flex-wrap gap-2">
          {QUESTION_TYPES.map((t) => {
            const on = types.includes(t);
            return (
              <motion.button
                key={t}
                type="button"
                whileTap={{ scale: 0.94 }}
                aria-pressed={on}
                onClick={() => toggle(t)}
                className={clsx(
                  "flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                  on ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                <span className={clsx("flex size-4 items-center justify-center rounded-full transition", on ? "bg-accent text-accent-fg" : "border border-line-strong")}>
                  {on && <IconCheck size={11} strokeWidth={3.2} />}
                </span>
                {QUESTION_TYPE_LABELS[t]}
              </motion.button>
            );
          })}
        </div>
        <label className="relative flex items-center gap-4 text-sm font-medium">
          <span className="w-20 shrink-0 text-muted">Questions</span>
          <input type="range" min={5} max={40} value={count} onChange={(e) => setCount(Number(e.target.value))} className="flex-1" aria-label="Number of questions" />
          <span className="w-10 text-right text-lg font-semibold tabular-nums">{count}</span>
        </label>
        <input
          className="relative h-12 rounded-2xl border border-line bg-bg px-4 text-[15px] outline-none transition placeholder:text-faint focus:border-accent"
          placeholder="Anything to focus on? (optional)"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          maxLength={500}
        />
        <Button size="lg" onClick={make} loading={busy} className="relative">
          {!busy && <IconSparkle size={20} />} {busy ? "Writing your questions…" : "Make quiz"}
        </Button>
      </Card>
    </motion.div>
  );
}
