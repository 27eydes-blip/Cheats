import type { Banner } from "@/lib/moderation";

/** The TV-style news bar across the top of every page, set from the admin page. */
export function BreakingBanner({ banner }: { banner: Banner | null }) {
  if (!banner) return null;
  const label = banner.level === "breaking" ? "BREAKING" : banner.level === "alert" ? "ALERT" : "UPDATE";
  const color = banner.level === "info" ? "bg-accent" : "bg-breaking";
  const inner = (
    <>
      <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[11px] font-black tracking-wider text-breaking">{label}</span>
      <span className="truncate font-semibold">{banner.text}</span>
    </>
  );
  return (
    <div role="region" aria-label="Breaking news" className={`${color} text-white`}>
      {banner.url ? (
        <a href={banner.url} target="_blank" rel="noopener noreferrer" className="mx-auto flex min-h-10 max-w-6xl items-center gap-3 px-4 hover:underline">
          {inner}
        </a>
      ) : (
        <div className="mx-auto flex min-h-10 max-w-6xl items-center gap-3 px-4">{inner}</div>
      )}
    </div>
  );
}
