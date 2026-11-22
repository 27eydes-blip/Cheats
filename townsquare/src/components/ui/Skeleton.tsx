/** Loading placeholders shaped like the real layouts, so nothing jumps when data arrives. */
export function PostSkeleton({ media }: { media?: boolean }) {
  return (
    <div className="tl-row flex gap-3 px-4 py-2.5" aria-hidden="true">
      <div className="skeleton h-10 w-10 shrink-0 !rounded-full" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="flex gap-2"><div className="skeleton h-3 w-28" /><div className="skeleton h-3 w-16" /></div>
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-4/5" />
        {media && <div className="skeleton mt-1 h-28 w-full max-w-[520px] !rounded-[12px]" />}
        <div className="flex max-w-[440px] justify-between pt-1">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-3.5 w-7" />)}</div>
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading dispatches">
      {Array.from({ length: count }, (_, i) => <PostSkeleton key={i} media={i === 1} />)}
    </div>
  );
}

export function NewsSkeleton() {
  return (
    <div className="space-y-4 px-4 py-4 sm:px-6" role="status" aria-label="Loading news">
      <div className="skeleton aspect-[16/9] w-full !rounded-[var(--r-xl)]" />
      <div className="skeleton h-7 w-4/5" />
      <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-36 !rounded-[var(--r-lg)]" />)}</div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <div className="px-4 pt-5 pb-3 sm:px-6"><div className="skeleton h-8 w-40" /></div>
      <FeedSkeleton count={3} />
    </div>
  );
}

/** Bento-shaped placeholder for the Front Page. */
export function BentoSkeleton() {
  return (
    <div role="status" aria-label="Loading the front page" className="grid grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-12 lg:px-8">
      <div className="space-y-3 lg:col-span-8"><div className="skeleton aspect-[16/9] w-full" /><div className="skeleton h-10 w-4/5" /><div className="skeleton h-4 w-3/5" /></div>
      <div className="space-y-3 lg:col-span-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-20 w-full" />)}</div>
      {[0, 1, 2].map((i) => <div key={i} className="space-y-2 lg:col-span-4"><div className="skeleton aspect-[4/3] w-full" /><div className="skeleton h-6 w-full" /></div>)}
    </div>
  );
}

/** Story page placeholder: headline, meter, two take columns. */
export function StorySkeleton() {
  return (
    <div role="status" aria-label="Loading story" className="mx-auto max-w-[1320px] space-y-5 px-4 py-6 lg:px-8">
      <div className="skeleton h-3 w-28" />
      <div className="skeleton h-12 w-4/5" />
      <div className="skeleton h-5 w-3/5" />
      <div className="skeleton h-16 w-full" />
      <div className="grid gap-6 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="space-y-3">{[0, 1, 2].map((j) => <div key={j} className="skeleton h-28 w-full" />)}</div>)}</div>
    </div>
  );
}

/** Markets board placeholder (always dark, like the board itself). */
export function MarketsSkeleton() {
  const b = "animate-pulse rounded-[var(--r-lg)] bg-white/[0.06]";
  return (
    <div role="status" aria-label="Loading markets" className="dark terminal-grid min-h-screen">
      <div className="h-10 border-y border-[#22d3ee]/40 bg-black/60" />
      <div className="mx-auto max-w-[1440px] space-y-6 px-4 pt-6 sm:px-6">
        <div className={`${b} h-14 w-80`} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className={`${b} h-[230px]`} />)}</div>
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]"><div className={`${b} h-[440px]`} /><div className={`${b} h-[440px]`} /></div>
      </div>
    </div>
  );
}

/** Sports hub and game pages while they load: score strip, hero card and game cards. */
export function SportsSkeleton({ game = false }: { game?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading scores" className="mx-auto max-w-[1080px]">
      <div className="flex gap-2 overflow-hidden border-b border-[var(--hairline)] px-4 py-2.5">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-[74px] w-[188px] shrink-0 rounded-[12px]" />)}
      </div>
      <div className="max-w-[680px] space-y-3 px-4 pt-4">
        {game ? <div className="skeleton h-[180px] rounded-[16px]" /> : (
          <>
            <div className="skeleton h-9 w-40 rounded-[8px]" />
            <div className="flex gap-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-10 w-20 rounded-full" />)}</div>
            <div className="skeleton h-[230px] rounded-[20px]" />
          </>
        )}
        <div className="grid gap-2 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[96px] rounded-[14px]" />)}</div>
      </div>
    </div>
  );
}
