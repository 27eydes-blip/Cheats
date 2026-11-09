"use client";
import { Plus, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ClassTopicPicker } from "@/components/class-topic-picker";
import { InkCanvas, type InkCanvasHandle } from "@/components/ink-canvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { canvasToBlob } from "@/lib/imaging/browser";
import { createNoteFromPages } from "@/lib/notes-client";

// Letter-size page at ~150 dpi: plenty for the reader, light to upload.
const PAGE_W = 1275;
const PAGE_H = 1650;

/** iPad: take notes with Apple Pencil, highlight focus areas, make a quiz. */
export function InkScreen() {
  const [pageIds, setPageIds] = useState<string[]>(() => [crypto.randomUUID()]);
  const refs = useRef(new Map<string, InkCanvasHandle>());
  const [meta, setMeta] = useState<{ classId: string | null; topicId: string | null }>({ classId: null, topicId: null });
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  const submit = async () => {
    const handles = pageIds.map((id) => refs.current.get(id)).filter((h): h is InkCanvasHandle => !!h && !h.isEmpty());
    if (!handles.length) return toast("Write something first.", "error");
    setSaving("Saving…");
    try {
      const drafts = await Promise.all(
        handles.map(async (h, i) => ({
          id: String(i),
          blob: await canvasToBlob(h.exportCanvas()),
          previewUrl: null,
          hasFocusMarks: h.hasFocusMarks(),
        })),
      );
      const id = await createNoteFromPages(drafts, { ...meta, title, source: "ink" });
      // Fresh blank page next time (Next keeps this screen mounted).
      setPageIds([crypto.randomUUID()]);
      setTitle("");
      setSaving(null);
      router.push(`/notes/${id}`);
    } catch (e) {
      toast((e as Error).message, "error");
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Write notes</h1>
        <p className="text-sm text-muted">Write with Apple Pencil. Your palm won&apos;t leave marks. Use the pink highlighter on anything you want quizzed harder.</p>
      </div>
      {pageIds.map((id, i) => (
        <div key={id} className="relative">
          <div className="mb-1 flex items-center justify-between text-sm font-semibold text-muted">
            Page {i + 1}
            {pageIds.length > 1 && (
              <button type="button" aria-label={`Remove page ${i + 1}`} onClick={() => setPageIds((p) => p.filter((x) => x !== id))} className="rounded-lg p-1 hover:bg-danger-soft">
                <X className="size-4" />
              </button>
            )}
          </div>
          <InkCanvas
            ref={(h) => {
              if (h) refs.current.set(id, h);
              else refs.current.delete(id);
            }}
            width={PAGE_W}
            height={PAGE_H}
            ruled
          />
        </div>
      ))}
      <Button variant="secondary" onClick={() => setPageIds((p) => [...p, crypto.randomUUID()])}>
        <Plus className="size-5" /> Add page
      </Button>
      <Card className="flex flex-col gap-4 p-5">
        <ClassTopicPicker classId={meta.classId} topicId={meta.topicId} onChange={setMeta} />
        <input className="h-11 rounded-xl border border-line bg-bg px-3" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button size="lg" onClick={submit} loading={!!saving}>
          <Sparkles className="size-5" /> {saving ?? "Read my notes"}
        </Button>
      </Card>
    </div>
  );
}
