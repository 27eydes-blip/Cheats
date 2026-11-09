"use client";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Camera, FileUp, Highlighter, Loader2, PenTool, Sparkles, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClassTopicPicker } from "@/components/class-topic-picker";
import { InkCanvas, type InkCanvasHandle } from "@/components/ink-canvas";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useDevice } from "@/hooks/use-device";
import { bitmapToImg, canvasToBlob, cleanImg, imgToCanvas, loadBitmap } from "@/lib/imaging/browser";
import { handoff } from "@/lib/handoff";
import { createNoteFromPages, type DraftPage, type NoteSource } from "@/lib/notes-client";
import { CameraView } from "./camera";

interface CapturedPage {
  id: string;
  /** Cleaned page (what gets read). */
  cleaned: HTMLCanvasElement | null;
  /** Original, for the before/after toggle. */
  original: HTMLCanvasElement | null;
  cleanedUrl: string | null;
  originalUrl: string | null;
  showOriginal: boolean;
  /** Final composite with focus marks, if the student marked the page. */
  marked: HTMLCanvasElement | null;
  markedUrl: string | null;
  sourceText?: string;
  status: "processing" | "ready" | "error";
  label?: string;
}

const uid = () => crypto.randomUUID();
const ACCEPT = "image/*,application/pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation";

