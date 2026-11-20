/** Page frames: `narrow` for reading/list pages, `wide` for editorial layouts. */
export function Frame({ children, width = "narrow", className = "" }: { children: React.ReactNode; width?: "narrow" | "wide" | "medium"; className?: string }) {
  const w = width === "wide" ? "max-w-[1320px]" : width === "medium" ? "max-w-[1040px]" : "max-w-[760px]";
  return <div className={`mx-auto w-full ${w} ${className}`}>{children}</div>;
}

/** Editorial page heading: folio, big serif title, dek, double rule. */
export function PageTitle({ folio, title, dek, children }: { folio?: React.ReactNode; title: string; dek?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="px-4 pt-6 sm:px-6 lg:pt-10">
      {folio && <div className="mb-2">{folio}</div>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-display font-semibold">{title}</h1>
        {children}
      </div>
      {dek && <p className="mt-2 max-w-[640px] text-[15.5px] text-ink-2">{dek}</p>}
      <div aria-hidden="true" className="double-rule mt-4" />
    </header>
  );
}
