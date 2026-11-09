"use client";
import clsx from "clsx";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnswerInput, Verdict } from "@/components/quiz/answer-input";
import { answerText, cardFront } from "@/components/quiz/answer-text";
import { SourcePreview } from "@/components/quiz/source-preview";
import { IconCheck, IconClose, IconFlame, IconRetry, IconSparkle, IconTimer, IconTrophy } from "@/components/icons";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { celebrate } from "@/lib/celebrate";
import { grade, type Answer, type GradeResult } from "@/lib/quiz/grade";
import { questionHeadline, QUESTION_TYPE_LABELS, type Question } from "@/lib/quiz/schema";

export interface StudyContext {
  /** Note text by page, to show where a question came from (owner only). */
  pageText?: Map<number, string>;
  noteId?: string | null;
  classId?: string | null;
  /** Extra call to action on the results screen (e.g. "Sign up to save"). */
  resultsCta?: ReactNode;
  doneHref?: string;
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
    <div className="h-2 overflow-hidden rounded-full bg-elev-2">
      <motion.div
        className="h-full rounded-full bg-accent shadow-[0_0_12px_rgb(196_248_42/0.6)]"
        initial={false}
        animate={{ width: `${Math.max(2, Math.round(value * 100))}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </div>
  );
}

function hasAnswer(a: Answer | null) {
  if (!a) return false;
  if ("text" in a) return a.text.trim().length > 0;
  if (a.type === "matching") return Object.keys(a.pairs).length > 0;
  return true;
}

/* ------------------------------------------------------------------------ */
/* Practice: one question at a time, instant feedback                       */
/* ------------------------------------------------------------------------ */

export function Practice({ questions, ctx = {} }: { questions: Question[]; ctx?: StudyContext }) {
  const [order, setOrder] = useState(() => shuffle(questions));
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const q = order[i];

  const record = useCallback(
    (r: GradeResult) => {
      setResult(r);
      setScore((s) => s + r.score);
      if (r.correct) {
        const n = streak + 1;
        setStreak(n);
        setBest((b) => Math.max(b, n));
        if (n > 0 && n % 5 === 0) void celebrate("small");
      } else setStreak(0);
    },
    [streak],
  );

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
        bestStreak={best}
        ctx={ctx}
        onRestart={() => {
          setOrder(shuffle(questions));
          setI(0);
          setScore(0);
          setStreak(0);
          setBest(0);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <ProgressBar value={i / order.length} />
        </div>
        <span className="text-sm font-semibold tabular-nums text-muted">
          {i + 1}/{order.length}
        </span>
        <AnimatePresence>
          {streak >= 2 && (
            <motion.span
              key={streak}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 15 }}
              className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-fg"
              aria-label={`${streak} in a row`}
            >
              <IconFlame size={14} /> {streak}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="flex flex-col gap-5"
        >
          <Card className="relative overflow-hidden p-6 md:p-8">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{QUESTION_TYPE_LABELS[q.type]}</p>
            <p className="text-[22px] font-semibold leading-snug tracking-[-0.025em] md:text-[26px]" data-testid="question-prompt">
              {q.type === "flashcard" ? q.data.front : questionHeadline(q)}
            </p>
            <AnimatePresence>
              {result?.correct && (
                <motion.span
                  initial={{ opacity: 0, y: 10, scale: 0.5 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 14 }}
                  className="absolute right-5 top-5 flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-fg"
                >
                  <IconSparkle size={13} /> +10
                </motion.span>
              )}
            </AnimatePresence>
          </Card>
          {q.type === "flashcard" ? (
            <>
              <AnimatePresence mode="wait">
                {flipped ? (
                  <motion.div key="back" initial={{ rotateX: -80, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}>
                    <Card className="border-accent/40 bg-accent-soft p-6 text-lg leading-relaxed">{q.data.back}</Card>
                  </motion.div>
                ) : (
                  <Button key="show" size="lg" variant="secondary" onClick={() => setFlipped(true)}>
                    Show answer
                  </Button>
                )}
              </AnimatePresence>
              {flipped && !result && (
                <div className="grid grid-cols-2 gap-3">
                  <Button size="lg" variant="secondary" onClick={() => record({ correct: false, score: 0 })}>
                    <IconClose size={18} /> Didn&apos;t know
                  </Button>
                  <Button size="lg" onClick={() => record({ correct: true, score: 1 })}>
                    <IconCheck size={18} /> Knew it
                  </Button>
                </div>
              )}
            </>
          ) : (
            <AnswerInput question={q} value={answer} onChange={setAnswer} reveal={!!result} classId={ctx.classId} />
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} className="flex flex-col gap-3">
            {q.type !== "flashcard" && <Verdict correct={result.correct} partial={result.feedback} />}
            {!result.correct && q.type !== "multiple_choice" && q.type !== "flashcard" && (
              <p className="whitespace-pre-wrap rounded-[20px] border border-line bg-elev p-4 text-[15px]">
                <span className="font-semibold">Answer: </span>
                {answerText(q)}
              </p>
            )}
            {q.explanation && <p className="px-1 text-[15px] leading-relaxed text-muted">{q.explanation}</p>}
            {ctx.pageText && (
              <SourcePreview pageText={q.source_page != null ? ctx.pageText.get(q.source_page) : undefined} quote={q.source_quote} pageIndex={q.source_page} noteId={ctx.noteId ?? null} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pb-safe sticky bottom-4 z-10 mt-2 lg:bottom-6">
        {result ? (
          <Button size="lg" className="w-full" onClick={next} autoFocus>
            {i + 1 === order.length ? "See results" : "Next"}
          </Button>
        ) : (
          q.type !== "flashcard" && (
            <Button size="lg" className="w-full" onClick={() => record(grade(q, answer!))} disabled={!hasAnswer(answer)}>
              Check
            </Button>
          )
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Flashcards: 3D flip, physics swipe                                       */
/* ------------------------------------------------------------------------ */

export function Flashcards({ questions, ctx = {} }: { questions: Question[]; ctx?: StudyContext }) {
  const [deck, setDeck] = useState(() => shuffle(questions));
  const [known, setKnown] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [exitDir, setExitDir] = useState<1 | -1>(1);
  const total = questions.length;
  const card = deck[0];

  const answer = useCallback((knewIt: boolean) => {
    setExitDir(knewIt ? 1 : -1);
    setFlipped(false);
    setDeck((d) => {
      const [first, ...rest] = d;
      if (knewIt) return rest;
      // Missed cards come back a few cards later.
      const at = Math.min(rest.length, 3);
      return [...rest.slice(0, at), first, ...rest.slice(at)];
    });
    if (knewIt) setKnown((k) => k + 1);
  }, []);

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
        ctx={ctx}
        onRestart={() => {
          setDeck(shuffle(questions));
          setKnown(0);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <ProgressBar value={known / total} />
        </div>
        <span className="text-sm font-semibold tabular-nums text-muted">
          {known} of {total} known
        </span>
      </div>
      <div className="relative mx-auto w-full max-w-xl [perspective:1400px]" style={{ height: "clamp(260px, calc(100dvh - 400px), 440px)" }}>
        {deck.length > 2 && <div className="absolute inset-x-6 bottom-[-14px] top-6 rounded-[36px] border border-line bg-elev opacity-50" />}
        <AnimatePresence custom={exitDir} initial={false}>
          {deck.slice(0, 2).reverse().map((c, idx, arr) => {
            const top = idx === arr.length - 1;
            return <SwipeCard key={c.id + deck.length} question={c} top={top} flipped={top && flipped} onFlip={() => setFlipped((f) => !f)} onSwipe={answer} />;
          })}
        </AnimatePresence>
      </div>
      <p className="text-center text-xs text-faint">Tap to flip · swipe right if you knew it, left to see it again</p>
      <div className="mx-auto grid w-full max-w-xl grid-cols-2 gap-3">
        <Button size="lg" variant="secondary" onClick={() => answer(false)}>
          <IconRetry size={18} /> Again
        </Button>
        <Button size="lg" onClick={() => answer(true)}>
          <IconCheck size={18} /> Got it
        </Button>
      </div>
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
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-16, 16]);
  const yes = useTransform(x, [30, 130], [0, 1]);
  const no = useTransform(x, [-130, -30], [1, 0]);
  const dragged = useRef(false);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const power = info.offset.x + info.velocity.x * 0.25;
    if (Math.abs(power) > 140) {
      const dir = power > 0 ? 1 : -1;
      // Fling off-screen carrying the throw's velocity, then hand off.
      void animate(x, dir * 700, { type: "spring", velocity: info.velocity.x, stiffness: 220, damping: 30 });
      setTimeout(() => onSwipe(dir > 0), 140);
    } else {
      void animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
    }
    setTimeout(() => (dragged.current = false), 0);
  };

  return (
    <motion.div
      className={clsx("absolute inset-0", !top && "pointer-events-none")}
      style={{ x, rotate }}
      drag={top ? "x" : false}
      dragElastic={0.9}
      dragMomentum={false}
      onDragStart={() => (dragged.current = true)}
      onDragEnd={onDragEnd}
      initial={{ scale: 0.92, y: 18, opacity: 0 }}
      animate={{ scale: top ? 1 : 0.94, y: top ? 0 : 14, opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      whileTap={top ? { scale: 0.985 } : undefined}
    >
      <button
        type="button"
        onClick={() => !dragged.current && onFlip()}
        data-testid="flashcard"
        aria-label={flipped ? `Answer: ${answerText(question)}. Tap to flip back.` : `${cardFront(question)}. Tap to see the answer.`}
        className="relative block size-full cursor-grab [transform-style:preserve-3d] active:cursor-grabbing"
      >
        <motion.div
          className="relative size-full [transform-style:preserve-3d]"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 22 }}
        >
          <div className="card-sheen absolute inset-0 flex flex-col rounded-[36px] border border-line-strong bg-elev p-8 shadow-lift [backface-visibility:hidden]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Question</p>
            <p className="m-auto text-balance text-center text-[24px] font-semibold leading-snug tracking-[-0.025em] md:text-[28px]">{cardFront(question)}</p>
            <p className="text-center text-xs text-faint">Tap to flip</p>
          </div>
          <div className="absolute inset-0 flex flex-col rounded-[36px] border border-accent/50 bg-elev p-8 shadow-lift [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div className="pointer-events-none absolute inset-0 rounded-[36px] bg-accent-soft" />
            <p className="relative text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-ink">Answer</p>
            <p className="relative m-auto whitespace-pre-wrap text-balance text-center text-[21px] leading-relaxed text-fg md:text-[24px]">{answerText(question)}</p>
          </div>
        </motion.div>
        <motion.span style={{ opacity: yes }} aria-hidden className="absolute left-6 top-6 -rotate-12 rounded-2xl border-[3px] border-accent px-3 py-1 text-sm font-extrabold tracking-wide text-accent-ink">
          GOT IT
        </motion.span>
        <motion.span style={{ opacity: no }} aria-hidden className="absolute right-6 top-6 rotate-12 rounded-2xl border-[3px] border-danger px-3 py-1 text-sm font-extrabold tracking-wide text-danger">
          AGAIN
        </motion.span>
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------------ */
/* Practice test: timed, exam-style                                         */
/* ------------------------------------------------------------------------ */

export function PracticeTest({ questions, ctx = {} }: { questions: Question[]; ctx?: StudyContext }) {
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
      if (n >= startedAt + minutes * 60_000) setSubmitted(true);
    }, 1000);
    return () => clearInterval(t);
  }, [startedAt, submitted, minutes]);

  const results = useMemo(
    () => (submitted ? gradable.map((q) => (answers[q.id] ? grade(q, answers[q.id]) : { correct: false, score: 0 })) : []),
    [submitted, gradable, answers],
  );
  const score = results.reduce((s, r) => s + r.score, 0);
  const pct = gradable.length ? Math.round((score / gradable.length) * 100) : 0;

  useEffect(() => {
    if (submitted && pct >= 70) void celebrate(pct >= 90 ? "big" : "small");
  }, [submitted, pct]);

  if (!gradable.length) return <EmptyState art="quiz" title="This quiz only has flashcards" body="Practice tests need questions with answers to grade." />;

  if (!startedAt) {
    return (
      <Card className="relative flex flex-col items-center gap-6 overflow-hidden px-6 py-12 text-center">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-accent opacity-15 blur-3xl" />
        <span className="relative flex size-16 items-center justify-center rounded-3xl bg-accent text-accent-fg shadow-glow">
          <IconTimer size={30} />
        </span>
        <div className="relative">
          <h2 className="text-[30px] font-semibold tracking-[-0.035em]">Practice test</h2>
          <p className="mt-2 max-w-sm text-[15px] text-muted">{gradable.length} questions. No hints until you hand it in, just like the real exam.</p>
        </div>
        <label className="relative flex items-center gap-3 rounded-full border border-line bg-bg py-2 pl-5 pr-2 font-medium">
          Time limit
          <input
            type="number"
            min={1}
            max={300}
            value={minutes}
            onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
            className="h-10 w-16 rounded-full bg-elev-2 text-center font-semibold tabular-nums outline-none focus:ring-2 focus:ring-accent"
            aria-label="Minutes"
          />
          <span className="pr-3 text-muted">min</span>
        </label>
        <Button size="lg" className="relative px-10" onClick={() => (setStartedAt(Date.now()), setNow(Date.now()))}>
          Start test
        </Button>
      </Card>
    );
  }

  const remaining = Math.max(0, startedAt + minutes * 60_000 - now);
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  const answered = gradable.filter((q) => hasAnswer(answers[q.id] ?? null)).length;
  const low = remaining < 60_000;

  return (
    <div className="flex flex-col gap-5">
      <div className="glass sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 -mx-4 flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:mx-0 md:rounded-full md:border lg:top-4">
        {submitted ? (
          <p className="flex items-center gap-2 font-semibold">
            <IconTrophy size={20} className="text-accent-ink" /> Score: {pct}% ({Math.round(score * 10) / 10}/{gradable.length})
          </p>
        ) : (
          <>
            <p className={clsx("flex items-center gap-2 font-mono text-xl font-semibold tabular-nums", low && "text-danger")} aria-live="polite">
              <motion.span animate={low ? { scale: [1, 1.15, 1] } : {}} transition={{ repeat: Infinity, duration: 1 }}>
                <IconTimer size={20} />
              </motion.span>
              {mm}:{String(ss).padStart(2, "0")}
            </p>
            <div className="hidden w-40 sm:block">
              <ProgressBar value={answered / gradable.length} />
            </div>
            <span className="text-sm text-muted sm:hidden">
              {answered}/{gradable.length}
            </span>
            <Button size="sm" onClick={() => confirm("Hand in your test?") && setSubmitted(true)}>
              Submit
            </Button>
          </>
        )}
      </div>
      {submitted && <ScoreHero pct={pct} label={`${Math.round(score * 10) / 10} of ${gradable.length} correct`} />}
      {gradable.map((q, i) => (
        <Card key={q.id} className="flex flex-col gap-4 p-5 md:p-7" id={`q-${i}`}>
          <p className="text-[17px] font-semibold leading-snug tracking-[-0.015em]">
            <span className="mr-2 text-muted tabular-nums">{i + 1}.</span>
            {questionHeadline(q)}
          </p>
          <AnswerInput question={q} value={answers[q.id] ?? null} onChange={(a) => setAnswers((s) => ({ ...s, [q.id]: a }))} reveal={submitted} classId={ctx.classId} />
          {submitted && (
            <>
              <Verdict correct={results[i].correct} partial={results[i].feedback} />
              {!results[i].correct && q.type !== "multiple_choice" && (
                <p className="whitespace-pre-wrap text-[15px]">
                  <span className="font-semibold">Answer: </span>
                  {answerText(q)}
                </p>
              )}
              {q.explanation && <p className="text-sm leading-relaxed text-muted">{q.explanation}</p>}
              {!results[i].correct && ctx.pageText && (
                <SourcePreview pageText={q.source_page != null ? ctx.pageText.get(q.source_page) : undefined} quote={q.source_quote} pageIndex={q.source_page} noteId={ctx.noteId ?? null} />
              )}
            </>
          )}
        </Card>
      ))}
      {!submitted ? (
        <Button size="lg" onClick={() => setSubmitted(true)}>
          Hand in test
        </Button>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          {ctx.resultsCta}
          <Link href={ctx.doneHref ?? "/"} className={buttonClass("outline", "lg")}>
            Done
          </Link>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Results                                                                   */
/* ------------------------------------------------------------------------ */

function ScoreHero({ pct, label }: { pct: number; label: string }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="relative size-40">
        <svg viewBox="0 0 128 128" className="size-full -rotate-90">
          <circle cx="64" cy="64" r={r} fill="none" stroke="var(--bg-elev-2)" strokeWidth="11" />
          <motion.circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - pct / 100) }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            style={{ filter: "drop-shadow(0 0 8px rgb(196 248 42 / 0.55))" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <CountUp to={pct} className="text-[42px] font-semibold leading-none tracking-[-0.04em] tabular-nums" suffix="%" />
        </div>
      </div>
      <p className="text-[15px] text-muted">{label}</p>
    </div>
  );
}

function CountUp({ to, className, suffix }: { to: number; className?: string; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const controls = animate(0, to, { duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15, onUpdate: (x) => setV(Math.round(x)) });
    return () => controls.stop();
  }, [to]);
  return (
    <span className={className}>
      {v}
      {suffix}
    </span>
  );
}

export function Results({
  score,
  total,
  onRestart,
  label,
  bestStreak,
  ctx = {},
}: {
  score: number;
  total: number;
  onRestart: () => void;
  label?: string;
  bestStreak?: number;
  ctx?: StudyContext;
}) {
  const pct = Math.round((score / Math.max(1, total)) * 100);
  useEffect(() => {
    void celebrate(pct >= 80 ? "big" : "small");
  }, [pct]);
  const headline = label ?? (pct >= 90 ? "Outstanding!" : pct >= 75 ? "Great work!" : pct >= 50 ? "Nice progress" : "Keep going, you've got this");
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}>
      <Card className="relative flex flex-col items-center gap-6 overflow-hidden px-6 py-10 text-center md:py-14">
        <div className="bg-hero pointer-events-none absolute inset-0 opacity-80" />
        <motion.span
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 12, delay: 0.1 }}
          className="relative flex size-16 items-center justify-center rounded-3xl bg-accent text-accent-fg shadow-glow"
        >
          <IconTrophy size={32} />
        </motion.span>
        <h2 className="relative text-[30px] font-semibold tracking-[-0.035em] md:text-[36px]">{headline}</h2>
        <div className="relative">
          <ScoreHero pct={pct} label={`${Math.round(score * 10) / 10} of ${total} correct`} />
        </div>
        {!!bestStreak && bestStreak >= 2 && (
          <p className="relative flex items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-1.5 text-sm font-semibold text-accent-ink">
            <IconFlame size={16} /> Best streak: {bestStreak} in a row
          </p>
        )}
        <div className="relative flex flex-wrap justify-center gap-2">
          <Button size="lg" onClick={onRestart}>
            <IconRetry size={18} /> Go again
          </Button>
          {ctx.resultsCta ?? (
            <Link href={ctx.doneHref ?? "/"} className={buttonClass("outline", "lg")}>
              Done
            </Link>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
