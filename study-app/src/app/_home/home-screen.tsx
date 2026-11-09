"use client";
import { motion } from "framer-motion";
import { Camera, FileUp, Layers, PenTool, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AppShell, Logo, ThemeToggle } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { NoteCard, QuizCard } from "@/components/cards";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState, Spinner } from "@/components/ui/card";
import { APP_CONFIG } from "@/config/app";
import { useDevice } from "@/hooks/use-device";
import { useLive } from "@/hooks/use-live";
import { listNotes, listQuizSets, signedImageUrls } from "@/lib/data";
import { handoff } from "@/lib/handoff";

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

function useRecent() {
  const quizzes = useLive("home-quizzes", () => listQuizSets({ limit: 12 }), ["quiz_sets", "questions"]);
  const notes = useLive(
    "home-notes",
    async () => {
      const rows = await listNotes({ limit: 8 });
      const firstPages = rows
        .map((n) => n.note_pages.sort((a, b) => a.page_index - b.page_index)[0]?.image_path)
        .filter((p): p is string => !!p);
      const urls = await signedImageUrls(firstPages);
      return rows.map((n) => ({ ...n, thumb: urls[n.note_pages[0]?.image_path ?? ""] ?? null }));
    },
    ["notes", "note_pages"],
  );
  return { quizzes, notes };
}

/** Phone: open straight to a giant camera button. */
function PhoneHome() {
  const { quizzes } = useRecent();
  const latest = quizzes.data?.find((q) => q.status === "ready");
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-4 pt-6 text-center">
        <motion.div whileTap={{ scale: 0.94 }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Link
            href="/capture?camera=1"
            aria-label="Snap notes"
            className="relative flex size-52 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 text-white shadow-[0_20px_60px_-10px_rgb(168_85_247/0.6)]"
          >
            <span className="absolute inset-3 rounded-full border-4 border-white/30" />
            <Camera className="size-20" strokeWidth={1.8} />
          </Link>
        </motion.div>
        <div>
          <p className="text-xl font-bold">Snap your notes</p>
          <p className="text-sm text-muted">Get a quiz in seconds. Multiple pages are fine.</p>
        </div>
        <Link href="/capture" className="text-sm font-semibold text-primary">
          Upload photos or a PDF instead
        </Link>
      </div>

      {latest && (
        <Link
          href={`/quizzes/${latest.id}/play?mode=flashcards`}
          className="flex items-center gap-4 rounded-3xl bg-primary-soft p-4 transition active:scale-[0.98]"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-fg">
            <Layers className="size-6" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">Quick review</span>
            <span className="block truncate text-sm text-muted">Swipe through {latest.title}</span>
          </span>
        </Link>
      )}

      <section>
        <h2 className="mb-3 font-bold">Your quizzes</h2>
        {quizzes.loading ? (
          <Spinner />
        ) : quizzes.data?.length ? (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
            {quizzes.data.map((q) => (
              <QuizCard key={q.id} quiz={q} compact />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Your quizzes will show up here.</p>
        )}
      </section>
    </div>
  );
}

/** iPad: capture or write with Apple Pencil. */
function TabletHome() {
  const { quizzes, notes } = useRecent();
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <BigTile href="/capture?camera=1" icon={<Camera className="size-9" />} title="Snap notes" body="Take photos of paper notes or a whiteboard." gradient="from-violet-500 to-fuchsia-500" />
        <BigTile href="/ink" icon={<PenTool className="size-9" />} title="Write with Pencil" body="Take notes on screen. Highlight what you want quizzed." gradient="from-sky-500 to-indigo-500" />
      </div>
      <Link href="/capture" className={buttonClass("secondary", "md", "self-start")}>
        <FileUp className="size-5" /> Import photos, PDFs or slides
      </Link>
      <Recent quizzes={quizzes.data} notes={notes.data} loading={quizzes.loading} />
    </div>
  );
}

function BigTile({ href, icon, title, body, gradient }: { href: string; icon: React.ReactNode; title: string; body: string; gradient: string }) {
  return (
    <motion.div whileTap={{ scale: 0.97 }}>
      <Link href={href} className={`flex h-48 flex-col justify-between rounded-[2rem] bg-gradient-to-br ${gradient} p-6 text-white shadow-card`}>
        {icon}
        <div>
          <p className="text-2xl font-bold">{title}</p>
          <p className="text-white/85">{body}</p>
        </div>
      </Link>
    </motion.div>
  );
}

/** Laptop: full dashboard with drag-and-drop upload. */
function DesktopHome() {
  const { quizzes, notes } = useRecent();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const go = (files: File[]) => {
    if (!files.length) return;
    handoff.setFiles(files);
    router.push("/capture?from=drop");
  };
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted">Upload notes, check what the AI read, and practice.</p>
      </div>
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
        className={`flex flex-col items-center gap-3 rounded-[2rem] border-2 border-dashed p-10 text-center transition ${
          drag ? "border-primary bg-primary-soft" : "border-line bg-elev"
        }`}
      >
        <Upload className="size-10 text-primary" />
        <p className="text-lg font-semibold">Drop photos, PDFs or slides here</p>
        <p className="text-sm text-muted">JPG, PNG, HEIC, PDF or PowerPoint. Many pages at once is fine.</p>
        <button type="button" className={buttonClass("primary")} onClick={() => input.current?.click()}>
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
    return <EmptyState title="Nothing here yet" body="Snap or upload your first notes and we'll turn them into a quiz." />;
  }
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <section>
        <h2 className="mb-3 text-lg font-bold">Quizzes</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quizzes?.map((q) => <QuizCard key={q.id} quiz={q} />)}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-bold">Recent notes</h2>
        <div className="flex flex-col gap-3">
          {notes?.map((n) => <NoteCard key={n.id} note={n} thumb={n.thumb} />)}
        </div>
      </section>
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="pt-safe mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo className="text-lg" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className={buttonClass("secondary", "sm")}>
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-4 pb-20 pt-10 text-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-5">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary">
            <Sparkles className="size-4" /> Reads even messy handwriting
          </span>
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">
            Snap your notes.{" "}
            <span className="bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-400 bg-clip-text text-transparent">
              Get a quiz in seconds.
            </span>
          </h1>
          <p className="max-w-xl text-lg text-muted">{APP_CONFIG.description} No typing flashcards by hand.</p>
          <Link href="/login" className={buttonClass("primary", "lg")}>
            Get started free
          </Link>
        </motion.div>
        <div className="grid w-full gap-4 sm:grid-cols-3">
          {[
            { icon: Camera, title: "Snap after class", body: "Take a photo of any notes. We clean it up and read every word." },
            { icon: PenTool, title: "Write on iPad", body: "Take notes with Apple Pencil and highlight what matters most." },
            { icon: Layers, title: "Quizzes made for you", body: "Multiple choice, flashcards, matching and more, linked to your notes." },
          ].map((f) => (
            <Card key={f.title} className="p-6 text-left">
              <f.icon className="mb-3 size-7 text-primary" />
              <p className="font-semibold">{f.title}</p>
              <p className="text-sm text-muted">{f.body}</p>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
