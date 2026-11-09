"use client";
import clsx from "clsx";
import { motion, type HTMLMotionProps } from "framer-motion";
import { IconSpinner } from "@/components/icons";

import { buttonClass, type Size, type Variant } from "./button-class";

export { buttonClass };

/** Button with a springy press. Respects reduced motion via MotionConfig. */
export function Button({
  variant,
  size,
  loading,
  className,
  children,
  disabled,
  ...rest
}: HTMLMotionProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 600, damping: 22 }}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <IconSpinner size={18} />}
      {children as React.ReactNode}
    </motion.button>
  );
}

/** Round icon-only button. */
export function IconButton({
  label,
  className,
  children,
  active,
  ...rest
}: HTMLMotionProps<"button"> & { label: string; active?: boolean }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.88 }}
      transition={{ type: "spring", stiffness: 600, damping: 20 }}
      className={clsx(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-35",
        active ? "bg-accent text-accent-fg" : "text-fg-2 hover:bg-elev-2 hover:text-fg",
        className,
      )}
      {...rest}
    >
      {children as React.ReactNode}
    </motion.button>
  );
}
