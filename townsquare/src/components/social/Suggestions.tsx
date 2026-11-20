import Link from "next/link";
import type { Suggestion } from "@/lib/social";
import { FollowButton } from "../FollowButton";
import { Avatar } from "../ui/Avatar";
import { VerifiedSeal } from "../ui/Badge";

/** "People you may know": mutual connections and shared interests, each with its reason. */
export function Suggestions({ people, title = "People you may know", compact }: { people: Suggestion[]; title?: string; compact?: boolean }) {
  if (!people.length) return null;
  return (
    <section aria-label={title} className={compact ? "" : "card p-4 sm:p-5"}>
      {compact ? (
        <h2 className="mb-1 text-[15px] font-bold">{title}</h2>
      ) : (
        <h2 className="mb-3 flex items-center gap-2 font-display text-[19px] leading-none font-extrabold tracking-[0.04em] uppercase">
          <span aria-hidden="true" className="h-4 w-1 rounded-full bg-[var(--wn-blue)]" /> {title}
        </h2>
      )}
      <ul className={compact ? "" : "divide-y divide-rule"}>
        {people.map((u) => (
          <li key={u.id} className={`flex items-center gap-3 ${compact ? "py-1.5" : "py-3"}`}>
            <Link href={`/u/${u.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar url={u.avatarUrl} name={u.displayName} handle={u.handle} size={compact ? 40 : 42} />
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-[14.5px] font-bold">{u.displayName}{u.verified && <VerifiedSeal size={14} />}</span>
                <span className="block truncate text-[12.5px] text-ink-3">{u.reason}</span>
              </span>
            </Link>
            <FollowButton userId={u.id} following={false} small />
          </li>
        ))}
      </ul>
    </section>
  );
}
