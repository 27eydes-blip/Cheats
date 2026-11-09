"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { IconArrowLeft } from "@/components/icons";
import { Flashcards, Practice, PracticeTest } from "@/components/quiz/study-modes";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, Spinner } from "@/components/ui/card";
import { ModeSwitch, type Mode } from "@/app/quizzes/[id]/play/player";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { SharedQuiz } from "@/lib/shared-quiz";

/** Friends from the group chat play here: no account needed. */
export function GuestPlayer() {
  const { code } = useParams<{ code: string }>();
  const mode = (useSearchParams().get("mode") as Mode) ?? "quiz";
  const { user } = useAuth();
  const [quiz, setQuiz] = useState<SharedQuiz | null | undefined>(undefined);

  useEffect(() => {
    supabaseBrowser()
      .rpc("get_shared_quiz", { code })
      .then(({ data }) => setQuiz((data as unknown as SharedQuiz) ?? null));
  }, [code]);

  const ctx = {
    doneHref: `/q/${code}`,
    resultsCta: user ? undefined : (
      <Link href={`/login?next=${encodeURIComponent(`/q/${code}`)}`} className={buttonClass("secondary", "lg")}>
        Sign up to save your score
      </Link>
    ),
  };

  return (
    <div className="min-h-dvh">
      <header className="glass pt-safe sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link href={`/q/${code}`} aria-label="Back" className="flex size-10 items-center justify-center rounded-full border border-line bg-elev text-fg-2">
            <IconArrowLeft size={18} />
          </Link>
          <p className="min-w-0 flex-1 truncate font-semibold tracking-[-0.01em]">{quiz?.title ?? ""}</p>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-16 pt-6">
        {quiz === undefined ? (
          <div className="flex justify-center pt-20">
            <Spinner />
          </div>
        ) : !quiz?.questions.length ? (
          <EmptyState art="lost" title="This quiz isn't available" body="The owner may have stopped sharing it." />
        ) : (
          <>
            <ModeSwitch mode={mode} base={`/q/${code}/play`} />
            {mode === "flashcards" ? (
              <Flashcards key="f" questions={quiz.questions} ctx={ctx} />
            ) : mode === "test" ? (
              <PracticeTest key="t" questions={quiz.questions} ctx={ctx} />
            ) : (
              <Practice key="p" questions={quiz.questions} ctx={ctx} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