export function CaptureScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const device = useDevice();
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [camera, setCamera] = useState(() => params.get("camera") === "1");
  const [source, setSource] = useState<NoteSource>("camera");
  const [meta, setMeta] = useState<{ classId: string | null; topicId: string | null }>({ classId: null, topicId: null });
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const systemCamera = useRef<HTMLInputElement>(null);

  const update = (id: string, patch: Partial<CapturedPage>) =>
    setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  /** Adds an image page and cleans it in the background. */
  const addImage = useCallback(async (src: Blob | HTMLCanvasElement, opts: { crop?: boolean; sourceText?: string; skipClean?: boolean } = {}) => {
    const id = uid();
    setPages((ps) => [
      ...ps,
      { id, cleaned: null, original: null, cleanedUrl: null, originalUrl: null, showOriginal: false, marked: null, markedUrl: null, status: "processing", sourceText: opts.sourceText },
    ]);
    try {
      const bmp = src instanceof Blob ? await loadBitmap(src) : src;
      const img = bitmapToImg(bmp);
      const original = imgToCanvas(img);
      const cleaned = opts.skipClean ? original : imgToCanvas((await cleanImg(img, opts.crop !== false)).img);
      update(id, {
        original,
        cleaned,
        originalUrl: original.toDataURL("image/jpeg", 0.7),
        cleanedUrl: cleaned.toDataURL("image/jpeg", 0.7),
        status: "ready",
      });
    } catch {
      update(id, { status: "error", label: "Couldn't open this image" });
    }
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      for (const f of files) {
        const name = f.name.toLowerCase();
        try {
          if (f.type === "application/pdf" || name.endsWith(".pdf")) {
            setSource("pdf");
            const { pdfToPages } = await import("@/lib/ingest/pdf");
            const pdfPages = await pdfToPages(f);
            for (const p of pdfPages) {
              // Digital PDFs are already clean; scans (no text layer) get the full cleanup.
              await addImage(p.canvas, { crop: false, sourceText: p.text, skipClean: p.text.length > 40 });
            }
          } else if (name.endsWith(".pptx")) {
            setSource("slides");
            const { pptxToSlides } = await import("@/lib/ingest/pptx");
            const slides = await pptxToSlides(await f.arrayBuffer());
            setPages((ps) => [
              ...ps,
              ...slides.map((text, i) => ({
                id: uid(),
                cleaned: null,
                original: null,
                cleanedUrl: null,
                originalUrl: null,
                showOriginal: false,
                marked: null,
                markedUrl: null,
                sourceText: text,
                status: "ready" as const,
                label: `Slide ${i + 1}`,
              })),
            ]);
          } else if (f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/.test(name)) {
            setSource((s) => (s === "camera" ? "upload" : s));
            await addImage(f);
          } else {
            toast(`${f.name}: unsupported file type`, "error");
          }
        } catch (e) {
          console.error(e);
          toast(`Couldn't read ${f.name}`, "error");
        }
      }
    },
    [addImage, toast],
  );

  // Arrivals from other screens: files dropped on the dashboard, pages from /ink, ?camera=1 from the phone home.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const files = handoff.takeFiles();
    // Deferred so it runs after mount instead of inside the effect body.
    if (files.length) setTimeout(() => void addFiles(files), 0);
  }, [addFiles]);

  const move = (id: string, dir: -1 | 1) =>
    setPages((ps) => {
      const i = ps.findIndex((p) => p.id === id);
      const j = i + dir;
      if (j < 0 || j >= ps.length) return ps;
      const copy = [...ps];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const submit = async () => {
    const ready = pages.filter((p) => p.status === "ready");
    if (!ready.length) return;
    setSaving("Saving pages…");
    try {
      const drafts: DraftPage[] = await Promise.all(
        ready.map(async (p) => {
          const canvas = p.marked ?? p.cleaned;
          return {
            id: p.id,
            blob: canvas ? await canvasToBlob(canvas) : null,
            previewUrl: null,
            sourceText: p.sourceText,
            hasFocusMarks: !!p.marked,
          };
        }),
      );
      const noteId = await createNoteFromPages(drafts, { ...meta, title, source }, (d, t) =>
        setSaving(`Uploading ${d} of ${t}…`),
      );
      // Start fresh next time this screen is opened (Next keeps it mounted).
      setPages([]);
      setTitle("");
      setSaving(null);
      router.push(`/notes/${noteId}`);
    } catch (e) {
      toast((e as Error).message, "error");
      setSaving(null);
    }
  };

  const markingPage = pages.find((p) => p.id === marking);
  const processing = pages.some((p) => p.status === "processing");

  return (
    <div className="flex flex-col gap-6">
      {camera && (
        <CameraView
          count={pages.length}
          onShot={(b) => {
            setSource("camera");
            void addImage(b);
          }}
          onDone={() => setCamera(false)}
          onUnavailable={() => {
            setCamera(false);
            systemCamera.current?.click();
          }}
        />
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Add notes</h1>
          <p className="text-sm text-muted">We clean up each photo (crop, straighten, remove shadows) before reading it.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setCamera(true)}>
            <Camera className="size-5" /> Camera
          </Button>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            <FileUp className="size-5" /> Upload
          </Button>
          {device === "tablet" && (
            <Link href="/ink" className={buttonClass("secondary")}>
              <PenTool className="size-5" /> Write
            </Link>
          )}
        </div>
        <input ref={fileInput} type="file" multiple hidden accept={ACCEPT} data-testid="file-input" onChange={(e) => (addFiles([...(e.target.files ?? [])]), (e.target.value = ""))} />
        <input ref={systemCamera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (addFiles([...(e.target.files ?? [])]), (e.target.value = ""))} />
      </div>

      {pages.length === 0 ? (
        <button
          type="button"
          onClick={() => setCamera(true)}
          className="flex flex-col items-center gap-3 rounded-[2rem] border-2 border-dashed border-line bg-elev p-12 text-center transition hover:border-primary"
        >
          <Camera className="size-12 text-primary" />
          <span className="text-lg font-semibold">Snap your first page</span>
          <span className="text-sm text-muted">Or upload photos, a PDF, or PowerPoint slides.</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="page-grid">
          <AnimatePresence>
            {pages.map((p, i) => (
              <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                <Card className="overflow-hidden">
                  <div className="relative aspect-[3/4] bg-bg">
                    {p.status === "processing" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted">
                        <Loader2 className="size-6 animate-spin text-primary" /> Cleaning up…
                      </div>
                    )}
                    {p.status === "error" && <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-sm text-danger">{p.label}</div>}
                    {p.status === "ready" && (p.cleanedUrl || p.markedUrl) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.showOriginal ? p.originalUrl! : (p.markedUrl ?? p.cleanedUrl!)}
                        alt={`Page ${i + 1}`}
                        className="size-full object-contain"
                      />
                    )}
                    {p.status === "ready" && !p.cleanedUrl && (
                      <div className="absolute inset-0 overflow-hidden p-3 text-left text-xs leading-snug text-muted">
                        <p className="mb-1 font-semibold text-fg">{p.label}</p>
                        {p.sourceText?.slice(0, 400)}
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">{i + 1}</span>
                    {p.markedUrl && (
                      <span className="absolute right-2 top-2 rounded-full bg-[#ff00d4] px-2 py-0.5 text-xs font-bold text-white">Focus</span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 p-1.5">
                    <IconBtn label="Move left" onClick={() => move(p.id, -1)} disabled={i === 0}>
                      <ArrowLeft className="size-4" />
                    </IconBtn>
                    <IconBtn label="Move right" onClick={() => move(p.id, 1)} disabled={i === pages.length - 1}>
                      <ArrowRight className="size-4" />
                    </IconBtn>
                    {p.cleaned && (
                      <>
                        <IconBtn label={p.showOriginal ? "Show cleaned" : "Show original"} onClick={() => update(p.id, { showOriginal: !p.showOriginal })} active={!p.showOriginal}>
                          <Wand2 className="size-4" />
                        </IconBtn>
                        <IconBtn label="Mark what to focus on" onClick={() => setMarking(p.id)}>
                          <Highlighter className="size-4" style={{ color: "#ff00d4" }} />
                        </IconBtn>
                      </>
                    )}
                    <IconBtn label="Remove page" onClick={() => setPages((ps) => ps.filter((x) => x.id !== p.id))} className="ml-auto hover:bg-danger-soft">
                      <Trash2 className="size-4" />
                    </IconBtn>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {pages.length > 0 && (
        <Card className="flex flex-col gap-4 p-5">
          <ClassTopicPicker classId={meta.classId} topicId={meta.topicId} onChange={setMeta} />
          <label className="flex flex-col gap-1 text-sm font-medium">
            Title (optional)
            <input
              className="h-11 rounded-xl border border-line bg-bg px-3 text-[15px]"
              placeholder="We'll name it from your notes"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <Button size="lg" onClick={submit} loading={!!saving} disabled={processing || !pages.some((p) => p.status === "ready")}>
            <Sparkles className="size-5" />
            {saving ?? `Read ${pages.length} page${pages.length === 1 ? "" : "s"}`}
          </Button>
        </Card>
      )}

      {markingPage?.cleaned && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg/95 p-3 backdrop-blur md:p-8">
          <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Mark what to focus on</h2>
              <Button variant="ghost" onClick={() => setMarking(null)}>
                Cancel
              </Button>
            </div>
            <MarkupEditor
              page={markingPage}
              onSave={(canvas, has) => {
                update(markingPage.id, has ? { marked: canvas, markedUrl: canvas.toDataURL("image/jpeg", 0.7) } : { marked: null, markedUrl: null });
                setMarking(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MarkupEditor({ page, onSave }: { page: CapturedPage; onSave: (c: HTMLCanvasElement, hasMarks: boolean) => void }) {
  const ink = useRef<InkCanvasHandle>(null);
  const bg = page.cleaned!;
  return (
    <>
      <InkCanvas ref={ink} width={bg.width} height={bg.height} background={bg} tools={["focus", "eraser"]} initialTool="focus" />
      <Button size="lg" onClick={() => onSave(ink.current!.exportCanvas(), ink.current!.hasFocusMarks())}>
        Save marks
      </Button>
    </>
  );
}

function IconBtn({
  label,
  children,
  onClick,
  disabled,
  active,
  className,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={clsx("flex size-8 items-center justify-center rounded-lg transition hover:bg-primary-soft disabled:opacity-30", active && "text-primary", className)}
    >
      {children}
    </button>
  );
}
