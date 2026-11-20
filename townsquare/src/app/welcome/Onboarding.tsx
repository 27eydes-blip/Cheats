"use client";

import { APP_SHORT } from "@/config";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { UserListItem } from "@/lib/social";
import { finishOnboardingAction } from "@/actions/communities";
import { FollowButton } from "@/components/FollowButton";
import { CheckIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedSeal } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Illustration } from "@/components/ui/States";
import { useToast } from "@/components/providers";


/** Two short steps after sign-up: your beats, then three Voices to follow. */
export function Onboarding({ name, interests, initialInterests, initialTown, people }: { name: string; interests: string[]; initialInterests: string[]; initialTown: string; people: UserListItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[]>(initialInterests);
  void initialTown;
  const [pending, start] = useTransition();
  const steps = ["Your beats", "Your Voices"];

  const finish = () =>
    start(async () => {
      const r = await finishOnboardingAction({ interests: picked, town: "" });
      if (!r.ok) return toast(r.error, "error");
      setStep(3);
      setTimeout(() => router.push("/"), 1300);
    });

  return (
    <div className="mx-auto max-w-[560px] px-5 pt-8 pb-12 sm:pt-12">
      {step < 2 && (
        <div className="mb-8">
          <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={2} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of 2`}>
            {steps.map((s, i) => (
              <span key={s} className="h-1 flex-1 overflow-hidden bg-paper-3">
                <span className="block h-full bg-gold transition-[width] duration-500 ease-[var(--ease-out)]" style={{ width: i <= step ? "100%" : "0%" }} />
              </span>
            ))}
          </div>
          <p className="folio mt-3 text-ink-3">Step {step + 1} of 2 · {steps[step]}</p>
        </div>
      )}

      {step === 0 && (
        <section key="s0" className="animate-enter">
          <h1 className="font-display text-display font-semibold">Welcome, {name}. What are your beats?</h1>
          <p className="mt-2 text-[16px] text-ink-2">Pick a few. We'll lead your Front Page and Morning Edition with these. Change them any time.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {interests.map((i) => {
              const on = picked.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(on ? picked.filter((x) => x !== i) : [...picked, i])}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-4 text-[15px] font-semibold transition-all duration-200 active:translate-y-px ${on ? "bg-navy text-white shadow-[inset_0_-2px_0_var(--gold)]" : "bg-paper text-ink-1 ring-1 ring-rule-strong hover:ring-navy-ink"}`}
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
          <h1 className="font-display text-display font-semibold">Pick three Voices.</h1>
          <p className="mt-2 text-[16px] text-ink-2">Their takes lead your Rundown. The gold line under each name is their record on {APP_SHORT}.</p>
          <ul className="mt-6 divide-y divide-rule border-y-2 border-navy-ink">
            {people.map((u) => (
              <li key={u.id} className="flex items-center gap-3 p-3.5">
                <Avatar url={u.avatarUrl} name={u.displayName} handle={u.handle} size={46} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 font-semibold"><span className="truncate">{u.displayName}</span>{u.verified && <VerifiedSeal size={14} />}</p>
                  <p className="truncate text-[13.5px] text-ink-3">{u.bio || `@${u.handle}`}</p>
                  {u.verified && <p className="mono text-[10.5px] text-gold-ink">Verified Voice</p>}
                </div>
                <FollowButton userId={u.id} following={u.viewerFollows} small />
              </li>
            ))}
          </ul>
          <div className="mt-8 flex items-center justify-between">
            <button type="button" className="text-[14.5px] font-semibold text-ink-3 hover:text-ink-1" onClick={() => setStep(0)}>Back</button>
            <Button size="lg" onClick={finish} disabled={pending}>{pending ? "Printing your edition…" : "Show me the Front Page"}</Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="animate-scale-in py-10 text-center" role="status">
          <Illustration art="done" size={160} />
          <h1 className="mt-6 font-display text-display font-semibold">Hot off the press.</h1>
          <p className="mt-2 text-ink-2">Your Front Page is ready…</p>
        </section>
      )}
    </div>
  );
}
