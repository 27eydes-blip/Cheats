"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { deleteSponsorAction, saveSponsorAction, sponsorActiveAction, sponsorsEnabledAction } from "@/actions/sponsors";
import type { SponsoredCard as CardData } from "@/lib/ads";
import { SponsoredCard } from "@/components/feed/ForYou";
import { useToast } from "@/components/providers";
import { useConfirm } from "@/components/ui/Confirm";
import { Button } from "@/components/ui/Button";
import { BANNER_ASPECT, BANNER_HEADLINE_WORDS, BANNER_TEXT_CHARS, DEFAULT_ACCENT, MOTION_MAX_BYTES, bannerCopy, bannerCopyError, focalCrop, shortenWords, wordCount } from "@/lib/banner";

type S = {
  id: string; name: string; headline: string; body: string; url: string; button: string; alt: string; startsAt: number | null; endsAt: number | null; active: boolean; live: boolean; views: number; clicks: number; placeholder: boolean; card: CardData;
  bannerHeadline: string; bannerText: string; focalX: number; focalY: number; hasMotion: boolean; needsImage: boolean;
};
const MOTION_ACCEPT = "video/mp4,image/webp";

/** Click or drag on the image (or use the arrow keys) to choose what must stay visible in the wide banner crop. */
function FocalPicker({ src, x, y, onChange }: { src: string; x: number; y: number; onChange: (x: number, y: number) => void }) {
  const set = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onChange(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  const [size, setSize] = useState({ w: 1200, h: 630 });
  const crop = focalCrop(size.w, size.h, BANNER_ASPECT, x, y);
  return (
    <div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Focal point: what stays visible in the wide banner"
        aria-valuetext={`${Math.round(x * 100)}% across, ${Math.round(y * 100)}% down`}
        aria-valuenow={Math.round(y * 100)}
        onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), set(e))}
        onPointerMove={(e) => e.buttons && set(e)}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 0.1 : 0.02;
          const m: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
          if (m[e.key]) (e.preventDefault(), onChange(Math.min(1, Math.max(0, x + m[e.key][0])), Math.min(1, Math.max(0, y + m[e.key][1]))));
        }}
        className="relative w-full cursor-crosshair touch-none overflow-hidden rounded-[10px] ring-1 ring-[var(--hairline)] select-none"
        style={{ aspectRatio: `${size.w} / ${size.h}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} className="h-full w-full object-fill" onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth || 1200, h: e.currentTarget.naturalHeight || 630 })} />
        {/* The part of the image the 16:5 banner keeps */}
        <span aria-hidden="true" className="absolute border-2 border-white/80 shadow-[0_0_0_999px_rgb(0_0_0/0.45)]" style={{ top: `${(crop.top / size.h) * 100}%`, height: `${(crop.height / size.h) * 100}%`, left: `${(crop.left / size.w) * 100}%`, width: `${(crop.width / size.w) * 100}%`, right: "auto" }} />
        <span aria-hidden="true" className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--wn-blue-fill)]/70 shadow" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
      </div>
      <p className="mt-1 text-[12px] text-ink-3">Tap or drag to choose the focal point (arrow keys work too). The bright band is what the banner shows.</p>
    </div>
  );
}

function Counter({ n, max, unit }: { n: number; max: number; unit: string }) {
  return <span aria-live="polite" className={`text-[12px] tabular-nums ${n > max ? "font-bold text-[var(--disagree)]" : "text-ink-3"}`}>{n}/{max} {unit}</span>;
}
const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX = 5 * 1024 * 1024;
const toInput = (t: number | null) => (t ? new Date(t - new Date(t).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-white/15 ring-1 ring-[var(--hairline)] transition-all before:block before:h-5 before:w-5 before:translate-x-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-[var(--wn-blue-fill)] checked:before:translate-x-[22px]" />;
}

function Editor({ initial, onDone }: { initial: S | null; onDone: () => void }) {
  const [f, setF] = useState({ name: initial?.name ?? "", headline: initial?.headline ?? "", body: initial?.body ?? "", url: initial?.url ?? "https://", button: initial?.button ?? "Learn more", alt: initial?.alt ?? "", startsAt: toInput(initial?.startsAt ?? null), endsAt: toInput(initial?.endsAt ?? null), active: initial?.active ?? true, bannerHeadline: initial?.bannerHeadline ?? "", bannerText: initial?.bannerText ?? "" });
  const [focal, setFocal] = useState({ x: initial?.focalX ?? 0.5, y: initial?.focalY ?? 0.5 });
  const [motion, setMotion] = useState<File | null>(null);
  const [removeMotion, setRemoveMotion] = useState(false);
  const words = wordCount(f.bannerHeadline);
  const chars = [...f.bannerText.trim()].length;
  const copyError = bannerCopyError(f.bannerHeadline, f.bannerText);
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
  const pickerSrc = fileUrl ?? (removeImage ? null : initial?.card.banner?.image?.original ?? null);
  const preview: CardData = useMemo(() => {
    const copy = bannerCopy({ bannerHeadline: f.bannerHeadline, bannerText: f.bannerText, headline: f.headline || "Your headline", body: f.body });
    return {
      id: initial?.id ?? "preview", sponsor: f.name || "Sponsor name", title: f.headline || "Your headline", body: f.body, url: f.url, button: f.button || "Learn more",
      image: fileUrl ? { w600: fileUrl, w1200: fileUrl, alt: f.alt } : removeImage ? null : initial?.card.image ?? null,
      banner: { ...copy, accent: initial?.card.banner?.accent ?? DEFAULT_ACCENT, image: null, focal: focal, motion: null },
    };
  }, [f, fileUrl, removeImage, initial, focal]);
  const previewImage = pickerSrc ? { src: pickerSrc, x: focal.x, y: focal.y } : null;
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
        fd.set("focalX", String(focal.x));
        fd.set("focalY", String(focal.y));
        if (motion) fd.set("motion", motion);
        if (removeMotion) fd.set("removeMotion", "1");
        if (copyError) return setError(copyError);
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
        <fieldset className="rounded-[12px] p-3 ring-1 ring-[var(--hairline)]">
          <legend className="px-1 text-[13px] font-semibold">Banner words (what the feed shows)</legend>
          <label className="block"><span className="label flex justify-between">Banner headline <Counter n={words} max={BANNER_HEADLINE_WORDS} unit="words" /></span><input className="input" maxLength={80} value={f.bannerHeadline} onChange={set("bannerHeadline")} placeholder={shortenWords(f.headline || "Can you beat the Abyss?", BANNER_HEADLINE_WORDS)} aria-invalid={words > BANNER_HEADLINE_WORDS} /></label>
          <label className="mt-2 block"><span className="label flex justify-between">One short line <Counter n={chars} max={BANNER_TEXT_CHARS} unit="characters" /></span><input className="input" maxLength={60} value={f.bannerText} onChange={set("bannerText")} placeholder="Play free at glydrift.com" aria-invalid={chars > BANNER_TEXT_CHARS} /></label>
          <p className="mt-1 text-[12px] text-ink-3">Left empty, the banner uses a shortened headline and body.</p>
        </fieldset>
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
          {pickerSrc && <div className="mt-3"><FocalPicker src={pickerSrc} x={focal.x} y={focal.y} onChange={(x, y) => setFocal({ x, y })} /></div>}
        </fieldset>
        <fieldset className="rounded-[12px] p-3 ring-1 ring-[var(--hairline)]">
          <legend className="px-1 text-[13px] font-semibold">Short motion (optional)</legend>
          <p className="text-[12.5px] text-ink-3">An animated WebP or a short muted MP4, under 2 MB. It plays silently on a loop only while the banner is on screen; people with reduced motion, data saver or a slow connection see the still image.</p>
          <input type="file" accept={MOTION_ACCEPT} className="mt-2 block w-full text-[14px] file:mr-3 file:min-h-10 file:rounded-[10px] file:border-0 file:bg-white/[0.08] file:px-3 file:text-ink-1" aria-label="Upload motion" onChange={(e) => {
            const m = e.target.files?.[0] ?? null;
            setError(null);
            if (m && m.size > MOTION_MAX_BYTES) return setError("Motion files must be under 2 MB.");
            setMotion(m);
            setRemoveMotion(false);
          }} />
          {initial?.hasMotion && !motion && <label className="mt-2 flex min-h-10 items-center gap-2 text-[13.5px]"><input type="checkbox" checked={removeMotion} onChange={(e) => setRemoveMotion(e.target.checked)} /> Remove the current motion</label>}
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
          <p className="text-[12.5px] text-ink-3">Phone preview (390px)</p>
          <div className="mt-1 w-[390px] max-w-full overflow-hidden rounded-[18px] bg-[var(--paper)] ring-1 ring-[var(--hairline)]"><SponsoredCard ad={preview} preview previewImage={previewImage} /></div>
        </div>
        <div>
          <p className="text-[12.5px] text-ink-3">Desktop preview (feed column, shown at 62%)</p>
          <div className="mt-1 w-[400px] max-w-full overflow-hidden rounded-[12px] bg-[var(--paper)] ring-1 ring-[var(--hairline)]"><div style={{ width: 640, zoom: 0.625 }}><SponsoredCard ad={preview} preview previewImage={previewImage} /></div></div>
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
                {s.needsImage && <span className="rounded-[4px] px-1.5 py-px text-[11.5px] font-semibold text-[var(--warning,#f59e0b)] ring-1 ring-[var(--hairline)]">{s.placeholder ? "Needs a real image (placeholder)" : "Needs an image"}</span>}
                <span className="ml-auto text-[13px] text-ink-3 tabular-nums">{s.views.toLocaleString("en-US")} views · {s.clicks.toLocaleString("en-US")} clicks{s.views ? ` · ${((s.clicks / s.views) * 100).toFixed(1)}%` : ""}</span>
              </div>
              <p className="mt-0.5 text-[14px] text-ink-2"><b className="text-ink-1">{s.card.banner?.headline ?? s.headline}</b>{s.card.banner?.text ? ` · ${s.card.banner.text}` : ""}</p>
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
