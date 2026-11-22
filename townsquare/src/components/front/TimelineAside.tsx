import { liveEvents, listStories } from "@/lib/news";
import { suggestFriends } from "@/lib/social";
import { voices } from "@/lib/takes";
import { Suggestions } from "../social/Suggestions";
import { BriefingPromo, LiveNowTile, VoicesTile } from "./Tiles";
import { TrendingList } from "./StoryCard";

/** The quiet sidebar shared by the home and topic pages (desktop only). */
export function TimelineAside({ viewerId, section }: { viewerId: string | null; section?: string }) {
  const hot = listStories(5, { order: "hot", viewerId, section });
  const events = liveEvents();
  const stories = listStories(10, { viewerId });
  const suggestions = viewerId ? suggestFriends(viewerId, 4) : [];
  const people = suggestions.length ? [] : voices(viewerId, 3, section);
  const words = stories.reduce((n, s) => n + s.title.split(" ").length + s.summary.split(" ").length, 0) + 600;
  return (
    <aside className="hidden min-w-0 lg:block">
      <div className="quiet sticky top-[calc(var(--sub-top)+16px)] space-y-4 pt-4">
        {hot.length > 0 && <TrendingList stories={hot} />}
        {events.some((e) => e.isLive) && <LiveNowTile events={events} />}
        {stories.length > 0 && <BriefingPromo minutes={Math.max(4, Math.round(words / 230))} count={Math.min(10, stories.length)} />}
        {suggestions.length ? <Suggestions people={suggestions} /> : <VoicesTile voices={people} />}
      </div>
    </aside>
  );
}

