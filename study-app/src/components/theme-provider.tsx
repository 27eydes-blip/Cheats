"use client";
import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";

type Theme = "light" | "dark";
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "dark", toggle: () => {} });

function read(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, read, () => "dark" as Theme);
  const toggle = useCallback(() => {
    const next = read() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }, []);
  return <Ctx value={{ theme, toggle }}>{children}</Ctx>;
}

export const useTheme = () => useContext(Ctx);
