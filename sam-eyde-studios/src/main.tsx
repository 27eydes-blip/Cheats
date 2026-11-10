import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// Debug handle (also used by the end-to-end tests).
import { engine } from "./audio/engine";
import { renderMix } from "./export/render";
import { getState } from "./state/store";
(window as unknown as Record<string, unknown>).__ses = { engine, getState, renderMix };
