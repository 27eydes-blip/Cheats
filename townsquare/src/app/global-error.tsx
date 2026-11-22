"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/ui/ErrorBoundary";

/** Last-resort screen if the root layout itself fails; reports the error and offers a reload instead of a blank "Application error". */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError("root", error, error.digest), [error]);
  return (
    <html lang="en">
      <body style={{ background: "#070b14", color: "#e8edf7", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <main style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
          <p style={{ color: "#a3adc4" }}>The page hit an error. Reloading usually fixes it.</p>
          <button onClick={() => (reset(), location.reload())} style={{ marginTop: 12, minHeight: 44, padding: "0 20px", borderRadius: 10, border: 0, background: "#2c68fa", color: "#fff", fontWeight: 700 }}>Reload</button>
        </main>
      </body>
    </html>
  );
}
