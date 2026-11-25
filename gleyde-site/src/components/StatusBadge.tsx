import type { Status } from "@/data/portfolio";

/**
 * A status as quiet small caps. Only "Live" gets colour and a dot, so the
 * eye goes straight to what can be used today.
 */
export function StatusBadge({ status }: { status: Status }) {
  const live = status === "Live";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 text-[0.62rem] tracking-[0.22em] whitespace-nowrap uppercase ${
        live ? "text-gold-light" : status === "Beta" ? "text-ivory/75" : "text-ivory/55"
      }`}
    >
      {live && <span aria-hidden="true" className="block size-[5px] rounded-full bg-gold-light" />}
      {status}
    </span>
  );
}
