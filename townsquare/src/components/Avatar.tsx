/** Round avatar; falls back to initials on a color picked from the handle. */
export function Avatar({ url, name, handle, size = 44 }: { url: string | null; name: string; handle: string; size?: number }) {
  const hue = [...handle].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full bg-surface object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: `hsl(${hue} 55% 42%)`, fontSize: size * 0.38 }}
    >
      {initials || "?"}
    </span>
  );
}
