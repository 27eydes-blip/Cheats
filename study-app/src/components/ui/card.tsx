import clsx from "clsx";
import type { HTMLAttributes } from "react";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("rounded-3xl border border-line bg-elev shadow-card", className)} {...rest} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx("inline-block size-5 animate-spin rounded-full border-2 border-primary border-t-transparent", className)}
      role="status"
      aria-label="Loading"
    />
  );
}

export function EmptyState({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line p-10 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {children}
    </div>
  );
}
