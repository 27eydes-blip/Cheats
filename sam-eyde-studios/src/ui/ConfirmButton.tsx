import { type ReactNode, useEffect, useState } from "react";

/** A destructive button that must be tapped twice: the first tap arms it. */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Sure?",
  className = "",
  label,
}: {
  onConfirm: () => void;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
  label: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`${className} ${armed ? "armed" : ""}`}
      aria-label={armed ? `Confirm ${label}` : label}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
