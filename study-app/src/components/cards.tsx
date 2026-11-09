"use client";
import clsx from "clsx";
import { FileText, Layers, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { COLOR_SWATCH } from "@/lib/data";

export function ClassBadge({ name, color, className }: { name?: string | null; color?: string | null; className?: string }) {
  if (!name) return null;
  return (
    <span className={clsx("inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold", className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: COLOR_SWATCH[color ?? "violet"] ?? COLOR_SWATCH.violet }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function QuizCard({
  quiz,
  compact,
}: {
  quiz: {
    id: string;
    title: string;
    status: string;
    updated_at: string;
    classes?: { name: string; color: string } | null;
    topics?: { name: string } | null;
    questions?: { count: number }[];
  };
  compact?: boolean;
}) {
  const count = quiz.questions?.[0]?.count ?? 0;
  return (
    <Link
      href={`/quizzes/${quiz.id}`}
      className={clsx(
        "group flex flex-col gap-2 rounded-3xl border border-line bg-elev p-4 shadow-card transition hover:-translate-y-0.5 hover:border-primary",
        compact && "w-56 shrink-0",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <ClassBadge name={quiz.classes?.name} color={quiz.classes?.color} />
        <Sparkles className="size-4 shrink-0 text-primary opacity-0 transition group-hover:opacity-100" />
      </div>
      <p className="line-clamp-2 font-semibold leading-snug">{quiz.title}</p>
      <p className="mt-auto flex items-center gap-1.5 text-xs text-muted">
        {quiz.status === "generating" ? (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Making questions…
          </>
        ) : quiz.status === "error" ? (
          <span className="text-danger">Generation failed</span>
        ) : (
          <>
            <Layers className="size-3.5" /> {count} questions · {timeAgo(quiz.updated_at)}
          </>
        )}
      </p>
    </Link>
  );
}

const NOTE_STATUS: Record<string, string> = {
  draft: "Draft",
  reading: "Reading…",
  review: "Ready to check",
  ready: "Quiz made",
  error: "Needs attention",
};

export function NoteCard({
  note,
  thumb,
}: {
  note: {
    id: string;
    title: string;
    status: string;
    updated_at: string;
    classes?: { name: string; color: string } | null;
    topics?: { name: string } | null;
    note_pages?: { id: string }[];
  };
  thumb?: string | null;
}) {
  return (
    <Link
      href={`/notes/${note.id}`}
      className="flex gap-3 rounded-3xl border border-line bg-elev p-3 shadow-card transition hover:border-primary"
    >
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary-soft">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="size-full object-cover" />
        ) : (
          <FileText className="size-6 text-primary" />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate font-semibold">{note.title}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <ClassBadge name={note.classes?.name} color={note.classes?.color} />
          {note.topics?.name && <span className="truncate text-xs text-muted">{note.topics.name}</span>}
        </div>
        <p className="text-xs text-muted">
          {note.note_pages?.length ?? 0} page{note.note_pages?.length === 1 ? "" : "s"} · {NOTE_STATUS[note.status] ?? note.status} ·{" "}
          {timeAgo(note.updated_at)}
        </p>
      </div>
    </Link>
  );
}
