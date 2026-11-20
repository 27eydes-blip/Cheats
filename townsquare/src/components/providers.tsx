"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { PostView } from "@/lib/posts";
import { Composer } from "./Composer";
import { Modal } from "./Modal";

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

// ---------- composer ----------
type ComposerOpts = { replyTo?: PostView; quote?: PostView };
const ComposerCtx = createContext<(o?: ComposerOpts) => void>(() => {});
export const useComposer = () => useContext(ComposerCtx);

/** Broadcast a freshly created post so feeds on screen can show it immediately. */
export const POSTED_EVENT = "ts:posted";

export function Providers({ viewer, children }: { viewer: ClientViewer; children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const toast = useCallback((text: string, tone: Toast["tone"] = "ok", href?: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, text, tone, href }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
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

  // Keyboard shortcut: "n" opens a new post (when not typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        openComposer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openComposer]);

  const title = composer?.replyTo ? "Reply" : composer?.quote ? "Quote post" : "New post";

  return (
    <ViewerCtx.Provider value={viewer}>
      <ToastCtx.Provider value={toast}>
        <ComposerCtx.Provider value={openComposer}>
          {children}
          <Modal open={!!composer} onClose={() => setComposer(null)} title={title}>
            {composer && (
              <Composer
                autoFocus
                replyTo={composer.replyTo}
                quote={composer.quote}
                onPosted={() => setComposer(null)}
              />
            )}
          </Modal>
          <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
            {toasts.map((t) => (
              <div
                key={t.id}
                role="status"
                className={`pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg ${t.tone === "error" ? "bg-danger text-white" : "bg-fg text-bg"}`}
              >
                <span>{t.text}</span>
                {t.href && (
                  <a href={t.href} className="underline">
                    View
                  </a>
                )}
              </div>
            ))}
          </div>
        </ComposerCtx.Provider>
      </ToastCtx.Provider>
    </ViewerCtx.Provider>
  );
}
