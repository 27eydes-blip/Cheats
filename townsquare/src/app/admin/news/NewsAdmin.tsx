"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addSourceAction, demoDataAction, removeSourceAction, sourceActiveAction, syncNowAction, testSourceAction, updateSourceAction } from "@/actions/news";
import { CATEGORIES, LEANS } from "@/lib/newsroom/outlets";
import { useToast } from "@/components/providers";
import { useConfirm } from "@/components/ui/Confirm";
import { Button } from "@/components/ui/Button";

type Test = { ok: boolean; status: number; error: string | null; count: number; sample: { title: string; url: string; snippet: string; image: boolean }[] };

function TestResult({ t }: { t: Test }) {
  return (
    <div role="status" className="mt-2 rounded-[10px] px-3 py-2 text-[13px] ring-1 ring-[var(--hairline)]">
      {t.ok ? <p className="font-semibold">Works: {t.count} items found.</p> : <p className="font-semibold text-[var(--disagree)]">Failed: {t.error}{t.status ? ` (HTTP ${t.status})` : ""}</p>}
      {t.sample.length > 0 && (
        <ul className="mt-1 space-y-1 text-ink-2">
          {t.sample.map((s) => <li key={s.url} className="truncate">· {s.title}{s.image ? " (image)" : ""}</li>)}
        </ul>
      )}
    </div>
  );
}

export function SyncNow() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Button size="sm" disabled={pending} onClick={() => start(async () => {
      const r = await syncNowAction();
      if (!r.ok) return toast(r.error, "error");
      toast(r.data.skipped ? r.data.skipped : `Synced: ${r.data.newItems} new items, ${r.data.storiesNew} new stories, ${r.data.errors.length} errors`);
      router.refresh();
    })}>{pending ? "Syncing…" : "Sync all now"}</Button>
  );
}

export function DemoSwitch({ on, allowed, demoStories }: { on: boolean; allowed: boolean; demoStories: number }) {
  const [v, setV] = useState(on);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <label className={`mt-2 flex min-h-12 items-center justify-between gap-4 rounded-[12px] px-4 ring-1 ring-[var(--hairline)] ${allowed ? "cursor-pointer" : "opacity-70"}`}>
      <span>
        <span className="block font-semibold">Show fictional demo stories</span>
        <span className="block text-[13px] text-ink-3">{allowed ? `For local testing only. ${demoStories} sample stories with made-up outlets.` : "Always off in production. Set NEWS_DEMO=1 only on your own computer."}</span>
      </span>
      <input type="checkbox" role="switch" checked={v} disabled={!allowed || pending} onChange={(e) => {
        const next = e.target.checked;
        setV(next);
        start(async () => {
          const r = await demoDataAction(next);
          if (!r.ok) (setV(!next), toast(r.error, "error"));
          else toast(next ? "Demo stories on" : "Demo stories off");
        });
      }} className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-white/15 ring-1 ring-[var(--hairline)] transition-all before:block before:h-5 before:w-5 before:translate-x-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-[var(--wn-blue-fill)] checked:before:translate-x-[22px] disabled:cursor-not-allowed" />
    </label>
  );
}

