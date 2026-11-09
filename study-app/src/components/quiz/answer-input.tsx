"use client";
import clsx from "clsx";
import { Check, PenLine, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { InkCanvas, type InkCanvasHandle } from "@/components/ink-canvas";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useDevice } from "@/hooks/use-device";
import { api } from "@/lib/data";
import type { Answer } from "@/lib/quiz/grade";
import type { Question } from "@/lib/quiz/schema";

/** Stable shuffle so matching options don't jump around between renders. */
function seededOrder(n: number, seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 2654435761);
    const j = Math.abs(h) % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/**
 * Answer UI for every question type. `reveal` shows right/wrong styling.
 * On iPad, typed answers can be handwritten with Apple Pencil instead.
 */
export function AnswerInput({
  question,
  value,
  onChange,
  reveal,
  classId,
}: {
  question: Question;
  value: Answer | null;
  onChange: (a: Answer) => void;
  reveal?: boolean;
  classId?: string | null;
}) {
  switch (question.type) {
    case "multiple_choice": {
      const chosen = value?.type === "multiple_choice" ? value.choice : null;
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {question.data.choices.map((c, i) => {
            const correct = i === question.data.answer_index;
            return (
              <button
                key={i}
                type="button"
                disabled={reveal}
                onClick={() => onChange({ type: "multiple_choice", choice: i })}
                className={clsx(
                  "flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left font-medium transition active:scale-[0.98]",
                  reveal && correct && "border-success bg-success-soft",
                  reveal && chosen === i && !correct && "border-danger bg-danger-soft",
                  !reveal && chosen === i && "border-primary bg-primary-soft",
                  !reveal && chosen !== i && "border-line bg-elev hover:border-primary",
                  reveal && !correct && chosen !== i && "border-line opacity-60",
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-bg text-sm font-bold">{String.fromCharCode(65 + i)}</span>
                {c}
              </button>
            );
          })}
        </div>
      );
    }
    case "true_false": {
      const chosen = value?.type === "true_false" ? value.value : null;
      return (
        <div className="grid grid-cols-2 gap-3">
          {[true, false].map((v) => {
            const correct = v === question.data.answer;
            return (
              <button
                key={String(v)}
                type="button"
                disabled={reveal}
                onClick={() => onChange({ type: "true_false", value: v })}
                className={clsx(
                  "h-16 rounded-2xl border-2 text-lg font-bold transition active:scale-[0.97]",
                  reveal && correct && "border-success bg-success-soft",
                  reveal && chosen === v && !correct && "border-danger bg-danger-soft",
                  !reveal && chosen === v ? "border-primary bg-primary-soft" : "border-line bg-elev",
                )}
              >
                {v ? "True" : "False"}
              </button>
            );
          })}
        </div>
      );
    }
    case "fill_blank":
    case "short_answer": {
      const text = value && "text" in value ? value.text : "";
      return (
        <TextAnswer
          question={question}
          text={text}
          disabled={reveal}
          multiline={question.type === "short_answer"}
          classId={classId}
          onChange={(t) => onChange({ type: question.type, text: t } as Answer)}
        />
      );
    }
    case "matching":
      return <MatchingAnswer question={question} value={value?.type === "matching" ? value.pairs : {}} onChange={(pairs) => onChange({ type: "matching", pairs })} reveal={reveal} />;
    case "flashcard":
      return null;
  }
}

function TextAnswer({
  question,
  text,
  onChange,
  disabled,
  multiline,
  classId,
}: {
  question: Question;
  text: string;
  onChange: (t: string) => void;
  disabled?: boolean;
  multiline: boolean;
  classId?: string | null;
}) {
  const device = useDevice();
  const [writing, setWriting] = useState(false);
  const [reading, setReading] = useState(false);
  const ink = useRef<InkCanvasHandle>(null);
  const toast = useToast();

  const useHandwriting = async () => {
    const h = ink.current;
    if (!h || h.isEmpty()) return;
    setReading(true);
    try {
      const canvas = h.exportCanvas();
      const base64 = canvas.toDataURL("image/png").split(",")[1];
      const prompt = "prompt" in question.data ? question.data.prompt : "";
      const r = await api<{ text: string }>("/api/read-answer", { image: base64, mediaType: "image/png", questionPrompt: prompt, classId: classId ?? null });
      onChange(r.text);
      setWriting(false);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setReading(false);
    }
  };

  const cls = "w-full rounded-2xl border-2 border-line bg-elev px-4 py-3 text-lg outline-none focus:border-primary disabled:opacity-70";
  return (
    <div className="flex flex-col gap-2">
      {writing ? (
        <>
          <InkCanvas ref={ink} width={1200} height={multiline ? 520 : 300} tools={["pen", "eraser"]} />
          <div className="flex gap-2">
            <Button onClick={useHandwriting} loading={reading}>
              Use my handwriting
            </Button>
            <Button variant="ghost" onClick={() => setWriting(false)}>
              Type instead
            </Button>
          </div>
        </>
      ) : multiline ? (
        <textarea aria-label="Your answer" className={cls} rows={4} value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder="Type your answer" />
      ) : (
        <input aria-label="Your answer" className={cls} value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder="Type the missing word" autoCapitalize="off" autoCorrect="off" />
      )}
      {device === "tablet" && !writing && !disabled && (
        <button type="button" onClick={() => setWriting(true)} className="flex items-center gap-1 self-start text-sm font-semibold text-primary">
          <PenLine className="size-4" /> Write it with Pencil
        </button>
      )}
    </div>
  );
}

function MatchingAnswer({
  question,
  value,
  onChange,
  reveal,
}: {
  question: Extract<Question, { type: "matching" }>;
  value: Record<number, number>;
  onChange: (v: Record<number, number>) => void;
  reveal?: boolean;
}) {
  const order = useMemo(() => seededOrder(question.data.pairs.length, question.id), [question.data.pairs.length, question.id]);
  const [picked, setPicked] = useState<number | null>(null);
  const usedRight = new Set(Object.values(value));
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-2">
        {question.data.pairs.map((p, i) => {
          const assigned = value[i];
          const ok = reveal && assigned === i;
          return (
            <button
              key={i}
              type="button"
              disabled={reveal}
              onClick={() => setPicked(picked === i ? null : i)}
              className={clsx(
                "min-h-12 rounded-2xl border-2 px-3 py-2 text-left text-sm font-medium",
                picked === i ? "border-primary bg-primary-soft" : "border-line bg-elev",
                reveal && (ok ? "border-success bg-success-soft" : "border-danger bg-danger-soft"),
              )}
            >
              {p.left}
              {assigned !== undefined && <span className="mt-1 block text-xs text-muted">→ {question.data.pairs[assigned].right}</span>}
              {reveal && !ok && <span className="mt-1 block text-xs text-success">✓ {p.right}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        {order.map((j) => (
          <button
            key={j}
            type="button"
            disabled={reveal || picked === null}
            onClick={() => {
              if (picked === null) return;
              const next = { ...value };
              for (const k of Object.keys(next)) if (next[Number(k)] === j) delete next[Number(k)];
              next[picked] = j;
              onChange(next);
              setPicked(null);
            }}
            className={clsx(
              "min-h-12 rounded-2xl border-2 border-dashed px-3 py-2 text-left text-sm transition",
              usedRight.has(j) ? "border-line opacity-50" : "border-line bg-elev hover:border-primary",
              picked !== null && !reveal && "border-primary",
            )}
          >
            {question.data.pairs[j].right}
          </button>
        ))}
      </div>
      {!reveal && <p className="col-span-2 text-xs text-muted">Tap a term, then tap its match.</p>}
    </div>
  );
}

export function Verdict({ correct, partial }: { correct: boolean; partial?: string }) {
  return (
    <div className={clsx("flex items-center gap-2 rounded-2xl px-4 py-3 font-bold", correct ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
      {correct ? <Check className="size-5" /> : <X className="size-5" />}
      {correct ? "Correct!" : "Not quite"}
      {partial && <span className="font-normal">{partial}</span>}
    </div>
  );
}
