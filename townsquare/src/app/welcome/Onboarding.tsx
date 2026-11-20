"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { UserListItem } from "@/lib/social";
import { finishOnboardingAction } from "@/actions/communities";
import { FollowButton } from "@/components/FollowButton";
import { CheckIcon, MapPinIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedSeal } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Illustration } from "@/components/ui/States";
import { useToast } from "@/components/providers";

const TOWNS = ["Springfield", "Riverside", "Fairview", "Franklin", "Greenville", "Madison"];

/** Three short steps after sign-up: interests, people to follow, and a home town for Local news. */
export function Onboarding({ name, interests, initialInterests, initialTown, people }: { name: string; interests: string[]; initialInterests: string[]; initialTown: string; people: UserListItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[]>(initialInterests);
  const [town, setTown] = useState(initialTown);
  const [pending, start] = useTransition();
  const steps = ["Interests", "People", "Location"];

  const finish = () =>
    start(async () => {
      const r = await finishOnboardingAction({ interests: picked, town });
      if (!r.ok) return toast(r.error, "error");
      setStep(3);
      setTimeout(() => router.push("/?tab=following"), 1300);
    });

  return (
    <div className="mx-auto max-w-[560px] px-5 pt-8 pb-12 sm:pt-12">
      {step < 3 && (
        <div className="mb-8">
          <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of 3`}>
            {steps.map((s, i) => (
              <span key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-accent-grad transition-[width] duration-500 ease-[var(--ease-out)]" style={{ width: i <= step ? "100%" : "0%" }} />
              </span>
            ))}
          </div>
          <p className="kicker mt-3 text-ink-3">Step {step + 1} of 3 · {steps[step]}</p>
        </div>
      )}

      {step === 0 && (
        <section key="s0" className="animate-enter">
          <h1 className="font-display text-h1 font-semibold">Welcome, {name}. What do you care about?</h1>
          <p className="mt-2 text-[16px] text-ink-2">Pick a few. We&apos;ll use them to shape For You and your morning briefing. You can change this any time.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {interests.map((i) => {
              const on = picked.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(on ? picked.filter((x) => x !== i) : [...picked, i])}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold transition-all duration-200 active:scale-95 ${on ? "bg-accent-grad text-white shadow-glow" : "bg-surface text-ink-1 ring-1 ring-line-strong hover:ring-accent"}`}
                >
                  {on && <CheckIcon size={15} strokeWidth={3} className="animate-pop" />}
                  {i}
                </button>
              );
            })}
          </div>
          <div className="mt-8 flex items-center justify-between">
            <button type="button" className="text-[14.5px] font-semibold text-ink-3 hover:text-ink-1" onClick={() => setStep(1)}>Skip</button>
            <Button size="lg" onClick={() => setStep(1)} disabled={picked.length === 0}>Continue{picked.length ? ` (${picked.length})` : ""}</Button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section key="s1" className="animate-enter">
          <h1 className="font-display text-h1 font-semibold">Follow a few voices</h1>
          <p className="mt-2 text-[16px] text-ink-2">Your Following feed shows their posts, newest first. No algorithm.</p>
          <ul className="card mt-6 divide-y divide-line overflow-hidden">
            {people.map((u) => (
              <li key={u.id} className="flex items-center gap-3 p-3.5">
                <Avatar url={u.avatarUrl} name={u.displayName} handle={u.handle} size={46} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 font-semibold"><span className="truncate">{u.displayName}</span>{u.verified && <VerifiedSeal size={14} />}</p>
                  <p className="truncate text-[13.5px] text-ink-3">{u.bio || `@${u.handle}`}</p>
                </div>
                <FollowButton userId={u.id} following={u.viewerFollows} small />
              </li>
            ))}
          </ul>
          <div className="mt-8 flex items-center justify-between">
            <button type="button" className="text-[14.5px] font-semibold text-ink-3 hover:text-ink-1" onClick={() => setStep(0)}>Back</button>
            <Button size="lg" onClick={() => setStep(2)}>Continue</Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section key="s2" className="animate-enter">
          <h1 className="font-display text-h1 font-semibold">Where&apos;s home?</h1>
          <p className="mt-2 text-[16px] text-ink-2">Local mode shows news, school and sports updates, and communities from your town. Optional, and only used for Local.</p>
          <label className="mt-6 block">
            <span className="label">Town or city</span>
            <span className="relative block">
              <MapPinIcon size={19} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
              <input value={town} onChange={(e) => setTown(e.target.value)} maxLength={60} placeholder="e.g. Springfield" className="input !pl-11" autoComplete="address-level2" />
            </span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {TOWNS.map((t) => (
              <button key={t} type="button" onClick={() => setTown(t)} className={`min-h-9 rounded-full px-3.5 text-[13.5px] font-semibold ring-1 transition-colors ${town === t ? "bg-accent-soft text-accent ring-accent" : "ring-line text-ink-2 hover:ring-line-strong"}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="mt-8 flex items-center justify-between">
            <button type="button" className="text-[14.5px] font-semibold text-ink-3 hover:text-ink-1" onClick={() => setStep(1)}>Back</button>
            <Button size="lg" onClick={finish} disabled={pending}>{pending ? "Saving…" : "Finish"}</Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="animate-scale-in py-10 text-center" role="status">
          <Illustration art="done" size={160} />
          <h1 className="mt-6 font-display text-h1 font-semibold">You&apos;re all set</h1>
          <p className="mt-2 text-ink-2">Taking you to your feed…</p>
        </section>
      )}
    </div>
  );
}
