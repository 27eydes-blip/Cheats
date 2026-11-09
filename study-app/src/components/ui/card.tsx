import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";
import { Illustration, type IllustrationKind } from "./illustrations";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("card-sheen rounded-[28px] border border-line bg-elev shadow-soft", className)} {...rest} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx("inline-block size-6 animate-spin rounded-full border-[2.5px] border-accent border-t-transparent", className)}
      role="status"
      aria-label="Loading"
    />
  );
}

/** Small uppercase label above sections. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx("text-[11px] font-semibold uppercase tracking-[0.14em] text-muted", className)}>{children}</p>;
}

export function Pill({ children, className, tone = "neutral" }: { children: ReactNode; className?: string; tone?: "neutral" | "accent" | "warn" | "danger" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        {
          neutral: "bg-elev-2 text-fg-2",
          accent: "bg-accent-soft text-accent-ink",
          warn: "bg-warn-soft text-warn",
          danger: "bg-danger-soft text-danger",
        }[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Inviting empty state with an illustration. */
export function EmptyState({
  title,
  body,
  children,
  art = "notes",
  className,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
  art?: IllustrationKind;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col items-center gap-4 rounded-[28px] border border-dashed border-line-strong px-6 py-12 text-center", className)}>
      <Illustration kind={art} className="w-40" />
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="text-xl font-semibold tracking-tight">{title}</p>
        {body && <p className="text-[15px] leading-relaxed text-muted">{body}</p>}
      </div>
      {children}
    </div>
  );
}

export function SkeletonLines({ lines = 5 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-3.5 rounded-full" style={{ width: `${[92, 76, 84, 63, 80, 70][i % 6]}%` }} />
      ))}
    </div>
  );
}
