"use client";
import { IconClose, IconPlus } from "@/components/icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { validateQuestionData, type Question, type QuestionData } from "@/lib/quiz/schema";

const field = "w-full rounded-2xl border border-line bg-bg px-4 py-2.5 text-[15px] outline-none transition focus:border-accent";

/** Form for editing any question type. Validates before saving. */
export function QuestionEditor({
  question,
  onSave,
  onCancel,
}: {
  question: Question;
  onSave: (data: QuestionData[keyof QuestionData], explanation: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [data, setData] = useState<Record<string, unknown>>(() => structuredClone(question.data) as Record<string, unknown>);
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setData((d) => ({ ...d, [k]: v }));

  const save = async () => {
    const v = validateQuestionData(question.type, data);
    if (!v.ok) return setError(v.error);
    setBusy(true);
    try {
      await onSave(v.data, explanation.trim() || null);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const text = (k: string, label: string, multiline = false) => (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {multiline ? (
        <textarea className={field} rows={2} value={String(data[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
      ) : (
        <input className={field} value={String(data[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
      )}
    </label>
  );

  const list = (k: string, label: string) => {
    const items = (data[k] as string[]) ?? [];
    return (
      <div className="flex flex-col gap-1 text-sm font-medium">
        {label}
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <input className={field} value={it} onChange={(e) => set(k, items.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" aria-label="Remove" onClick={() => set(k, items.filter((_, j) => j !== i))} className="rounded-full px-2.5 text-muted hover:bg-danger-soft hover:text-danger">
              <IconClose size={15} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => set(k, [...items, ""])} className="flex items-center gap-1 self-start text-sm font-semibold text-accent-ink">
          <IconPlus size={15} /> Add
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {question.type === "multiple_choice" && (
        <>
          {text("prompt", "Question", true)}
          <div className="flex flex-col gap-1 text-sm font-medium">
            Choices (pick the correct one)
            {((data.choices as string[]) ?? []).map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name="correct" checked={data.answer_index === i} onChange={() => set("answer_index", i)} aria-label={`Choice ${i + 1} is correct`} className="size-5 accent-[var(--accent)]" />
                <input
                  className={field}
                  value={c}
                  onChange={(e) => set("choices", (data.choices as string[]).map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button
                  type="button"
                  aria-label="Remove choice"
                  onClick={() => {
                    const choices = (data.choices as string[]).filter((_, j) => j !== i);
                    const ai = data.answer_index as number;
                    setData((d) => ({ ...d, choices, answer_index: ai === i ? 0 : ai > i ? ai - 1 : ai }));
                  }}
                  className="rounded-full px-2.5 text-muted hover:bg-danger-soft hover:text-danger"
                >
                  <IconClose size={15} />
                </button>
              </div>
            ))}
            {((data.choices as string[]) ?? []).length < 6 && (
              <button type="button" onClick={() => set("choices", [...(data.choices as string[]), ""])} className="flex items-center gap-1 self-start text-sm font-semibold text-accent-ink">
                <IconPlus size={15} /> Add choice
              </button>
            )}
          </div>
        </>
      )}
      {question.type === "flashcard" && (
        <>
          {text("front", "Front", true)}
          {text("back", "Back", true)}
        </>
      )}
      {question.type === "fill_blank" && (
        <>
          {text("prompt", 'Sentence (use "____" for the blank)', true)}
          {text("answer", "Answer")}
          {list("accepted_answers", "Also accept")}
        </>
      )}
      {question.type === "true_false" && (
        <>
          {text("statement", "Statement", true)}
          <div className="flex gap-2">
            {[true, false].map((v) => (
              <Button key={String(v)} type="button" size="sm" variant={data.answer === v ? "primary" : "secondary"} onClick={() => set("answer", v)}>
                {v ? "True" : "False"}
              </Button>
            ))}
          </div>
        </>
      )}
      {question.type === "short_answer" && (
        <>
          {text("prompt", "Question", true)}
          {text("answer", "Model answer", true)}
          {list("key_points", "Key points a good answer includes")}
        </>
      )}
      {question.type === "matching" && (
        <>
          {text("prompt", "Instructions")}
          <div className="flex flex-col gap-1 text-sm font-medium">
            Pairs
            {((data.pairs as { left: string; right: string }[]) ?? []).map((p, i) => (
              <div key={i} className="flex gap-2">
                <input className={field} value={p.left} placeholder="Term" onChange={(e) => set("pairs", (data.pairs as { left: string; right: string }[]).map((x, j) => (j === i ? { ...x, left: e.target.value } : x)))} />
                <input className={field} value={p.right} placeholder="Match" onChange={(e) => set("pairs", (data.pairs as { left: string; right: string }[]).map((x, j) => (j === i ? { ...x, right: e.target.value } : x)))} />
                <button type="button" aria-label="Remove pair" onClick={() => set("pairs", (data.pairs as unknown[]).filter((_, j) => j !== i))} className="rounded-full px-2.5 text-muted hover:bg-danger-soft hover:text-danger">
                  <IconClose size={15} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => set("pairs", [...(data.pairs as unknown[]), { left: "", right: "" }])} className="flex items-center gap-1 self-start text-sm font-semibold text-accent-ink">
              <IconPlus size={15} /> Add pair
            </button>
          </div>
        </>
      )}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Explanation
        <textarea className={field} rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </label>
      {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={save} loading={busy}>
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
