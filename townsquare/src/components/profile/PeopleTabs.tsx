import { Tabs } from "../PageHeader";

/** Followers / Following / Friends switcher for the people lists. */
export function PeopleTabs({ handle, active }: { handle: string; active: "followers" | "following" | "friends" }) {
  return (
    <Tabs
      active={active}
      tabs={[
        { key: "followers", label: "Followers", href: `/u/${handle}/followers` },
        { key: "following", label: "Following", href: `/u/${handle}/following` },
        { key: "friends", label: "Friends", href: `/u/${handle}/friends` },
      ]}
    />
  );
}
