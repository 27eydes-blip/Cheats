"use client";
import clsx from "clsx";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { NoteCard, QuizCard, StatTile } from "@/components/cards";
import { IconArrowRight, IconCamera, IconCards, IconDoc, IconPencil, IconSparkle, IconUpload } from "@/components/icons";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, Spinner } from "@/components/ui/card";
import { useDevice } from "@/hooks/use-device";
import { useLive } from "@/hooks/use-live";
import { listNotes, listQuizSets, signedImageUrls } from "@/lib/data";
import { handoff } from "@/lib/handoff";
import { Landing } from "./landing";

export function HomeScreen() {
  const { user, loading } = useAuth();
  const device = useDevice();
  if (loading || !device) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!user) return <Landing />;
  return (
    <AppShell wide={device === "desktop"}>
      {device === "phone" ? <PhoneHome /> : device === "tablet" ? <TabletHome /> : <DesktopHome />}
    </AppShell>
  );
}

function useGreeting() {
  const { user } = useAuth();
  const full = (user?.user_metadata?.full_name as string | undefined) ?? "";
  const first = full.split(" ")[0];
  const h = new Date().getHours();
  const part = h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return first ? `${part}, ${first}` : part;
}

function useRecent() {
  const quizzes = useLive("home-quizzes", () => listQuizSets({ limit: 12 }), ["quiz_sets", "questions"]);
  const notes = useLive(
    "home-notes",
    async () => {
      const rows = await listNotes({ limit: 8 });
      const firstPages = rows
        .map((n) => [...n.note_pages].sort((a, b) => a.page_index - b.page_index)[0]?.image_path)
        .filter((p): p is string => !!p);
      const urls = await signedImageUrls(firstPages);
      return rows.map((n) => ({ ...n, thumb: urls[[...n.note_pages].sort((a, b) => a.page_index - b.page_index)[0]?.image_path ?? ""] ?? null }));
    },
    ["notes", "note_pages"],
  );
  return { quizzes, notes };
}

const fadeUp = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };

/** Phone: one giant camera button, right after class. */
function PhoneHome() {
  const greeting = useGreeting();
  const { quizzes } = useRecent();
  const latest = quizzes.data?.find((q) => q.status === "ready");
  return (
    <div className="flex flex-col gap-10">
      <motion.div {...fadeUp} className="flex flex-col items-center pt-4 text-center">
        <p className="mb-8 text-sm font-medium text-muted">{greeting}</p>
        <Link href="/capture?camera=1" aria-label="Snap notes" className="relative">
          <span className="animate-pulse-ring absolute inset-0 rounded-full bg-accent" />
          <span className="animate-pulse-ring absolute inset-0 rounded-full bg-accent [animation-delay:1.1s]" />
          <motion.span
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 500, damping: 18 }}
            className="relative flex size-[200px] items-center justify-center rounded-full bg-accent text-accent-fg shadow-[0_0_0_10px_var(--accent-soft),0_30px_80px_-20px_rgb(196_248_42/0.75)]"
          >
            <span className="absolute inset-[14px] rounded-full border-2 border-black/10" />
            <IconCamera size={76} strokeWidth={1.6} />
          </motion.span>
        </Link>
        <h1 className="mt-10 text-[30px] font-semibold leading-tight tracking-[-0.035em]">Snap your notes</h1>
        <p className="mt-1.5 text-[15px] text-muted">Get a quiz in seconds. Multiple pages are fine.</p>
        <Link href="/capture" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-ink">
          <IconUpload size={17} /> Upload photos or a PDF
        </Link>
      </motion.div>

      {latest && (
        <motion.div {...fadeUp} transition={{ delay: 0.08 }}>
          <Link
            href={`/quizzes/${latest.id}/play?mode=flashcards`}
            className="card-sheen flex items-center gap-4 rounded-[26px] border border-line bg-elev p-4 shadow-soft active:scale-[0.98]"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
              <IconCards size={24} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Quick review</span>
              <span className="block truncate text-sm text-muted">Swipe through {latest.title}</span>
            </span>
            <IconArrowRight size={18} className="text-faint" />
          </Link>
        </motion.div>
      )}

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-[-0.02em]">Your quizzes</h2>
          <Link href="/library" className="text-sm font-medium text-muted">
            See all
          </Link>
        </div>
        {quizzes.loading ? (
          <Spinner />
        ) : quizzes.data?.length ? (
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
            {quizzes.data.map((q) => (
              <QuizCard key={q.id} quiz={q} compact />
            ))}
          </div>
        ) : (
          <EmptyState art="quiz" title="No quizzes yet" body="Snap your first page of notes and your quiz will show up right here." />
        )}
      </section>
    </div>
  );
}

/** iPad: snap, or write with Apple Pencil. */
function TabletHome() {
  const greeting = useGreeting();
  const { quizzes, notes } = useRecent();
  return (
    <div className="flex flex-col gap-10">
      <motion.div {...fadeUp}>
        <p className="text-sm font-medium text-muted">{greeting}</p>
        <h1 className="mt-1 text-[40px] font-semibold tracking-[-0.04em]">What are we studying?</h1>
      </motion.div>
      <div className="grid gap-4 sm:grid-cols-2">
        <BigTile
          href="/capture?camera=1"
          icon={<IconCamera size={30} />}
          title="Snap notes"
          body="Photos of paper notes, slides or the whiteboard."
          accent
        />
        <BigTile href="/ink" icon={<IconPencil size={30} />} title="Write with Pencil" body="Take notes on screen. Highlight what to quiz harder." />
      </div>
      <Link href="/capture" className={buttonClass("secondary", "md", "self-start")}>
        <IconUpload size={18} /> Import photos, PDFs or slides
      </Link>
      <Recent quizzes={quizzes.data} notes={notes.data} loading={quizzes.loading} />
    </div>
  );
}

