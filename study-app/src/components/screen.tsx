import { Suspense, type ReactNode } from "react";
import { AppShell, RequireAuth } from "./app-shell";

function Fallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <span className="inline-block size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" role="status" aria-label="Loading" />
    </div>
  );
}

/** Signed-in screen inside the app shell. Streams in after the static shell. */
export function Screen({ children, wide, auth = true }: { children: ReactNode; wide?: boolean; auth?: boolean }) {
  return (
    <Suspense fallback={<Fallback />}>
      <AppShell wide={wide}>{auth ? <RequireAuth>{children}</RequireAuth> : children}</AppShell>
    </Suspense>
  );
}
