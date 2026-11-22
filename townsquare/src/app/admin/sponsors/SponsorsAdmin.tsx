"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { deleteSponsorAction, saveSponsorAction, sponsorActiveAction, sponsorsEnabledAction } from "@/actions/sponsors";
import type { SponsoredCard as CardData } from "@/lib/ads";
import { SponsoredCard } from "@/components/feed/ForYou";
import { useToast } from "@/components/providers";
import { useConfirm } from "@/components/ui/Confirm";
import { Button } from "@/components/ui/Button";

type S = { id: string; name: string; headline: string; body: string; url: string; button: string; alt: string; startsAt: number | null; endsAt: number | null; active: boolean; live: boolean; views: number; clicks: number; placeholder: boolean; card: CardData };
const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX = 5 * 1024 * 1024;
const toInput = (t: number | null) => (t ? new Date(t - new Date(t).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-white/15 ring-1 ring-[var(--hairline)] transition-all before:block before:h-5 before:w-5 before:translate-x-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-[var(--wn-blue-fill)] checked:before:translate-x-[22px]" />;
}

function Editor({ initial, onDone }: { initial: S | null; onDone: () => void }) {
  const [f, setF] = useState({ name: initial?.name ?? "", headline: initial?.headline ?? "", body: initial?.body ?? "", url: initial?.url ?? "https://", button: initial?.button ?? "Learn more", alt: initial?.alt ?? "", startsAt: toInput(initial?.startsAt ?? null), endsAt: toInput(initial?.endsAt ?? null), active: initial?.active ?? true });
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  useEffect(() => () => void (fileUrl && URL.revokeObjectURL(fileUrl)), [fileUrl]);
  const pick = (fl: File | null) => {
    setError(null);
    if (!fl) return (setFile(null), setFileUrl(null));
    if (!ACCEPT.split(",").includes(fl.type)) return setError("Use a JPG, PNG or WebP image.");
    if (fl.size > MAX) return setError("Images must be 5 MB or smaller.");
    setFile(fl);
    setFileUrl(URL.createObjectURL(fl));
    setRemoveImage(false);
  };
  const preview: CardData = useMemo(() => ({
    id: initial?.id ?? "preview", sponsor: f.name || "Sponsor name", title: f.headline || "Your headline", body: f.body, url: f.url, button: f.button || "Learn more",
    image: fileUrl ? { w600: fileUrl, w1200: fileUrl, alt: f.alt } : removeImage ? null : initial?.card.image ?? null,
  }), [f, fileUrl, removeImage, initial]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
      <form className="grid gap-3" onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        if (initial) fd.set("id", initial.id);
        for (const [k, v] of Object.entries(f)) fd.set(k, k === "startsAt" || k === "endsAt" ? (v ? new Date(String(v)).toISOString() : "") : String(v === true ? "1" : v === false ? "0" : v));
        if (file) fd.set("image", file);
        if (removeImage) fd.set("removeImage", "1");
        start(async () => {
          const r = await saveSponsorAction(fd);
          if (!r.ok) return setError(r.error);
          toast(initial ? "Sponsor saved" : "Sponsor added");
          onDone();
          router.refresh();
        });
      }}>
        <label className="block"><span className="label">Name</span><input className="input" required maxLength={40} value={f.name} onChange={set("name")} /></label>
        <label className="block"><span className="label">Headline</span><input className="input" required maxLength={90} value={f.headline} onChange={set("headline")} /></label>
        <label className="block"><span className="label">Body text</span><textarea className="input" rows={2} maxLength={200} value={f.body} onChange={set("body")} /></label>
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <label className="block"><span className="label">Link URL</span><input className="input" required inputMode="url" maxLength={300} value={f.url} onChange={set("url")} /></label>
          <label className="block"><span className="label">Button label</span><input className="input" maxLength={24} value={f.button} onChange={set("button")} /></label>
        </div>
        <fieldset className="rounded-[12px] p-3 ring-1 ring-[var(--hairline)]">
          <legend className="px-1 text-[13px] font-semibold">Image</legend>
          <p className="text-[12.5px] text-ink-3">JPG, PNG or WebP, up to 5 MB. Cropped to 1200×630 (and 600×315 for phones); location and camera data are removed.</p>
          <input type="file" accept={ACCEPT} className="mt-2 block w-full text-[14px] file:mr-3 file:min-h-10 file:rounded-[10px] file:border-0 file:bg-white/[0.08] file:px-3 file:text-ink-1" onChange={(e) => pick(e.target.files?.[0] ?? null)} aria-label="Upload image" />
          <label className="mt-2 block"><span className="label">Alt text (describe the image)</span><input className="input" maxLength={160} value={f.alt} onChange={set("alt")} /></label>
          {initial?.card.image && !file && <label className="mt-2 flex min-h-10 items-center gap-2 text-[13.5px]"><input type="checkbox" checked={removeImage} onChange={(e) => setRemoveImage(e.target.checked)} /> {initial.placeholder ? "Hide the placeholder graphic" : "Remove the current image"}</label>}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">Starts (optional)</span><input type="datetime-local" className="input" value={f.startsAt} onChange={set("startsAt")} /></label>
          <label className="block"><span className="label">Ends (optional)</span><input type="datetime-local" className="input" value={f.endsAt} onChange={set("endsAt")} /></label>
        </div>
        <label className="flex min-h-11 items-center justify-between gap-3"><span className="font-semibold">On</span><Switch label="Sponsor on" checked={f.active} onChange={(v) => setF((x) => ({ ...x, active: v }))} /></label>
        {error && <p role="alert" className="text-[14px] font-semibold text-[var(--disagree)]">{error}</p>}
        <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : initial ? "Save sponsor" : "Add sponsor"}</Button><Button variant="secondary" onClick={onDone}>Cancel</Button></div>
      </form>
      <div aria-label="Preview" className="space-y-4">
        <div>
          <p className="text-[12.5px] text-ink-3">Phone preview</p>
          <div className="mt-1 w-[360px] max-w-full overflow-hidden rounded-[18px] bg-[var(--paper)] ring-1 ring-[var(--hairline)]"><div className="tl-row"><SponsoredCard ad={preview} preview /></div></div>
        </div>
        <div className="hidden lg:block">
          <p className="text-[12.5px] text-ink-3">Desktop preview (feed column)</p>
          <div className="mt-1 w-[400px] overflow-hidden rounded-[12px] bg-[var(--paper)] ring-1 ring-[var(--hairline)]"><div style={{ width: 640, zoom: 0.625 }}><div className="tl-row"><SponsoredCard ad={preview} preview /></div></div></div>
        </div>
      </div>
    </div>
  );
}

