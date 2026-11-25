import type { Status } from "@/data/portfolio";

/**
 * Colour treatment per status. "Live" is the only filled-gold badge, so
 * the eye goes to what can be used today.
 */
const statusStyles: Record<Status, string> = {
  Live: "border-gold/70 text-gold-light",
  Beta: "border-gold/45 text-gold",
  "In Development": "border-ivory/25 text-ivory/75",
  "Coming Soon": "border-ivory/20 text-ivory/65",
  Concept: "border-ivory/15 text-ivory/60",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-[0.62rem] font-medium tracking-[0.2em] whitespace-nowrap uppercase ${statusStyles[status]}`}
    >
      <span
        aria-hidden="true"
        className={`block size-1 rotate-45 ${status === "Live" ? "bg-gold-light shadow-[0_0_8px_#EFE3C4]" : "bg-current opacity-70"}`}
      />
      {status}
    </span>
  );
}
