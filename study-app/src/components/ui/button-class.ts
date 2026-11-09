import clsx from "clsx";

/* Shared by client and server components (no "use client"). */
export type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type Size = "sm" | "md" | "lg" | "xl";

/** Shared button look; usable on <Link> via className. */
export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return clsx(
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold tracking-[-0.01em] transition-[background-color,box-shadow,color,opacity,transform] duration-200 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-45",
    {
      primary:
        "bg-accent text-accent-fg shadow-[0_1px_0_rgb(255_255_255/0.5)_inset,0_8px_24px_-8px_rgb(150_210_0/0.7)] hover:shadow-[0_1px_0_rgb(255_255_255/0.5)_inset,0_10px_32px_-6px_rgb(170_230_0/0.85)] hover:brightness-[1.04]",
      secondary: "border border-line bg-elev text-fg shadow-[var(--shadow-sm)] hover:border-line-strong hover:bg-elev-2",
      outline: "border border-line-strong text-fg hover:bg-elev-2",
      ghost: "text-fg-2 hover:bg-elev-2 hover:text-fg",
      danger: "bg-danger text-white hover:brightness-110",
    }[variant],
    {
      sm: "h-9 px-3.5 text-[13px]",
      md: "h-11 px-5 text-[15px]",
      lg: "h-[52px] px-6 text-base",
      xl: "h-16 px-9 text-lg",
    }[size],
    extra,
  );
}

