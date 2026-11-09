"use client";
import { IconPlus } from "./icons";
import { useState } from "react";
import { useLive } from "@/hooks/use-live";
import { createClass, createTopic, listClasses } from "@/lib/data";
import { useToast } from "./ui/toast";

/**
 * Pick (or create on the spot) the class and topic for some notes. The class
 * and topic are passed to the AI so it reads subject words correctly.
 */
export function ClassTopicPicker({
  classId,
  topicId,
  onChange,
}: {
  classId: string | null;
  topicId: string | null;
  onChange: (v: { classId: string | null; topicId: string | null }) => void;
}) {
  const classes = useLive("picker-classes", listClasses, ["classes", "topics"]);
  const toast = useToast();
  const [newClass, setNewClass] = useState<string | null>(null);
  const [newTopic, setNewTopic] = useState<string | null>(null);
  const current = classes.data?.find((c) => c.id === classId);

  const addClass = async () => {
    if (!newClass?.trim()) return setNewClass(null);
    try {
      const c = await createClass(newClass);
      await classes.refresh();
      onChange({ classId: c.id, topicId: null });
      setNewClass(null);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const addTopic = async () => {
    if (!classId || !newTopic?.trim()) return setNewTopic(null);
    try {
      const t = await createTopic(classId, newTopic);
      await classes.refresh();
      onChange({ classId, topicId: t.id });
      setNewTopic(null);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const field = "h-12 w-full rounded-2xl border border-line bg-bg px-4 text-[15px] outline-none transition focus:border-accent disabled:opacity-50";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Class
        {newClass !== null ? (
          <span className="flex gap-2">
            <input
              autoFocus
              className={field}
              placeholder="e.g. AP Chemistry"
              value={newClass}
              onChange={(e) => setNewClass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addClass())}
              aria-label="New class name"
            />
            <button type="button" onClick={addClass} className="rounded-2xl bg-accent px-4 font-semibold text-accent-fg">
              Add
            </button>
          </span>
        ) : (
          <select
            className={field}
            value={classId ?? ""}
            onChange={(e) => {
              if (e.target.value === "__new") return setNewClass("");
              onChange({ classId: e.target.value || null, topicId: null });
            }}
          >
            <option value="">No class</option>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__new">+ New class…</option>
          </select>
        )}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Topic
        {newTopic !== null ? (
          <span className="flex gap-2">
            <input
              autoFocus
              className={field}
              placeholder="e.g. Stoichiometry"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTopic())}
              aria-label="New topic name"
            />
            <button type="button" onClick={addTopic} className="rounded-2xl bg-accent px-4 font-semibold text-accent-fg">
              Add
            </button>
          </span>
        ) : (
          <select
            className={field}
            disabled={!classId}
            value={topicId ?? ""}
            onChange={(e) => {
              if (e.target.value === "__new") return setNewTopic("");
              onChange({ classId, topicId: e.target.value || null });
            }}
          >
            <option value="">{classId ? "No topic" : "Pick a class first"}</option>
            {current?.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            {classId && <option value="__new">+ New topic…</option>}
          </select>
        )}
      </label>
      {!classes.data?.length && newClass === null && (
        <button
          type="button"
          onClick={() => setNewClass("")}
          className="flex items-center gap-1 text-sm font-semibold text-accent-ink sm:col-span-2"
        >
          <IconPlus size={16} /> Add your first class (helps the AI read subject words)
        </button>
      )}
    </div>
  );
}
