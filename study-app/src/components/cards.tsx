"use client";
import clsx from "clsx";
import { motion } from "framer-motion";
import Link from "next/link";
import { IconAlert, IconArrowRight, IconCards, IconDoc, IconPlay, IconSpinner } from "./icons";

/** Class label: neutral pill with an accent dot (no rainbow of class colors). */
export function ClassBadge({ name, className }: { name?: string | null; color?: string | null; className?: string }) {
  if (!name) return null;
  return (
    <span className={clsx("inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-line bg-elev-2 px-2.5 py-1 text-xs font-medium text-fg-2", className)}>
      <span className="size-1.5 shrink-0 rounded-full bg-accent" />
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
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type QuizLike = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  classes?: { name: string; color: string } | null;
  topics?: { name: string } | null;
  questions?: { count: number }[];
};

export function QuizCard({ quiz, compact }: { quiz: QuizLike; compact?: boolean }) {
  const count = quiz.questions?.[0]?.count ?? 0;
  return (
    <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} transition={{ type: "spring", stiffness: 400, damping: 28 }} className={clsx(compact && "w-[220px] shrink-0")}>
      <Link
        href={`/quizzes/${quiz.id}`}
        className="group card-sheen relative flex h-full min-h-[168px] flex-col gap-3 overflow-hidden rounded-[26px] border border-line bg-elev p-5 shadow-soft transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-lift"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-accent opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-20" />
        <div className="flex items-center justify-between gap-2">
          {quiz.classes?.name ? <ClassBadge name={quiz.classes.name} /> : <span className="text-xs font-medium text-faint">No class</span>}
        </div>
        <p className="line-clamp-2 text-[17px] font-semibold leading-snug tracking-[-0.015em]">{quiz.title}</p>
        <div className="mt-auto flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[13px] text-muted">
            {quiz.status === "generating" ? (
              <>
                <IconSpinner size={14} /> Making questions…
              </>
            ) : quiz.status === "error" ? (
              <span className="flex items-center gap-1 text-danger">
                <IconAlert size={14} /> Didn&apos;t finish
              </span>
            ) : (
              <>
                <IconCards size={15} /> {count} questions · {timeAgo(quiz.updated_at)}
              </>
            )}
          </p>
          <span className="flex size-9 items-center justify-center rounded-full bg-elev-2 text-fg-2 transition-all duration-300 group-hover:bg-accent group-hover:text-accent-fg">
            <IconPlay size={15} />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

const NOTE_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "text-muted" },
  reading: { label: "Reading…", tone: "text-accent-ink" },
  review: { label: "Ready to check", tone: "text-warn" },
  ready: { label: "Quiz made", tone: "text-muted" },
  error: { label: "Needs attention", tone: "text-danger" },
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
  const st = NOTE_STATUS[note.status] ?? { label: note.status, tone: "text-muted" };
  const pages = note.note_pages?.length ?? 0;
  return (
    <Link href={`/notes/${note.id}`} className="group flex items-center gap-4 rounded-[22px] border border-transparent p-2.5 transition hover:border-line hover:bg-elev">
      <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-elev-2">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="size-full object-cover" />
        ) : (
          <IconDoc size={24} className="text-muted" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-semibold tracking-[-0.01em]">{note.title}</p>
        <p className="truncate text-[13px] text-muted">
          {note.classes?.name ? `${note.classes.name} · ` : ""}
          {pages} page{pages === 1 ? "" : "s"} · <span className={st.tone}>{st.label}</span>
        </p>
      </div>
      <IconArrowRight size={18} className="shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-fg" />
    </Link>
  );
}

/** Small metric tile for the dashboard. */
export function StatTile({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="card-sheen flex flex-col gap-3 rounded-[24px] border border-line bg-elev p-5 shadow-soft">
      <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">{icon}</span>
      <div>
        <p className="text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{value}</p>
        <p className="mt-1.5 text-[13px] text-muted">{label}</p>
      </div>
    </div>
  );
}
