import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/app-shell";
import { BrandMark, IconCards, IconCheck, IconPlay, IconSparkle, IconTimer, IconUsers } from "@/components/icons";
import { buttonClass } from "@/components/ui/button-class";
import { Illustration } from "@/components/ui/illustrations";
import { APP_CONFIG } from "@/config/app";
import { questionHeadline, QUESTION_TYPE_LABELS, type QuestionType } from "@/lib/quiz/schema";
import { getSharedQuiz } from "@/lib/shared-quiz";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const quiz = await getSharedQuiz(code);
  if (!quiz) return { title: "Quiz not found" };
  const description = `${quiz.question_count} questions${quiz.class_name ? ` · ${quiz.class_name}` : ""}. Tap to take it, no sign-up needed.`;
  return {
    title: quiz.title,
    description,
    openGraph: { title: quiz.title, description, type: "website", siteName: APP_CONFIG.name },
    twitter: { card: "summary_large_image", title: quiz.title, description },
  };
}

export default function SharedQuizPage({ params }: Props) {
  return (
    <div className="bg-hero min-h-dvh">
      <header className="pt-safe mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <Link href="/" className="inline-flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.02em]">
          <BrandMark size={30} />
          {APP_CONFIG.shortName}
        </Link>
        <ThemeToggle />
      </header>
      <Suspense fallback={<SharedSkeleton />}>
        <SharedQuiz params={params} />
      </Suspense>
    </div>
  );
}

function SharedSkeleton() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-5 px-5 pt-16">
      <div className="skeleton h-7 w-28 rounded-full" />
      <div className="skeleton h-14 w-4/5 rounded-2xl" />
      <div className="skeleton h-5 w-1/2 rounded-full" />
      <div className="skeleton mt-6 h-16 w-64 rounded-full" />
    </main>
  );
}

async function SharedQuiz({ params }: Props) {
  const { code } = await params;
  const quiz = await getSharedQuiz(code);
  if (!quiz) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-5 px-5 pt-16 text-center">
        <Illustration kind="lost" className="w-48" />
        <h1 className="text-3xl font-semibold tracking-[-0.035em]">This quiz isn&apos;t available</h1>
        <p className="text-muted">The link may be wrong, or the owner stopped sharing it. Ask them to send it again.</p>
        <Link href="/" className={buttonClass("primary", "lg", "mt-2")}>
          Make your own quiz
        </Link>
      </main>
    );
  }

  const samples = quiz.questions.slice(0, 3);
  const base = `/q/${quiz.share_code}/play`;
  return (
    <main className="mx-auto flex max-w-5xl flex-col items-center px-5 pb-20 pt-10 md:pt-16">
      <div className="flex flex-col items-center text-center">
        {quiz.class_name && (
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-line-strong bg-elev/70 px-3.5 py-1.5 text-[13px] font-medium text-fg-2 backdrop-blur">
            <span className="size-1.5 rounded-full bg-accent" />
            {quiz.class_name}
            {quiz.topic_name ? ` · ${quiz.topic_name}` : ""}
          </span>
        )}
        <h1 className="max-w-3xl text-[40px] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-6xl md:text-7xl">{quiz.title}</h1>
        <p className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[15px] text-muted md:text-base">
          <span className="flex items-center gap-1.5">
            <IconCards size={18} className="text-accent-ink" /> {quiz.question_count} questions
          </span>
          {quiz.owner_name && (
            <span className="flex items-center gap-1.5">
              <IconUsers size={18} className="text-accent-ink" /> Made from {quiz.owner_name}&apos;s notes
            </span>
          )}
        </p>

        <Link href={`${base}?mode=quiz`} className={buttonClass("primary", "xl", "mt-10 w-full max-w-xs px-10 sm:w-auto")}>
          <IconPlay size={22} /> Start quiz
        </Link>
        <div className="mt-3 flex gap-2">
          <Link href={`${base}?mode=flashcards`} className={buttonClass("ghost", "md")}>
            <IconCards size={18} /> Flashcards
          </Link>
          <Link href={`${base}?mode=test`} className={buttonClass("ghost", "md")}>
            <IconTimer size={18} /> Practice test
          </Link>
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-sm text-muted">
          <IconCheck size={16} className="text-accent-ink" /> No sign-up needed to play
        </p>
      </div>

      {samples.length > 0 && (
        <div className="relative mt-16 w-full max-w-2xl">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Sneak peek</p>
          <div className="flex flex-col gap-3">
            {samples.map((q, i) => (
              <div
                key={q.id}
                className="card-sheen flex items-center gap-4 rounded-[24px] border border-line bg-elev p-5 shadow-soft"
                style={{ opacity: 1 - i * 0.22, transform: `scale(${1 - i * 0.025})` }}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-ink">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{QUESTION_TYPE_LABELS[q.type as QuestionType]}</p>
                  <p className="truncate font-medium">{questionHeadline(q)}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />
        </div>
      )}

      <div className="mt-16 flex w-full max-w-2xl flex-col items-center gap-4 rounded-[32px] border border-line bg-elev/70 p-8 text-center backdrop-blur">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-fg">
          <IconSparkle size={24} />
        </span>
        <p className="text-xl font-semibold tracking-[-0.025em]">Make quizzes from your own notes</p>
        <p className="max-w-sm text-[15px] text-muted">Snap a photo of your notes and get a quiz like this in seconds. Even messy handwriting.</p>
        <Link href="/login" className={buttonClass("secondary", "md")}>
          Try {APP_CONFIG.shortName} free
        </Link>
      </div>
    </main>
  );
}
