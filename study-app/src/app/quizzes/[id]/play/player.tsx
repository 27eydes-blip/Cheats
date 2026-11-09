"use client";
import clsx from "clsx";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { ArrowLeft, Check, Clock, RotateCcw, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnswerInput, Verdict } from "@/components/quiz/answer-input";
import { answerText, cardFront } from "@/components/quiz/answer-text";
import { SourcePreview } from "@/components/quiz/source-preview";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, EmptyState, Spinner } from "@/components/ui/card";
import { useLive } from "@/hooks/use-live";
import { asQuestion, getNote, getQuizSet } from "@/lib/data";
import { resolveMarkers } from "@/lib/handwriting/markers";
import { grade, type Answer, type GradeResult } from "@/lib/quiz/grade";
import { questionHeadline, type Question } from "@/lib/quiz/schema";

type Mode = "quiz" | "flashcards" | "test";

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
  if (!quiz.data?.questions.length) return <EmptyState title="No questions yet" />;
  const questions = quiz.data.questions.map(asQuestion);
  const ctx = { pageText, noteId, classId: quiz.data.class_id };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href={`/quizzes/${id}`} aria-label="Back to quiz" className="flex size-10 items-center justify-center rounded-xl hover:bg-primary-soft">
          <ArrowLeft className="size-5" />
        </Link>
        <p className="truncate font-semibold">{quiz.data.title}</p>
      </div>
      {mode === "flashcards" ? <Flashcards questions={questions} /> : mode === "test" ? <PracticeTest questions={questions} {...ctx} /> : <Practice questions={questions} {...ctx} />}
    </div>
  );
}

interface Ctx {
  pageText: Map<number, string>;
  noteId: string | null;
  classId: string | null;
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-primary-soft">
      <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" animate={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function hasAnswer(a: Answer | null) {
  if (!a) return false;
  if ("text" in a) return a.text.trim().length > 0;
  if (a.type === "matching") return Object.keys(a.pairs).length > 0;
  return true;
}

