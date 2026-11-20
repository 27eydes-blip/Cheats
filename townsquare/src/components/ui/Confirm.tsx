"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

type Opts = { title: string; body?: React.ReactNode; confirm?: string; danger?: boolean };
const Ctx = createContext<(o: Opts) => Promise<boolean>>(async () => false);

/** `const confirm = useConfirm(); if (await confirm({ title })) …` — a designed replacement for window.confirm. */
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<Opts | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => {});
  const ask = useCallback((o: Opts) => {
    setOpts(o);
    return new Promise<boolean>((res) => (resolver.current = res));
  }, []);
  const done = (v: boolean) => {
    resolver.current(v);
    setOpts(null);
  };
  return (
    <Ctx.Provider value={ask}>
      {children}
      <Sheet open={!!opts} onClose={() => done(false)} title={opts?.title ?? ""} hideTitle>
        {opts && (
          <div className="px-5 pt-2 pb-5 sm:px-6 sm:pb-6">
            <h2 className="font-display text-h2 font-semibold">{opts.title}</h2>
            {opts.body && <div className="mt-2 text-[15px] text-ink-2">{opts.body}</div>}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => done(false)}>Cancel</Button>
              <Button variant={opts.danger ? "danger" : "primary"} onClick={() => done(true)} autoFocus>
                {opts.confirm ?? "Confirm"}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </Ctx.Provider>
  );
}
