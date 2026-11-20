/** Desk nameplate: a navy tile with the Desk's initial in the display serif and a gold rule. */
export function CommunityArt({ slug, className = "" }: { slug: string; className?: string }) {
  let h = 11;
  for (const c of slug) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return (
    <div aria-hidden="true" className={`relative h-full w-full overflow-hidden bg-navy ${className}`}>
      <svg viewBox="0 0 600 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        {Array.from({ length: 8 }, (_, i) => <line key={i} x1={i * 80 + (h % 40)} y1="0" x2={i * 80 + (h % 40) - 60} y2="200" stroke="rgb(255 255 255 / 0.06)" strokeWidth="1" />)}
        <rect x="0" y="196" width="600" height="4" fill="#c8a24a" />
      </svg>
    </div>
  );
}

export function CommunityIconTile({ slug, name, size = 48 }: { slug: string; name: string; size?: number }) {
  void slug;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center rounded-[4px] bg-navy font-display font-semibold text-gold shadow-[inset_0_0_0_2px_var(--gold)]" style={{ width: size, height: size, fontSize: size * 0.5 }}>
      {name.replace(/^The /, "")[0]}
    </span>
  );
}
