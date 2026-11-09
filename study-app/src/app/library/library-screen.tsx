"use client";
import clsx from "clsx";
import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { NoteCard, QuizCard } from "@/components/cards";
import { IconCamera, IconFolderPlus, IconGrid, IconPlus, IconTrash } from "@/components/icons";
import { PageHeader } from "@/components/screen";
import { Button, buttonClass, IconButton } from "@/components/ui/button";
import { EmptyState, Spinner } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useLive } from "@/hooks/use-live";
import { createClass, createTopic, deleteClass, deleteTopic, listClasses, listNotes, listQuizSets } from "@/lib/data";

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

  const chip = (active: boolean) =>
    clsx(
      "relative flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
      active ? "text-accent-fg" : "border border-line text-fg-2 hover:border-line-strong hover:text-fg",
    );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Library"
        title={current ? current.name : "Everything"}
        subtitle="All your classes, notes and quizzes in one place."
        actions={
          <Link href="/capture" className={buttonClass("primary")}>
            <IconCamera size={18} /> Add notes
          </Link>
        }
      />

      {/* Classes */}
      <div className="flex flex-col gap-3">
        <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          <button type="button" onClick={() => (setClassId(null), setTopicId(null))} className={chip(!classId)}>
            {!classId && <motion.span layoutId="class-pill" className="absolute inset-0 rounded-full bg-accent" />}
            <span className="relative flex items-center gap-2">
              <IconGrid size={16} /> All
            </span>
          </button>
          {classes.data?.map((c) => (
            <button key={c.id} type="button" onClick={() => (setClassId(c.id), setTopicId(null))} className={chip(classId === c.id)}>
              {classId === c.id && <motion.span layoutId="class-pill" className="absolute inset-0 rounded-full bg-accent" />}
              <span className="relative">{c.name}</span>
            </button>
          ))}
          <form
            className="flex shrink-0 items-center rounded-full border border-dashed border-line-strong pl-4 pr-1 focus-within:border-accent"
            onSubmit={(e) => {
              e.preventDefault();
              if (newClass.trim()) run(() => createClass(newClass).then((c) => (setNewClass(""), setClassId(c.id))));
            }}
          >
            <input className="h-9 w-28 bg-transparent text-sm outline-none placeholder:text-faint md:w-32" placeholder="New class" value={newClass} onChange={(e) => setNewClass(e.target.value)} />
            <IconButton label="Add class" type="submit" className="size-8">
              <IconFolderPlus size={17} />
            </IconButton>
          </form>
        </div>

        {current && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-2 rounded-[24px] border border-line bg-elev/60 p-2">
            <span className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Topics</span>
            <button
              type="button"
              onClick={() => setTopicId(null)}
              className={clsx("rounded-full px-3 py-1.5 text-sm font-medium", !topicId ? "bg-elev-2 text-fg" : "text-muted hover:text-fg")}
            >
              All
            </button>
            {current.topics.map((t) => (
              <span key={t.id} className={clsx("group flex items-center rounded-full", topicId === t.id ? "bg-elev-2" : "")}>
                <button type="button" onClick={() => setTopicId(t.id)} className={clsx("py-1.5 pl-3 text-sm font-medium", topicId === t.id ? "text-fg" : "text-muted hover:text-fg")}>
                  {t.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${t.name}`}
                  onClick={() => run(() => deleteTopic(t.id).then(() => setTopicId(null)))}
                  className="ml-1 mr-1 rounded-full p-1 text-faint opacity-0 transition hover:text-danger group-hover:opacity-100"
                >
                  <IconTrash size={13} />
                </button>
              </span>
            ))}
            <form
              className="flex items-center"
              onSubmit={(e) => {
                e.preventDefault();
                if (newTopic.trim()) run(() => createTopic(current.id, newTopic).then(() => setNewTopic("")));
              }}
            >
              <input className="h-8 w-32 bg-transparent px-2 text-sm outline-none placeholder:text-faint" placeholder="+ New topic" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} aria-label="New topic" />
              {newTopic && (
                <IconButton label="Add topic" type="submit" className="size-8">
                  <IconPlus size={16} />
                </IconButton>
              )}
            </form>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto !text-muted hover:!text-danger"
              onClick={() => confirm(`Delete the class "${current.name}"? Notes and quizzes are kept.`) && run(() => deleteClass(current.id).then(() => setClassId(null)))}
            >
              <IconTrash size={15} /> Delete class
            </Button>
          </motion.div>
        )}
      </div>

      <div className="flex w-full rounded-full border border-line bg-elev p-1 sm:w-fit" role="tablist">
        {(["quizzes", "notes"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={clsx("relative flex-1 rounded-full px-6 py-2 text-sm font-semibold capitalize transition-colors", tab === t ? "text-fg" : "text-muted")}
          >
            {tab === t && <motion.span layoutId="lib-tab" className="absolute inset-0 rounded-full bg-elev-2" />}
            <span className="relative">{t}</span>
          </button>
        ))}
      </div>

      {tab === "quizzes" ? (
        quizzes.loading ? (
          <Spinner />
        ) : shownQuizzes.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shownQuizzes.map((q) => (
              <QuizCard key={q.id} quiz={q} />
            ))}
          </div>
        ) : (
          <EmptyState art="quiz" title="No quizzes here yet" body="Add notes to this class and we'll write the questions for you.">
            <Link href="/capture" className={buttonClass("primary")}>
              <IconCamera size={18} /> Add notes
            </Link>
          </EmptyState>
        )
      ) : notes.loading ? (
        <Spinner />
      ) : notes.data?.length ? (
        <div className="-mx-2.5 grid gap-1 md:grid-cols-2">
          {notes.data.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </div>
      ) : (
        <EmptyState art="library" title="Your shelf is empty" body="Snap a page of notes and it'll be filed here, ready to study." />
      )}
    </div>
  );
}
