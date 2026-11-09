"use client";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { IconAlert, IconCheck, IconSparkle } from "@/components/icons";

type Toast = { id: number; text: string; tone: "info" | "error" | "success" };
const Ctx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <Ctx value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-8" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full border border-line-strong bg-elev py-2.5 pl-3 pr-5 text-sm font-medium shadow-lift"
            >
              <span
                className={clsx(
                  "flex size-6 shrink-0 items-center justify-center rounded-full",
                  t.tone === "error" ? "bg-danger-soft text-danger" : "bg-accent text-accent-fg",
                )}
              >
                {t.tone === "error" ? <IconAlert size={15} /> : t.tone === "success" ? <IconCheck size={15} /> : <IconSparkle size={15} />}
              </span>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx>
  );
}

export const useToast = () => useContext(Ctx);
