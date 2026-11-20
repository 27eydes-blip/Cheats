import Link from "next/link";
import type { UserListItem } from "@/lib/social";
import { Avatar } from "./Avatar";
import { FollowButton } from "./FollowButton";
import { VerifiedBadge } from "./icons";

export function UserList({ users, empty = "No one here yet." }: { users: UserListItem[]; empty?: string }) {
  if (!users.length) return <p className="px-6 py-12 text-center text-muted">{empty}</p>;
  return (
    <ul>
      {users.map((u) => (
        <li key={u.id} className="flex items-start gap-3 border-b border-line px-4 py-3 hover:bg-surface/60">
          <Link href={`/u/${u.handle}`} className="flex min-w-0 flex-1 gap-3">
            <Avatar url={u.avatarUrl} name={u.displayName} handle={u.handle} size={44} />
            <span className="min-w-0">
              <span className="flex items-center gap-1 font-bold">
                <span className="truncate">{u.displayName}</span>
                {u.verified && <VerifiedBadge />}
              </span>
              <span className="block truncate text-muted">@{u.handle}</span>
              {u.bio && <span className="mt-1 line-clamp-2 block text-[15px]">{u.bio}</span>}
            </span>
          </Link>
          <FollowButton userId={u.id} following={u.viewerFollows} small />
        </li>
      ))}
    </ul>
  );
}
