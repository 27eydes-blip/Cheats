"use client";
import clsx from "clsx";
import { FolderPlus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { NoteCard, QuizCard } from "@/components/cards";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Spinner } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useLive } from "@/hooks/use-live";
import { COLOR_SWATCH, createClass, createTopic, deleteClass, deleteTopic, listClasses, listNotes, listQuizSets } from "@/lib/data";

/** Organize classes and topics; browse every note and quiz. */
export function LibraryScreen() {
  const toast = useToast();
  const classes = useLive("lib-classes", listClasses, ["classes", "topics"]);
  const [classId, setClassId] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [tab, setTab] = useState<"quizzes" | "notes">("quizzes");
  const notes = useLive(`lib-notes:${classId}:${topicId}`, () => listNotes({ classId: classId ?? undefined, topicId: topicId ?? undefined }), ["notes"]);
  const quizzes = useLive(`lib-quizzes:${classId}`, () => listQuizSets({ classId: classId ?? undefined }), ["quiz_sets", "questions"]);
  const [newClass, setNewClass] = useState("");
  const [newTopic, setNewTopic] = useState("");

  const current = classes.data?.find((c) => c.id === classId);
  const shownQuizzes = (quizzes.data ?? []).filter((q) => !topicId || q.topic_id === topicId);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await classes.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">Library</h1>
        <Card className="flex flex-col gap-1 p-2">
          <button
            type="button"
            onClick={() => (setClassId(null), setTopicId(null))}
            className={clsx("rounded-xl px-3 py-2 text-left font-medium", !classId ? "bg-primary-soft text-primary" : "hover:bg-primary-soft")}
          >
            Everything
          </button>
          {classes.data?.map((c) => (
            <div key={c.id}>
              <div className="group flex items-center">
                <button
                  type="button"
                  onClick={() => (setClassId(c.id), setTopicId(null))}
                  className={clsx("flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left font-medium", classId === c.id && !topicId ? "bg-primary-soft text-primary" : "hover:bg-primary-soft")}
                >
                  <span className="size-2.5 rounded-full" style={{ background: COLOR_SWATCH[c.color] }} />
                  {c.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => confirm(`Delete the class "${c.name}"? Notes and quizzes are kept.`) && run(() => deleteClass(c.id).then(() => setClassId(null)))}
                  className="rounded-lg p-1.5 opacity-0 hover:bg-danger-soft group-hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              {classId === c.id &&
                c.topics.map((t) => (
                  <div key={t.id} className="group ml-6 flex items-center">
                    <button
                      type="button"
                      onClick={() => setTopicId(t.id)}
                      className={clsx("flex-1 rounded-xl px-3 py-1.5 text-left text-sm", topicId === t.id ? "bg-primary-soft font-semibold text-primary" : "hover:bg-primary-soft")}
                    >
                      {t.name}
                    </button>
                    <button type="button" aria-label={`Delete ${t.name}`} onClick={() => run(() => deleteTopic(t.id).then(() => setTopicId(null)))} className="rounded-lg p-1 opacity-0 hover:bg-danger-soft group-hover:opacity-100">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </Card>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newClass.trim()) run(() => createClass(newClass).then((c) => (setNewClass(""), setClassId(c.id))));
          }}
        >
          <input className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-elev px-3 text-sm" placeholder="New class" value={newClass} onChange={(e) => setNewClass(e.target.value)} />
          <Button size="sm" type="submit" variant="secondary" aria-label="Add class">
            <FolderPlus className="size-4" />
          </Button>
        </form>
        {current && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newTopic.trim()) run(() => createTopic(current.id, newTopic).then(() => setNewTopic("")));
            }}
          >
            <input className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-elev px-3 text-sm" placeholder={`New topic in ${current.name}`} value={newTopic} onChange={(e) => setNewTopic(e.target.value)} />
            <Button size="sm" type="submit" variant="secondary" aria-label="Add topic">
              <Plus className="size-4" />
            </Button>
          </form>
        )}
      </aside>

      <section className="flex flex-col gap-4">
        <div className="flex rounded-2xl bg-elev p-1 sm:self-start" role="tablist">
          {(["quizzes", "notes"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={clsx("flex-1 rounded-xl px-5 py-2 text-sm font-semibold capitalize", tab === t ? "bg-primary text-primary-fg" : "text-muted")}>
              {t}
            </button>
          ))}
        </div>
        {tab === "quizzes" ? (
          quizzes.loading ? (
            <Spinner />
          ) : shownQuizzes.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shownQuizzes.map((q) => (
                <QuizCard key={q.id} quiz={q} />
              ))}
            </div>
          ) : (
            <EmptyState title="No quizzes here yet" body="Add notes to this class and make a quiz from them." />
          )
        ) : notes.loading ? (
          <Spinner />
        ) : notes.data?.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {notes.data.map((n) => (
              <NoteCard key={n.id} note={n} />
            ))}
          </div>
        ) : (
          <EmptyState title="No notes here yet" />
        )}
      </section>
    </div>
  );
}
