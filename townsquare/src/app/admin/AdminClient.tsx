"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Banner, ModAction, ReportGroup } from "@/lib/moderation";
import { moderateAction, setBannerAction, setStoryPhotoAction } from "@/actions/moderation";
import type { StorySummary } from "@/lib/news";
import { StoryArt } from "@/components/front/StoryArt";
import { Avatar } from "@/components/ui/Avatar";
import { SeverityTag } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/providers";
import { LiveWire } from "@/components/shell/LiveWire";
import { LocalDate } from "@/components/Time";

const RAIL = { critical: "bg-breaking", high: "bg-danger", medium: "bg-warning", low: "bg-line-strong" } as const;

/** One reported target with every report about it grouped, plus one-click actions (each confirmed). */
export function ReportCard({ group: g }: { group: ReportGroup }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const act = async (action: ModAction) => {
    const who = g.user ? `@${g.user.handle}` : "this account";
    const copy: Record<string, { title: string; body: string; confirm: string; danger?: boolean }> = {
      remove: { title: "Remove this post?", body: `It's hidden for everyone and ${who} gets a notice they can appeal.`, confirm: "Remove post", danger: true },
      warn: { title: `Warn ${who}?`, body: "They get a notice from the moderation team. Nothing is removed.", confirm: "Send warning" },
      suspend: { title: `Suspend ${who} ${days ? `for ${days} day${days > 1 ? "s" : ""}` : "permanently"}?`, body: "They can still read but can't post or interact. They can appeal.", confirm: "Suspend", danger: true },
      dismiss: { title: "Dismiss these reports?", body: "No action is taken and the reports are closed.", confirm: "Dismiss" },
    };
    if (!(await confirm(copy[action]))) return;
    start(async () => {
      const r = await moderateAction({ targetType: g.targetType, targetId: g.targetId, action, note, suspendDays: days });
      if (!r.ok) return toast(r.error, "error");
      setDone(action);
      toast(`Done: ${action}`);
      setTimeout(() => router.refresh(), 600);
    });
  };

  return (
    <article className={`relative overflow-hidden border border-rule bg-paper transition-all duration-500 ${done ? "scale-[0.98] opacity-40" : ""}`}>
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${RAIL[g.severity]}`} />
      <div className="p-4 pl-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityTag level={g.severity} />
          <span className="mono rounded-[6px] bg-paper-2 px-1.5 py-0.5 text-[10.5px] font-bold text-ink-2 uppercase">{g.targetType}</span>
          {g.reasons.map((r) => (
            <span key={r.reason} className="rounded-[6px] bg-paper-2 px-2 py-0.5 text-[12px] font-semibold text-ink-2">
              {r.label} <span className="num text-ink-3">×{r.count}</span>
            </span>
          ))}
          <span className="ml-auto text-[12px] text-ink-3"><LocalDate ms={g.firstAt} options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} /></span>
        </div>
        {g.user && (
          <div className="mt-3 flex items-center gap-2.5">
            <Avatar url={g.user.avatarUrl} name={g.user.displayName} handle={g.user.handle} size={34} ring={false} />
            <div className="min-w-0">
              <a href={`/u/${g.user.handle}`} className="font-semibold hover:underline">@{g.user.handle}</a>
              <p className="text-[12.5px] text-ink-3">
                {g.user.status === "active" ? "Active" : <span className="font-semibold text-danger">Suspended</span>} · {g.user.strikes} prior strike{g.user.strikes === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        )}
        {g.post && (
          <blockquote className="mt-3 border-l-2 border-rule-strong bg-paper-2 p-3 text-[15px] whitespace-pre-wrap">
            {g.post.gone && <span className="mb-1 block text-[11px] font-bold tracking-wide text-danger uppercase">{g.post.gone}</span>}
            {g.post.body || <span className="text-ink-3">(no text)</span>}
            {g.post.media.length > 0 && <a className="mt-1.5 block text-[12.5px] text-accent hover:underline" href={`/p/${g.post.id}`}>{g.post.media.length} image(s), open post</a>}
          </blockquote>
        )}
        {g.details.length > 0 && (
          <ul className="mt-2 space-y-1 text-[13.5px] text-ink-2">
            {g.details.slice(0, 3).map((d, i) => <li key={i} className="border-l-2 border-line pl-2.5 italic">“{d}”</li>)}
          </ul>
        )}
        {done ? (
          <p className="mt-3 text-[14px] font-semibold text-success">Resolved: {done}</p>
        ) : (
          <>
            <label className="mt-3 block">
              <span className="sr-only">Moderator note</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the user and the log (optional)" className="input !py-2 !text-[14px]" />
            </label>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {g.targetType === "post" && <Button variant="danger" size="sm" disabled={pending} onClick={() => act("remove")}>Remove post</Button>}
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => act("warn")}>Warn</Button>
              <span className="flex items-center rounded-[10px] ring-1 ring-rule-strong">
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Suspension length" className="h-9 bg-transparent pr-1 pl-3 text-[13px] font-semibold focus:outline-none">
                  <option value={1}>1 day</option>
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={0}>Permanent</option>
                </select>
                <button type="button" disabled={pending} onClick={() => act("suspend")} className="h-9 border-l border-rule-strong px-3 text-[13px] font-semibold text-disagree hover:bg-danger-soft">Suspend</button>
              </span>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => act("dismiss")} className="ml-auto">Dismiss</Button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

/** Banner editor with a live preview of the ticker exactly as readers will see it. */
export function BannerComposer({ current }: { current: Banner | null }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [text, setText] = useState(current?.text ?? "");
  const [url, setUrl] = useState(current?.url ?? "");
  const [level, setLevel] = useState<Banner["level"]>(current?.level ?? "breaking");
  const [pending, start] = useTransition();
  const submit = (clear: boolean) =>
    start(async () => {
      const fd = new FormData();
      fd.set("text", text);
      fd.set("url", url);
      fd.set("level", level);
      if (clear) fd.set("clear", "1");
      const r = await setBannerAction(fd);
      toast(r.ok ? (clear ? "Banner cleared" : "Banner published") : r.error, r.ok ? "ok" : "error");
      if (r.ok && clear) setText("");
      router.refresh();
    });
  return (
    <div className="mt-4 space-y-3">
      <div className="overflow-hidden ring-1 ring-rule" aria-label="Preview">
        {text.trim() ? (
          <LiveWire items={[{ text: text.trim(), href: null, at: Date.now(), label: level === "info" ? "Update" : level === "alert" ? "Alert" : "Breaking" }]} />
        ) : (
          <div className="flex h-[var(--ticker-h)] items-center justify-center bg-surface-2 text-[13px] text-ink-3">No banner. Type a headline to preview it.</div>
        )}
      </div>
      <label className="block">
        <span className="label">Headline <span className="num font-normal text-ink-3">({text.length}/140)</span></span>
        <input value={text} onChange={(e) => setText(e.target.value.slice(0, 140))} placeholder="What's breaking?" className="input" />
      </label>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="label">Link</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/news/story/… or https://…" className="input" />
        </label>
        <fieldset>
          <legend className="label">Style</legend>
          <div className="flex rounded-[10px] bg-paper-2 p-1">
            {(["breaking", "alert", "info"] as const).map((l) => (
              <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)} className={`h-9 rounded-[8px] px-3 text-[13px] font-semibold capitalize transition-all ${level === l ? "bg-paper shadow-1 ring-1 ring-rule" : "text-ink-3"}`}>
                {l === "info" ? "Update" : l}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex gap-2">
        <Button disabled={pending || !text.trim()} onClick={async () => (await confirm({ title: "Publish this banner?", body: "It appears at the top of every page for every visitor right away.", confirm: "Publish" })) && submit(false)}>
          Publish banner
        </Button>
        {current && <Button variant="secondary" disabled={pending} onClick={() => submit(true)}>Clear</Button>}
      </div>
    </div>
  );
}

/** Story photos: upload with alt text and a credit, preview, or go back to generated art. */
export function StoryPhotos({ stories }: { stories: Pick<StorySummary, "key" | "title" | "section" | "photo">[] }) {
  const router = useRouter();
  const toast = useToast();
  const [key, setKey] = useState(stories[0]?.key ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const s = stories.find((x) => x.key === key);
  const submit = (form: FormData, remove = false) =>
    start(async () => {
      form.set("key", key);
      if (remove) form.set("remove", "1");
      const r = await setStoryPhotoAction(form);
      toast(r.ok ? (remove ? "Photo removed" : "Photo published") : r.error, r.ok ? "ok" : "error");
      if (r.ok) (setPreview(null), router.refresh());
    });
  return (
    <form className="mt-4 grid gap-4 md:grid-cols-[1fr_280px]" onSubmit={(e) => (e.preventDefault(), submit(new FormData(e.currentTarget)))}>
      <div className="space-y-3">
        <label className="block">
          <span className="label">Story</span>
          <select value={key} onChange={(e) => (setKey(e.target.value), setPreview(null))} className="input">
            {stories.map((x) => <option key={x.key} value={x.key}>{x.photo ? "● " : ""}{x.title}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Photo (JPEG, PNG or WebP; location data is stripped)</span>
          <input name="file" type="file" accept="image/jpeg,image/png,image/webp" className="input py-2" onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); }} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">Alt text</span><input name="alt" maxLength={400} placeholder="What the photo shows" className="input" /></label>
          <label className="block"><span className="label">Credit</span><input name="credit" maxLength={80} placeholder="Photographer / Agency" className="input" /></label>
        </div>
        <p className="text-[12.5px] text-ink-3">Only upload photos you have the rights to use. The credit shows on every view of the story.</p>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>{pending ? "Uploading…" : "Publish photo"}</Button>
          {s?.photo && <Button type="button" variant="secondary" disabled={pending} onClick={() => submit(new FormData(), true)}>Use generated art</Button>}
        </div>
      </div>
      <div>
        <p className="label">Preview</p>
        <div className="aspect-[16/9] overflow-hidden ring-1 ring-rule">
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : s ? <StoryArt seed={s.key} section={s.section} photo={s.photo} width={640} /> : null}
        </div>
      </div>
    </form>
  );
}
