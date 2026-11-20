"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adsEnabledAction, sponsoredCardAction } from "@/actions/menu";
import type { AdsConfig } from "@/lib/ads";
import { SponsoredCard } from "@/components/feed/ForYou";
import { useToast } from "@/components/providers";
import { Button } from "@/components/ui/Button";

/** Sponsored cards: a master switch (off by default) and the cards that rotate through the feed's sponsored slots. */
export function AdsControl({ config }: { config: AdsConfig }) {
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(config.enabled);
  const [pending, start] = useTransition();
  const done = (r: { ok: boolean; error?: string }, msg: string) => {
    toast(r.ok ? msg : (r.error ?? "Something went wrong."), r.ok ? "ok" : "error");
    if (r.ok) router.refresh();
  };
  return (
    <div className="mt-4 space-y-4">
      <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-[12px] bg-white/[0.03] px-4 ring-1 ring-rule">
        <span><span className="block font-semibold">Show sponsored cards in For You</span><span className="block text-[13px] text-ink-3">{on ? "On: one labeled card in the 4th slot, then every 10 items." : "Off: no sponsored cards anywhere."}</span></span>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            start(async () => {
              const r = await adsEnabledAction(next);
              if (!r.ok) setOn(!next);
              done(r, next ? "Sponsored cards are on" : "Sponsored cards are off");
            });
          }}
          className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-white/15 ring-1 ring-rule transition-all before:block before:h-5 before:w-5 before:translate-x-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-[var(--wn-blue-fill)] checked:before:translate-x-[22px]"
        />
      </label>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          start(async () => {
            const r = await sponsoredCardAction(new FormData(form));
            if (r.ok) form.reset();
            done(r, "Sponsored card added");
          });
        }}
      >
        <label className="block"><span className="label">Sponsor</span><input name="sponsor" maxLength={40} required placeholder="Company name" className="input" /></label>
        <label className="block"><span className="label">Link</span><input name="url" maxLength={300} required placeholder="https://…" inputMode="url" className="input" /></label>
        <label className="block sm:col-span-2"><span className="label">Headline</span><input name="title" maxLength={90} required className="input" /></label>
        <label className="block sm:col-span-2"><span className="label">Text (optional)</span><input name="body" maxLength={200} className="input" /></label>
        <div><Button type="submit" disabled={pending}>Add sponsored card</Button></div>
      </form>
      {config.cards.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {config.cards.map((c) => (
            <li key={c.id}>
              <SponsoredCard ad={c} />
              <button type="button" disabled={pending} className="mt-1 inline-flex min-h-11 items-center text-[13px] font-semibold text-disagree hover:underline" onClick={() => { const fd = new FormData(); fd.set("remove", c.id); start(async () => { done(await sponsoredCardAction(fd), "Card removed"); }); }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
