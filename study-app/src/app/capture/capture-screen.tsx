"use client";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClassTopicPicker } from "@/components/class-topic-picker";
import { InkCanvas, type InkCanvasHandle } from "@/components/ink-canvas";
import { IconAlert, IconArrowLeft, IconArrowRight, IconCamera, IconHighlighter, IconPencil, IconPlus, IconSparkle, IconTarget, IconTrash, IconUpload, IconWand } from "@/components/icons";
import { PageHeader } from "@/components/screen";
import { Button, buttonClass, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Illustration } from "@/components/ui/illustrations";
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
    <div className="flex flex-col gap-8">
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

      <PageHeader
        eyebrow="New notes"
        title="Add your notes"
        subtitle="Each photo is cropped, straightened and cleaned up before we read it."
        actions={
          <>
            <Button variant="secondary" onClick={() => setCamera(true)}>
              <IconCamera size={18} /> Camera
            </Button>
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              <IconUpload size={18} /> Upload
            </Button>
            {device === "tablet" && (
              <Link href="/ink" className={buttonClass("secondary")}>
                <IconPencil size={18} /> Write
              </Link>
            )}
          </>
        }
      />
      <input ref={fileInput} type="file" multiple hidden accept={ACCEPT} data-testid="file-input" onChange={(e) => (addFiles([...(e.target.files ?? [])]), (e.target.value = ""))} />
      <input ref={systemCamera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (addFiles([...(e.target.files ?? [])]), (e.target.value = ""))} />

      {pages.length === 0 ? (
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => setCamera(true)}
          className="group relative flex flex-col items-center gap-5 overflow-hidden rounded-[32px] border-2 border-dashed border-line-strong bg-elev/50 px-6 py-14 text-center transition hover:border-accent"
        >
          <div className="bg-hero pointer-events-none absolute inset-0 opacity-70" />
          <Illustration kind="camera" className="relative w-44" />
          <span className="relative">
            <span className="block text-xl font-semibold tracking-[-0.02em]">Snap your first page</span>
            <span className="mt-1 block text-[15px] text-muted">Or upload photos, a PDF, or PowerPoint slides.</span>
          </span>
          <span className={buttonClass("primary", "lg", "relative")}>
            <IconCamera size={20} /> Open camera
          </span>
        </motion.button>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" data-testid="page-grid">
          <AnimatePresence>
            {pages.map((p, i) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.85, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
              >
                <div className="card-sheen overflow-hidden rounded-[24px] border border-line bg-elev shadow-soft">
                  <div className="relative aspect-[3/4] bg-elev-2">
                    {p.status === "processing" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted">
                        <span className="relative flex size-12 items-center justify-center">
                          <span className="animate-pulse-ring absolute inset-0 rounded-full bg-accent" />
                          <IconWand size={22} className="relative text-accent-ink" />
                        </span>
                        Cleaning up…
                      </div>
                    )}
                    {p.status === "error" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center text-sm text-danger">
                        <IconAlert size={22} /> {p.label}
                      </div>
                    )}
                    {p.status === "ready" && (p.cleanedUrl || p.markedUrl) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.showOriginal ? p.originalUrl! : (p.markedUrl ?? p.cleanedUrl!)} alt={`Page ${i + 1}`} className="size-full object-contain" />
                    )}
                    {p.status === "ready" && !p.cleanedUrl && (
                      <div className="absolute inset-0 overflow-hidden p-4 text-left text-xs leading-relaxed text-muted">
                        <p className="mb-2 text-sm font-semibold text-fg">{p.label}</p>
                        {p.sourceText?.slice(0, 400)}
                      </div>
                    )}
                    <span className="absolute left-2.5 top-2.5 flex size-7 items-center justify-center rounded-full bg-black/70 text-xs font-bold text-white backdrop-blur">{i + 1}</span>
                    {p.showOriginal && <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">Original</span>}
                    {p.markedUrl && (
                      <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-[#ff00d4] px-2 py-1 text-[11px] font-bold text-white">
                        <IconTarget size={12} /> Focus
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 p-1.5">
                    <IconButton label="Move left" onClick={() => move(p.id, -1)} disabled={i === 0} className="size-9 max-sm:!hidden">
                      <IconArrowLeft size={17} />
                    </IconButton>
                    <IconButton label="Move right" onClick={() => move(p.id, 1)} disabled={i === pages.length - 1} className="size-9 max-sm:!hidden">
                      <IconArrowRight size={17} />
                    </IconButton>
                    {p.cleaned && (
                      <>
                        <IconButton
                          label={p.showOriginal ? "Show cleaned" : "Show original"}
                          onClick={() => update(p.id, { showOriginal: !p.showOriginal })}
                          className={clsx("size-9", !p.showOriginal && "text-accent-ink")}
                        >
                          <IconWand size={17} />
                        </IconButton>
                        <IconButton label="Mark what to focus on" onClick={() => setMarking(p.id)} className="size-9" style={{ color: "#ff00d4" }}>
                          <IconHighlighter size={17} />
                        </IconButton>
                      </>
                    )}
                    <IconButton label="Remove page" onClick={() => setPages((ps) => ps.filter((x) => x.id !== p.id))} className="ml-auto size-9 hover:!bg-danger-soft hover:!text-danger">
                      <IconTrash size={17} />
                    </IconButton>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <motion.button
            layout
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => setCamera(true)}
            className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed border-line-strong text-sm font-semibold text-muted transition hover:border-accent hover:text-fg"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-elev-2">
              <IconPlus size={22} />
            </span>
            Add page
          </motion.button>
        </div>
      )}

      {pages.length > 0 && (
        <Card className="flex flex-col gap-5 p-6">
          <ClassTopicPicker classId={meta.classId} topicId={meta.topicId} onChange={setMeta} />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Title <span className="sr-only">(optional)</span>
            <input className={field} placeholder="Optional. We'll name it from your notes" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <Button size="lg" onClick={submit} loading={!!saving} disabled={processing || !pages.some((p) => p.status === "ready")}>
            {!saving && <IconSparkle size={20} />}
            {saving ?? `Read ${pages.length} page${pages.length === 1 ? "" : "s"}`}
          </Button>
        </Card>
      )}

      <AnimatePresence>
        {markingPage?.cleaned && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-bg/90 p-3 backdrop-blur-xl md:p-8"
          >
            <motion.div
              initial={{ y: 30, scale: 0.97 }}
              animate={{ y: 0, scale: 1 }}
              className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">Mark what to focus on</h2>
                  <p className="text-sm text-muted">Circle or highlight anything you want quizzed harder.</p>
                </div>
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const field = "h-12 w-full rounded-2xl border border-line bg-bg px-4 text-[15px] outline-none transition placeholder:text-faint focus:border-accent";

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
