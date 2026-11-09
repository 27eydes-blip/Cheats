import { Suspense, ViewTransition, type ReactNode } from "react";
import { AppShell, RequireAuth } from "./app-shell";

function Fallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <span className="inline-block size-6 animate-spin rounded-full border-[2.5px] border-accent border-t-transparent" role="status" aria-label="Loading" />
    </div>
  );
}

/** Signed-in screen inside the app shell, with a soft page transition. */
export function Screen({ children, wide, focus, auth = true }: { children: ReactNode; wide?: boolean; focus?: boolean; auth?: boolean }) {
  return (
    <Suspense fallback={<Fallback />}>
      <AppShell wide={wide} focus={focus}>
        <ViewTransition enter="page" exit="page" default="none">
          <div>{auth ? <RequireAuth>{children}</RequireAuth> : children}</div>
        </ViewTransition>
      </AppShell>
    </Suspense>
  );
}

/** Standard page heading. */
export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-ink">{eyebrow}</p>}
        <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] md:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted md:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