export function SponsorsAdmin({ sponsors, enabled }: { sponsors: S[]; enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [editing, setEditing] = useState<S | "new" | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => start(async () => {
    const r = await fn();
    toast(r.ok ? msg : r.error ?? "Something went wrong.", r.ok ? "ok" : "error");
    if (r.ok) router.refresh();
  });
  return (
    <div className="px-4 pb-10 sm:px-6">
      <label className="mt-6 flex min-h-14 items-center justify-between gap-4 rounded-[12px] px-4 ring-1 ring-[var(--hairline)]">
        <span><span className="block font-semibold">Show sponsored cards in For You</span><span className="block text-[13px] text-ink-3">{on ? "On: sponsors that are switched on and within their dates are shown." : "Off: no sponsored cards anywhere."}</span></span>
        <Switch label="Show sponsored cards" checked={on} disabled={pending} onChange={(v) => (setOn(v), act(() => sponsorsEnabledAction(v), v ? "Sponsored cards are on" : "Sponsored cards are off"))} />
      </label>

      {editing ? (
        <section aria-label={editing === "new" ? "New sponsor" : `Edit ${editing.name}`} className="mt-6">
          <h2 className="mb-3 text-[17px] font-bold">{editing === "new" ? "New sponsor" : `Edit ${editing.name}`}</h2>
          <Editor initial={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        </section>
      ) : (
        <div className="mt-6"><Button onClick={() => setEditing("new")}>Add a sponsor</Button></div>
      )}

      <section aria-labelledby="list" className="mt-8">
        <h2 id="list" className="text-[17px] font-bold">Sponsors ({sponsors.length})</h2>
        <ul className="mt-2 border-t border-[var(--hairline)]">
          {sponsors.map((s) => (
            <li key={s.id} className="border-b border-[var(--hairline)] py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">{s.name}</span>
                <span className={`rounded-[4px] px-1.5 py-px text-[11.5px] font-semibold ring-1 ring-[var(--hairline)] ${s.live ? "text-ink-1" : "text-ink-3"}`}>{s.live ? "Showing" : !s.active ? "Off" : "Outside its dates"}</span>
                {s.placeholder && <span className="text-[12.5px] text-ink-3">Placeholder image</span>}
                <span className="ml-auto text-[13px] text-ink-3 tabular-nums">{s.views.toLocaleString("en-US")} views · {s.clicks.toLocaleString("en-US")} clicks{s.views ? ` · ${((s.clicks / s.views) * 100).toFixed(1)}%` : ""}</span>
              </div>
              <p className="mt-0.5 text-[14px] text-ink-2">{s.headline}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>Edit</Button>
                <label className="flex min-h-9 items-center gap-2 text-[13.5px]"><Switch label={`${s.name} on`} checked={s.active} disabled={pending} onChange={(v) => act(() => sponsorActiveAction(s.id, v), v ? "Switched on" : "Switched off")} /> On</label>
                <Button size="sm" variant="danger" disabled={pending} onClick={async () => {
                  if (!(await confirm({ title: `Delete ${s.name}?`, body: "Its image and counters are deleted too.", confirm: "Delete", danger: true }))) return;
                  act(() => deleteSponsorAction(s.id), "Sponsor deleted");
                }}>Delete</Button>
              </div>
            </li>
          ))}
          {!sponsors.length && <li className="py-3 text-ink-3">No sponsors yet.</li>}
        </ul>
      </section>
    </div>
  );
}
