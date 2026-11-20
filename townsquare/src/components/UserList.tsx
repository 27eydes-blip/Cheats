import Link from "next/link";
import type { UserListItem } from "@/lib/social";
import { Avatar } from "./ui/Avatar";
import { VerifiedSeal } from "./ui/Badge";
import { EmptyState } from "./ui/States";
import { FollowButton } from "./FollowButton";

export function UserList({ users, empty = "No one here yet." }: { users: UserListItem[]; empty?: string }) {
  if (!users.length) return <EmptyState art="community" title={empty} />;
  return (
    <ul className="divide-y divide-line">
      {users.map((u) => (
        <li key={u.id} className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface/60 sm:px-5">
          <Link href={`/u/${u.handle}`} className="flex min-w-0 flex-1 gap-3">
            <Avatar url={u.avatarUrl} name={u.displayName} handle={u.handle} size={46} />
            <span className="min-w-0">
              <span className="flex items-center gap-1 font-semibold">
                <span className="truncate">{u.displayName}</span>
                {u.verified && <VerifiedSeal size={15} />}
              </span>
              <span className="block truncate text-[14px] text-ink-3">@{u.handle}</span>
              {u.bio && <span className="mt-1 line-clamp-2 block text-[14.5px] text-ink-2">{u.bio}</span>}
            </span>
          </Link>
          <FollowButton userId={u.id} following={u.viewerFollows} small />
        </li>
      ))}
    </ul>
  );
}