function BigTile({ href, icon, title, body, accent }: { href: string; icon: React.ReactNode; title: string; body: string; accent?: boolean }) {
  return (
    <motion.div {...fadeUp} whileHover={{ y: -4 }} whileTap={{ scale: 0.97 }} transition={{ type: "spring", stiffness: 400, damping: 26 }}>
      <Link
        href={href}
        className={clsx(
          "group relative flex h-56 flex-col justify-between overflow-hidden rounded-[32px] border p-7 shadow-soft",
          accent ? "border-transparent bg-accent text-accent-fg" : "card-sheen border-line bg-elev",
        )}
      >
        {!accent && <div className="pointer-events-none absolute -bottom-16 -right-16 size-48 rounded-full bg-accent opacity-15 blur-3xl" />}
        <span className={clsx("flex size-14 items-center justify-center rounded-2xl", accent ? "bg-black/10" : "bg-accent-soft text-accent-ink")}>{icon}</span>
        <div className="relative">
          <p className="text-[26px] font-semibold tracking-[-0.03em]">{title}</p>
          <p className={clsx("mt-1", accent ? "text-black/65" : "text-muted")}>{body}</p>
        </div>
        <IconArrowRight className="absolute right-7 top-7 transition-transform group-hover:translate-x-1" />
      </Link>
    </motion.div>
  );
}

/** Laptop: full dashboard. */
function DesktopHome() {
  const greeting = useGreeting();
  const { quizzes, notes } = useRecent();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const go = (files: File[]) => {
    if (!files.length) return;
    handoff.setFiles(files);
    router.push("/capture?from=drop");
  };
  const totalQuestions = (quizzes.data ?? []).reduce((s, q) => s + (q.questions?.[0]?.count ?? 0), 0);

  return (
    <div className="flex flex-col gap-10">
      <motion.div {...fadeUp} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">{greeting}</p>
          <h1 className="mt-1 text-[40px] font-semibold tracking-[-0.04em]">Dashboard</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/library" className={buttonClass("secondary")}>
            Library
          </Link>
          <Link href="/capture" className={buttonClass("primary")}>
            <IconSparkle size={18} /> New quiz
          </Link>
        </div>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            go([...e.dataTransfer.files]);
          }}
          className={clsx(
            "relative flex min-h-[260px] flex-col items-center justify-center gap-4 overflow-hidden rounded-[32px] border-2 border-dashed p-10 text-center transition-all",
            drag ? "scale-[1.01] border-accent bg-accent-soft" : "border-line-strong bg-elev/50",
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-hero opacity-60" />
          <motion.span animate={drag ? { y: -6, scale: 1.08 } : { y: 0, scale: 1 }} className="relative flex size-16 items-center justify-center rounded-3xl bg-accent text-accent-fg shadow-glow">
            <IconUpload size={30} />
          </motion.span>
          <div className="relative">
            <p className="text-xl font-semibold tracking-[-0.02em]">Drop your notes here</p>
            <p className="mt-1 text-[15px] text-muted">Photos, PDFs or PowerPoint. Lots of pages at once is fine.</p>
          </div>
          <button type="button" className={buttonClass("secondary", "md", "relative")} onClick={() => input.current?.click()}>
            Choose files
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept="image/*,application/pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            onChange={(e) => go([...(e.target.files ?? [])])}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <StatTile label="Quizzes" value={quizzes.data?.length ?? "–"} icon={<IconSparkle size={18} />} />
          <StatTile label="Questions" value={quizzes.data ? totalQuestions : "–"} icon={<IconCards size={18} />} />
          <StatTile label="Notes" value={notes.data?.length ?? "–"} icon={<IconDoc size={18} />} />
          <Link href="/capture?camera=1" className="group flex flex-col justify-between rounded-[24px] border border-line bg-elev p-5 shadow-soft transition hover:border-line-strong">
            <span className="flex size-9 items-center justify-center rounded-xl bg-elev-2 text-fg-2 transition group-hover:bg-accent group-hover:text-accent-fg">
              <IconCamera size={18} />
            </span>
            <p className="font-semibold">Use webcam</p>
          </Link>
        </div>
      </div>

      <Recent quizzes={quizzes.data} notes={notes.data} loading={quizzes.loading} />
    </div>
  );
}

function Recent({
  quizzes,
  notes,
  loading,
}: {
  quizzes?: Awaited<ReturnType<typeof listQuizSets>>;
  notes?: (Awaited<ReturnType<typeof listNotes>>[number] & { thumb: string | null })[];
  loading: boolean;
}) {
  if (loading) return <Spinner />;
  if (!quizzes?.length && !notes?.length) {
    return (
      <EmptyState art="notes" title="Your study space is ready" body="Snap or upload your first notes and we'll turn them into a quiz in seconds.">
        <Link href="/capture" className={buttonClass("primary")}>
          <IconCamera size={18} /> Add notes
        </Link>
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-10 xl:grid-cols-[1fr_360px]">
      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-[-0.02em]">Quizzes</h2>
        {quizzes?.length ? (
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {quizzes.map((q) => (
              <QuizCard key={q.id} quiz={q} />
            ))}
          </div>
        ) : (
          <EmptyState art="quiz" title="No quizzes yet" body="Open your notes and tap Make quiz." />
        )}
      </section>
      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-[-0.02em]">Recent notes</h2>
        <div className="-mx-2.5 flex flex-col gap-1">
          {notes?.map((n) => (
            <NoteCard key={n.id} note={n} thumb={n.thumb} />
          ))}
        </div>
      </section>
    </div>
  );
}