/** One question at a time with instant feedback and the source in your notes. */
function Practice({ questions, pageText, noteId, classId }: { questions: Question[] } & Ctx) {
  const [order, setOrder] = useState(() => shuffle(questions));
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [score, setScore] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const q = order[i];

  const check = useCallback(() => {
    if (!q) return;
    const r = grade(q, answer!);
    setResult(r);
    setScore((s) => s + r.score);
  }, [answer, q]);

  const next = () => {
    setI((x) => x + 1);
    setAnswer(null);
    setResult(null);
    setFlipped(false);
  };

  if (i >= order.length) {
    return (
      <Results
        score={score}
        total={order.length}
        onRestart={() => {
          setOrder(shuffle(questions));
          setI(0);
          setScore(0);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ProgressBar value={i / order.length} />
      <p className="text-sm font-semibold text-muted">
        Question {i + 1} of {order.length}
      </p>
      <AnimatePresence mode="wait">
        <motion.div key={q.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="flex flex-col gap-4">
          <Card className="p-5">
            <p className="text-xl font-semibold leading-snug" data-testid="question-prompt">
              {q.type === "flashcard" ? q.data.front : questionHeadline(q)}
            </p>
          </Card>
          {q.type === "flashcard" ? (
            <>
              {flipped ? (
                <Card className="p-5 text-lg">{q.data.back}</Card>
              ) : (
                <Button size="lg" variant="secondary" onClick={() => setFlipped(true)}>
                  Show answer
                </Button>
              )}
              {flipped && !result && (
                <div className="grid grid-cols-2 gap-3">
                  <Button size="lg" variant="secondary" onClick={() => setResult({ correct: false, score: 0 })}>
                    <X className="size-5" /> Didn&apos;t know
                  </Button>
                  <Button
                    size="lg"
                    onClick={() => {
                      setResult({ correct: true, score: 1 });
                      setScore((s) => s + 1);
                    }}
                  >
                    <Check className="size-5" /> Knew it
                  </Button>
                </div>
              )}
            </>
          ) : (
            <AnswerInput question={q} value={answer} onChange={setAnswer} reveal={!!result} classId={classId} />
          )}
        </motion.div>
      </AnimatePresence>

      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
          {q.type !== "flashcard" && <Verdict correct={result.correct} partial={result.feedback} />}
          {!result.correct && q.type !== "multiple_choice" && q.type !== "flashcard" && (
            <p className="whitespace-pre-wrap rounded-2xl bg-elev p-3 text-sm">
              <span className="font-semibold">Answer: </span>
              {answerText(q)}
            </p>
          )}
          {q.explanation && <p className="text-sm text-muted">{q.explanation}</p>}
          <SourcePreview pageText={q.source_page != null ? pageText.get(q.source_page) : undefined} quote={q.source_quote} pageIndex={q.source_page} noteId={noteId} />
        </motion.div>
      )}

      <div className="pb-safe sticky bottom-20 mt-2 md:bottom-4">
        {result ? (
          <Button size="lg" className="w-full" onClick={next} autoFocus>
            {i + 1 === order.length ? "See results" : "Next"}
          </Button>
        ) : (
          q.type !== "flashcard" && (
            <Button size="lg" className="w-full" onClick={check} disabled={!hasAnswer(answer)}>
              Check
            </Button>
          )
        )}
      </div>
    </div>
  );
}

/** Swipe right if you knew it, left to see it again. Tap to flip. */
function Flashcards({ questions }: { questions: Question[] }) {
  const [deck, setDeck] = useState(() => shuffle(questions));
  const [known, setKnown] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const total = questions.length;
  const card = deck[0];

  const answer = useCallback(
    (knewIt: boolean) => {
      setFlipped(false);
      setDeck((d) => {
        const [first, ...rest] = d;
        if (knewIt) return rest;
        // Missed cards come back a few cards later.
        const at = Math.min(rest.length, 3);
        return [...rest.slice(0, at), first, ...rest.slice(at)];
      });
      if (knewIt) setKnown((k) => k + 1);
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      if (e.key === "ArrowRight") answer(true);
      if (e.key === "ArrowLeft") answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer]);

  if (!card) {
    return (
      <Results
        score={total}
        total={total}
        label="You know every card!"
        onRestart={() => {
          setDeck(shuffle(questions));
          setKnown(0);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ProgressBar value={known / total} />
      <p className="text-center text-sm font-semibold text-muted">
        {known} of {total} known · {deck.length} left
      </p>
      <div className="relative" style={{ height: "clamp(220px, calc(100dvh - 430px), 420px)" }}>
        <AnimatePresence>
          {deck.slice(0, 2).reverse().map((c, idx, arr) => (
            <SwipeCard key={c.id} question={c} top={idx === arr.length - 1} flipped={idx === arr.length - 1 && flipped} onFlip={() => setFlipped((f) => !f)} onSwipe={answer} />
          ))}
        </AnimatePresence>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" variant="secondary" onClick={() => answer(false)}>
          <RotateCcw className="size-5" /> Again
        </Button>
        <Button size="lg" onClick={() => answer(true)}>
          <Check className="size-5" /> Got it
        </Button>
      </div>
      <p className="hidden text-center text-xs text-muted md:block">Space to flip · ← again · → got it</p>
    </div>
  );
}

function SwipeCard({
  question,
  top,
  flipped,
  onFlip,
  onSwipe,
}: {
  question: Question;
  top: boolean;
  flipped: boolean;
  onFlip: () => void;
  onSwipe: (knewIt: boolean) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const yes = useTransform(x, [20, 120], [0, 1]);
  const no = useTransform(x, [-120, -20], [1, 0]);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 110 || info.velocity.x > 600) onSwipe(true);
    else if (info.offset.x < -110 || info.velocity.x < -600) onSwipe(false);
  };
  return (
    <motion.div
      className={clsx("absolute inset-0", !top && "pointer-events-none")}
      style={{ x, rotate }}
      drag={top ? "x" : false}
      dragSnapToOrigin
      onDragEnd={onDragEnd}
      initial={{ scale: 0.95, opacity: 0, y: 12 }}
      animate={{ scale: top ? 1 : 0.95, opacity: 1, y: top ? 0 : 12 }}
      exit={{ x: x.get() >= 0 ? 400 : -400, opacity: 0, transition: { duration: 0.25 } }}
    >
      <button
        type="button"
        onClick={onFlip}
        data-testid="flashcard"
        aria-label={flipped ? `Answer: ${answerText(question)}. Tap to flip back.` : `${cardFront(question)}. Tap to see the answer.`}
        className="relative flex size-full items-center justify-center rounded-[2rem] border border-line bg-elev p-8 text-center shadow-card [perspective:1000px]"
      >
        <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.35 }} className="relative size-full [transform-style:preserve-3d]">
          <div className="absolute inset-0 flex items-center justify-center text-2xl font-semibold [backface-visibility:hidden]">{cardFront(question)}</div>
          <div className="absolute inset-0 flex items-center justify-center whitespace-pre-wrap text-xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
            {answerText(question)}
          </div>
        </motion.div>
        <motion.span aria-hidden style={{ opacity: yes }} className="absolute left-6 top-6 rounded-xl border-2 border-success px-3 py-1 font-bold text-success">
          GOT IT
        </motion.span>
        <motion.span aria-hidden style={{ opacity: no }} className="absolute right-6 top-6 rounded-xl border-2 border-danger px-3 py-1 font-bold text-danger">
          AGAIN
        </motion.span>
        {!flipped && <span className="absolute bottom-5 text-xs text-muted">Tap to flip</span>}
      </button>
    </motion.div>
  );
}

/** Timed, exam-style: answer everything, then see your score and review. */
function PracticeTest({ questions, pageText, noteId, classId }: { questions: Question[] } & Ctx) {
  const gradable = useMemo(() => questions.filter((q) => q.type !== "flashcard"), [questions]);
  const [minutes, setMinutes] = useState(() => Math.max(5, Math.round(gradable.length * 1.2)));
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [submitted, setSubmitted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt || submitted) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      // Time's up: hand it in automatically.
      if (n >= startedAt + minutes * 60_000) setSubmitted(true);
    }, 1000);
    return () => clearInterval(t);
  }, [startedAt, submitted, minutes]);

  const remaining = startedAt ? Math.max(0, startedAt + minutes * 60_000 - now) : minutes * 60_000;

  if (!gradable.length) return <EmptyState title="This quiz only has flashcards" body="Practice tests need questions with answers to grade." />;

  if (!startedAt) {
    return (
      <Card className="flex flex-col items-center gap-5 p-8 text-center">
        <Clock className="size-10 text-primary" />
        <div>
          <h2 className="text-2xl font-bold">Practice test</h2>
          <p className="text-muted">
            {gradable.length} questions. No hints until you submit, just like the real exam.
          </p>
        </div>
        <label className="flex items-center gap-3 font-medium">
          Time limit
          <input type="number" min={1} max={300} value={minutes} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))} className="h-11 w-20 rounded-xl border border-line bg-bg px-3 text-center" aria-label="Minutes" />
          minutes
        </label>
        <Button size="lg" onClick={() => (setStartedAt(Date.now()), setNow(Date.now()))}>
          Start test
        </Button>
      </Card>
    );
  }

  const results = submitted ? gradable.map((q) => (answers[q.id] ? grade(q, answers[q.id]) : { correct: false, score: 0 })) : [];
  const score = results.reduce((s, r) => s + r.score, 0);
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  const answered = gradable.filter((q) => hasAnswer(answers[q.id] ?? null)).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-14 z-20 -mx-4 flex items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur md:top-0">
        {submitted ? (
          <p className="font-bold">
            Score: {Math.round((score / gradable.length) * 100)}% ({Math.round(score * 10) / 10}/{gradable.length})
          </p>
        ) : (
          <>
            <p className={clsx("flex items-center gap-1.5 font-mono text-lg font-bold", remaining < 60_000 && "text-danger")} aria-live="polite">
              <Clock className="size-5" /> {mm}:{String(ss).padStart(2, "0")}
            </p>
            <p className="text-sm text-muted">
              {answered}/{gradable.length} answered
            </p>
            <Button size="sm" onClick={() => confirm("Submit your test?") && setSubmitted(true)}>
              Submit
            </Button>
          </>
        )}
      </div>
      {gradable.map((q, i) => (
        <Card key={q.id} className="flex flex-col gap-3 p-5" id={`q-${i}`}>
          <p className="font-semibold">
            <span className="text-muted">{i + 1}. </span>
            {questionHeadline(q)}
          </p>
          <AnswerInput question={q} value={answers[q.id] ?? null} onChange={(a) => setAnswers((s) => ({ ...s, [q.id]: a }))} reveal={submitted} classId={classId} />
          {submitted && (
            <>
              <Verdict correct={results[i].correct} partial={results[i].feedback} />
              {!results[i].correct && q.type !== "multiple_choice" && (
                <p className="whitespace-pre-wrap text-sm">
                  <span className="font-semibold">Answer: </span>
                  {answerText(q)}
                </p>
              )}
              {q.explanation && <p className="text-sm text-muted">{q.explanation}</p>}
              {!results[i].correct && <SourcePreview pageText={q.source_page != null ? pageText.get(q.source_page) : undefined} quote={q.source_quote} pageIndex={q.source_page} noteId={noteId} />}
            </>
          )}
        </Card>
      ))}
      {!submitted && (
        <Button size="lg" onClick={() => setSubmitted(true)}>
          Submit test
        </Button>
      )}
    </div>
  );
}

function Results({ score, total, onRestart, label }: { score: number; total: number; onRestart: () => void; label?: string }) {
  const pct = Math.round((score / total) * 100);
  return (
    <Card className="flex flex-col items-center gap-4 p-8 text-center">
      <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring" }}>
        <Trophy className="size-14 text-accent" />
      </motion.div>
      <p className="text-4xl font-extrabold">{pct}%</p>
      <p className="text-muted">{label ?? (pct >= 80 ? "Great work!" : pct >= 50 ? "Nice progress. Keep going!" : "Keep practicing, you've got this.")}</p>
      <div className="flex gap-2">
        <Button onClick={onRestart}>
          <RotateCcw className="size-4" /> Again
        </Button>
        <Link href="/" className={buttonClass("secondary")}>
          Done
        </Link>
      </div>
    </Card>
  );
}
