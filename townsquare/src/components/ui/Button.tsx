import Link from "next/link";
import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ink";
type Size = "sm" | "md" | "lg";

const V: Record<Variant, string> = { primary: "btn-primary", secondary: "btn-outline", ghost: "btn-ghost", danger: "btn-danger", ink: "btn-ink" };
const S: Record<Size, string> = { sm: "!min-h-9 !px-3.5 !text-[13.5px]", md: "", lg: "!min-h-12 !px-6 !text-base" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${V[variant]} ${S[size]} ${extra}`;
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = "primary", size = "md", className = "", type = "button", ...rest }, ref) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest} />;
});

export function LinkButton({ href, variant = "primary", size = "md", className = "", children, ...rest }: { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

/** Round icon-only button. `label` is required for screen readers. */
export const IconButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: number; tone?: "default" | "accent" }>(
  function IconButton({ label, size = 40, tone = "default", className = "", type = "button", children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={`inline-flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-90 ${tone === "accent" ? "text-accent hover:bg-accent-soft" : "text-ink-2 hover:bg-surface-2 hover:text-ink-1"} ${className}`}
        style={{ width: size, height: size }}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
