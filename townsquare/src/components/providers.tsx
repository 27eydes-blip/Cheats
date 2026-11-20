"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { PostView } from "@/lib/posts";
import { Composer } from "./Composer";
import { CommandPalette } from "./shell/CommandPalette";
import { ConfirmProvider } from "./ui/Confirm";
import { Sheet } from "./ui/Sheet";

/** What client components know about the signed-in user. */
export type ClientViewer = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  suspended: boolean;
} | null;

const ViewerCtx = createContext<ClientViewer>(null);
export const useViewer = () => useContext(ViewerCtx);

// ---------- toasts ----------
type Toast = { id: number; text: string; tone: "ok" | "error"; href?: string };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"], href?: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

// ---------- composer / palette / shortcuts ----------
type ComposerOpts = { replyTo?: PostView; quote?: PostView; communityId?: string; communityName?: string; prefill?: string };
const ComposerCtx = createContext<(o?: ComposerOpts) => void>(() => {});
export const useComposer = () => useContext(ComposerCtx);
const PaletteCtx = createContext<() => void>(() => {});
export const usePalette = () => useContext(PaletteCtx);
const ShortcutsCtx = createContext<() => void>(() => {});
export const useShortcutsHelp = () => useContext(ShortcutsCtx);

/** Broadcast a freshly created post so feeds on screen can show it immediately. */
export const POSTED_EVENT = "ts:posted";

const SHORTCUTS: [string, string][] = [
  ["j / k", "Next / previous post"],
  ["l", "Like the selected post"],
  ["r", "Reply to the selected post"],
  ["Enter", "Open the selected post"],
  ["n", "New post"],
  ["⌘K / Ctrl K", "Search and jump anywhere"],
  ["?", "Show these shortcuts"],
];

const typing = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable);
};

export function Providers({ viewer, children }: { viewer: ClientViewer; children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const toast = useCallback((text: string, tone: Toast["tone"] = "ok", href?: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, text, tone, href }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const [composer, setComposer] = useState<ComposerOpts | null>(null);
  const openComposer = useCallback(
    (o: ComposerOpts = {}) => {
      if (!viewer) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      setComposer(o);
    },
    [viewer],
  );
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const selected = useRef(-1);

  // Home-screen shortcut "New post" opens /?compose=1.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("compose") === "1") openComposer();
  }, [openComposer]);

  // Global keyboard shortcuts (desktop): ⌘K, n, ?, and j/k/l/r/Enter on posts.
  useEffect(() => {
    const posts = () => [...document.querySelectorAll<HTMLElement>("main article[data-post-id]")];
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector("dialog[open]")) return;
      const list = posts();
      const cur = list.indexOf(document.activeElement as HTMLElement);
      if (cur >= 0) selected.current = cur;
      const focus = (i: number) => {
        const el = list[Math.max(0, Math.min(list.length - 1, i))];
        if (!el) return;
        selected.current = list.indexOf(el);
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      };
      const sel = list[selected.current];
      switch (e.key) {
        case "n": e.preventDefault(); openComposer(); break;
        case "?": e.preventDefault(); setShortcuts(true); break;
        case "j": e.preventDefault(); focus(selected.current + 1); break;
        case "k": e.preventDefault(); focus(selected.current - 1); break;
        case "l": sel?.querySelector<HTMLButtonElement>("[data-action=like]")?.click(); break;
        case "r": if (sel) (e.preventDefault(), sel.querySelector<HTMLButtonElement>("[data-action=reply]")?.click()); break;
        case "Enter": if (sel && document.activeElement === sel) sel.click(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openComposer]);

  const title = composer?.replyTo ? "Reply" : composer?.quote ? "Quote post" : composer?.communityName ? `Post to ${composer.communityName}` : "New post";

  return (
    <ViewerCtx.Provider value={viewer}>
      <ToastCtx.Provider value={toast}>
        <ConfirmProvider>
          <ComposerCtx.Provider value={openComposer}>
            <PaletteCtx.Provider value={() => setPalette(true)}>
              <ShortcutsCtx.Provider value={() => setShortcuts(true)}>
                {children}
                <Sheet open={!!composer} onClose={() => setComposer(null)} title={title}>
                  {composer && (
                    <Composer
                      autoFocus
                      replyTo={composer.replyTo}
                      quote={composer.quote}
                      communityId={composer.communityId}
                      prefill={composer.prefill}
                      onPosted={() => setComposer(null)}
                    />
                  )}
                </Sheet>
                <CommandPalette open={palette} onClose={() => setPalette(false)} onCompose={() => openComposer()} />
                <Sheet open={shortcuts} onClose={() => setShortcuts(false)} title="Keyboard shortcuts">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 px-6 pt-2 pb-6">
                    {SHORTCUTS.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt><kbd className="rounded-md bg-surface-2 px-2 py-1 font-mono text-[13px] ring-1 ring-line">{k}</kbd></dt>
                        <dd className="text-[15px] text-ink-2">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Sheet>
                <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+22px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 sm:right-6 sm:bottom-6 sm:left-auto sm:items-end">
                  {toasts.map((t) => (
                    <div
                      key={t.id}
                      role="status"
                      className={`pointer-events-auto flex animate-scale-in items-center gap-3 rounded-[14px] py-2.5 pr-3 pl-4 text-[14px] font-semibold shadow-3 ${
                        t.tone === "error" ? "bg-danger text-white" : "bg-ink-1 text-canvas"
                      }`}
                    >
                      <span>{t.text}</span>
                      {t.href && (
                        <a href={t.href} className="rounded-md bg-white/15 px-2 py-0.5 text-[13px]">
                          View
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </ShortcutsCtx.Provider>
            </PaletteCtx.Provider>
          </ComposerCtx.Provider>
        </ConfirmProvider>
      </ToastCtx.Provider>
    </ViewerCtx.Provider>
  );
}