export function AddFeed() {
  const [pending, start] = useTransition();
  const [test, setTest] = useState<Test | null>(null);
  const toast = useToast();
  const router = useRouter();
  return (
    <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      start(async () => {
        const r = await addSourceAction(new FormData(form));
        if (!r.ok) return toast(r.error, "error");
        toast("Feed added. It syncs within 10 minutes, or press Sync.");
        form.reset();
        setTest(null);
        router.refresh();
      });
    }}>
      <label className="block"><span className="label">Outlet name</span><input name="name" required maxLength={60} className="input" /></label>
      <label className="block"><span className="label">Feed URL (RSS or Atom)</span><input name="feedUrl" required inputMode="url" placeholder="https://…" className="input" /></label>
      <label className="block"><span className="label">Homepage (optional)</span><input name="homepage" inputMode="url" placeholder="https://…" className="input" /></label>
      <label className="block"><span className="label">Lean (approximate)</span>
        <select name="lean" className="input" defaultValue=""><option value="">Not rated</option>{LEANS.map((l) => <option key={l}>{l}</option>)}</select>
      </label>
      <label className="block sm:col-span-2"><span className="label">Where the rating comes from</span><input name="note" maxLength={300} placeholder="e.g. AllSides rates it Center (2025)" className="input" /></label>
      <label className="block"><span className="label">Category hint</span>
        <select name="category" className="input" defaultValue=""><option value="">General news</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      </label>
      <label className="block"><span className="label">Type</span>
        <select name="type" className="input" defaultValue="digital">{["wire", "paper", "tv", "digital", "magazine", "public", "international"].map((t) => <option key={t}>{t}</option>)}</select>
      </label>
      <label className="block"><span className="label">Badge color</span><input name="color" type="color" defaultValue="#7fa3ff" className="h-11 w-20 cursor-pointer rounded-[10px] bg-transparent" /></label>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>Add feed</Button>
        <Button variant="secondary" disabled={pending} onClick={(e) => {
          const url = (e.currentTarget.form?.elements.namedItem("feedUrl") as HTMLInputElement | null)?.value ?? "";
          start(async () => {
            const r = await testSourceAction(url);
            if (!r.ok) return toast(r.error, "error");
            setTest(r.data as Test);
          });
        }}>Test feed</Button>
      </div>
      {test && <div className="sm:col-span-2"><TestResult t={test} /></div>}
    </form>
  );
}

export function SourceRowControls({ id, name, lean, note, feedUrl, active }: { id: string; name: string; lean: string | null; note: string; feedUrl: string | null; active: boolean }) {
  const [editing, setEditing] = useState(false);
  const [test, setTest] = useState<Test | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => start(async () => {
    const r = await fn();
    if (!r.ok) return toast(r.error ?? "Something went wrong.", "error");
    toast(msg);
    router.refresh();
  });
  return (
    <>
      <p className="mt-1 text-[13px] text-ink-2"><span className="font-semibold">{lean ?? "Not rated"}</span>{note && <span className="text-ink-3"> · {note}</span>}</p>
      {feedUrl && <p className="mono mt-0.5 truncate text-[11.5px] text-ink-3">{feedUrl}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => setEditing((v) => !v)}>{editing ? "Close" : "Edit"}</Button>
        {feedUrl && <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => {
          const r = await testSourceAction(id);
          if (!r.ok) return toast(r.error, "error");
          setTest(r.data as Test);
        })}>Test</Button>}
        {active && <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => {
          const r = await syncNowAction(id);
          if (!r.ok) return toast(r.error, "error");
          toast(r.data.errors.length ? `Error: ${r.data.errors[0].error}` : `Synced: ${r.data.newItems} new items`, r.data.errors.length ? "error" : "ok");
          router.refresh();
        })}>Sync</Button>}
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => sourceActiveAction(id, !active), active ? "Paused" : "Resumed")}>{active ? "Pause" : "Resume"}</Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={async () => {
          if (!(await confirm({ title: `Remove ${name}?`, body: "Its feed stops being fetched. Articles already stored stay with their stories.", confirm: "Remove", danger: true }))) return;
          act(() => removeSourceAction(id), "Removed");
        }}>Remove</Button>
      </div>
      {test && <TestResult t={test} />}
      {editing && (
        <form className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr]" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          act(() => updateSourceAction(id, { lean: String(f.get("lean")), note: String(f.get("note")), feedUrl: String(f.get("feedUrl") ?? "") }), "Saved");
          setEditing(false);
        }}>
          <label className="block"><span className="label">Lean</span>
            <select name="lean" defaultValue={lean ?? ""} className="input"><option value="">Not rated</option>{LEANS.map((l) => <option key={l}>{l}</option>)}</select>
          </label>
          <label className="block"><span className="label">Source of the rating</span><input name="note" defaultValue={note} maxLength={300} className="input" /></label>
          <label className="block sm:col-span-2"><span className="label">Feed URL (leave empty for news-API outlets)</span><input name="feedUrl" defaultValue={feedUrl ?? ""} className="input" /></label>
          <div><Button type="submit" size="sm" disabled={pending}>Save</Button></div>
        </form>
      )}
    </>
  );
}
