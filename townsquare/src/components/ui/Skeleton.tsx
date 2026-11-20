/** Loading placeholders shaped like the real layouts, so nothing jumps when data arrives. */
export function PostSkeleton({ media }: { media?: boolean }) {
  return (
    <div className="flex gap-3 px-4 py-4 sm:px-5" aria-hidden="true">
      <div className="skeleton h-11 w-11 shrink-0" />
      <div className="flex-1 space-y-2.5 pt-1">
        <div className="flex gap-2"><div className="skeleton h-3.5 w-28" /><div className="skeleton h-3.5 w-16" /></div>
        <div className="skeleton h-3.5 w-full" />
        <div className="skeleton h-3.5 w-4/5" />
        {media && <div className="skeleton mt-2 aspect-[16/9] w-full !rounded-[var(--r-lg)]" />}
        <div className="flex justify-between pt-1.5 pr-10">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-4 w-8" />)}</div>
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading posts">
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
