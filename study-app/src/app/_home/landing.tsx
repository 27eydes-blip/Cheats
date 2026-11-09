"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo, ThemeToggle } from "@/components/app-shell";
import { IconBook, IconCamera, IconCards, IconCheck, IconLink, IconPencil, IconSparkle, IconTarget } from "@/components/icons";
import { NotesToQuizDemo } from "@/components/marketing/notes-demo";
import { buttonClass } from "@/components/ui/button";
import { APP_CONFIG } from "@/config/app";

const rise = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.08 * i, duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } }),
};

const FEATURES = [
  { icon: IconCamera, title: "Reads messy handwriting", body: "Cursive, math, diagrams, scribbles. We clean up the photo and read words in context." },
  { icon: IconBook, title: "Linked to your notes", body: "Every question shows exactly where it came from, so you can check the source in one tap." },
  { icon: IconCards, title: "Six ways to study", body: "Multiple choice, flashcards, fill in the blank, true or false, short answer and matching." },
  { icon: IconTarget, title: "Quiz the hard parts", body: "Highlight what matters most and get more questions on it, harder ones too." },
  { icon: IconPencil, title: "Built for Apple Pencil", body: "Write notes on iPad and handwrite your answers. Your palm won't leave marks." },
  { icon: IconLink, title: "Made for the group chat", body: "Drop one link and your whole class can take the quiz. No sign-up needed to start." },
];

const STEPS = [
  { n: "01", title: "Snap", body: "Take a photo of your notes right after class. As many pages as you like." },
  { n: "02", title: "Check", body: "We highlight any word we weren't sure about. Tap to fix it in a second." },
  { n: "03", title: "Study", body: "Get a full quiz, flashcards and a timed practice test, all from your own notes." },
];

/**
 * Marker-style highlight: a lime block sweeps in behind the words (covering
 * them fully, with padding) and the words switch to near-black so they stay
 * readable in dark and light mode.
 */
function MarkerHighlight({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const [on, setOn] = useState(!!reduce);
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setOn(true), 550);
    return () => clearTimeout(t);
  }, [reduce]);
  return (
    <span className="relative inline-block whitespace-nowrap px-[0.12em]">
      <motion.span
        aria-hidden
        className="absolute inset-x-0 -bottom-[0.1em] top-[0.06em] -z-0 origin-left -rotate-[1deg] rounded-[0.14em] bg-accent"
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.5, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      />
      <span className={`relative transition-colors duration-300 ${on ? "text-accent-fg" : "text-fg"}`}>{children}</span>
    </span>
  );
}

export function Landing() {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="glass pt-safe sticky top-0 z-40 border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Link href="/login" className={buttonClass("ghost", "sm", "hidden sm:inline-flex")}>
              Sign in
            </Link>
            <Link href="/login" className={buttonClass("primary", "sm")}>
              Try it free
            </Link>
          </div>
        </div>
      </header>

      <section className="bg-hero relative">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 md:pt-20 lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:pb-28 lg:pt-24">
          <motion.div initial="hidden" animate="show" className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <motion.span
              custom={0}
              variants={rise}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-line-strong bg-elev/70 px-3.5 py-1.5 text-[13px] font-medium text-fg-2 backdrop-blur"
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg">
                <IconSparkle size={12} />
              </span>
              Reads even your messiest handwriting
            </motion.span>
            <motion.h1 custom={1} variants={rise} className="text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-[64px] xl:text-[70px]">
              Snap your notes.
              <br />
              <MarkerHighlight>Get a quiz</MarkerHighlight>{" "}
              in seconds.
            </motion.h1>
            <motion.p custom={2} variants={rise} className="mt-6 max-w-[34ch] text-lg leading-relaxed text-muted md:text-xl">
              {APP_CONFIG.description} No more typing flashcards by hand.
            </motion.p>
            <motion.div custom={3} variants={rise} className="mt-9 flex flex-col items-center gap-3 lg:items-start">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                <Link href="/login" className={buttonClass("primary", "xl", "px-10")}>
                  Try it free
                </Link>
              </motion.div>
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <IconCheck size={16} className="text-accent-ink" /> Free · Works on phone, iPad and laptop
              </p>
            </motion.div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
            <NotesToQuizDemo />
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-ink">How it works</p>
        <h2 className="mx-auto mb-14 max-w-2xl text-center text-3xl font-semibold tracking-[-0.035em] md:text-5xl">From notebook to quiz before your next class.</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="card-sheen rounded-[28px] border border-line bg-elev p-7 shadow-soft"
            >
              <p className="font-mono text-sm text-accent-ink">{s.n}</p>
              <p className="mt-8 text-2xl font-semibold tracking-[-0.03em]">{s.title}</p>
              <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-elev/40">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <h2 className="mb-14 max-w-xl text-3xl font-semibold tracking-[-0.035em] md:text-5xl">Everything Quizlet and Kahoot do. From your own notes.</h2>
          <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: (i % 3) * 0.08, duration: 0.45 }}
              >
                <span className="mb-5 flex size-11 items-center justify-center rounded-2xl border border-line bg-elev text-accent-ink shadow-soft">
                  <f.icon size={22} />
                </span>
                <p className="text-lg font-semibold tracking-[-0.02em]">{f.title}</p>
                <p className="mt-1.5 leading-relaxed text-muted">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <div className="relative overflow-hidden rounded-[36px] border border-line bg-elev px-6 py-16 text-center shadow-lift md:py-20">
          <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[80%] -translate-x-1/2 rounded-full bg-accent opacity-20 blur-3xl" />
          <h2 className="relative mx-auto max-w-xl text-3xl font-semibold tracking-[-0.035em] md:text-5xl">Your next quiz is one photo away.</h2>
          <p className="relative mx-auto mt-4 max-w-md text-lg text-muted">Snap tonight&apos;s notes and walk into the test ready.</p>
          <Link href="/login" className={buttonClass("primary", "xl", "relative mt-9 px-10")}>
            Try it free
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-line px-5 py-10 text-sm text-muted sm:flex-row">
        <Logo size={24} className="text-[15px]" />
        <p>Your notes stay private to you.</p>
      </footer>
    </div>
  );
}
