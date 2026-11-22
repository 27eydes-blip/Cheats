import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewerPage } from "@/lib/session";
import { getAds, listSponsors } from "@/lib/ads";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { Kicker } from "@/components/ui/Badge";
import { SponsorsAdmin } from "./SponsorsAdmin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sponsors" };

export default async function SponsorsPage() {
  const admin = await requireViewerPage("/admin/sponsors");
  if (admin.role !== "admin") notFound();
  const sponsors = listSponsors().map((s) => ({
    id: s.id, name: s.name, headline: s.headline, body: s.body, url: s.link_url, button: s.button_label, alt: s.image_alt, startsAt: s.starts_at, endsAt: s.ends_at,
    active: !!s.active, live: s.live, views: s.views, clicks: s.clicks, placeholder: !!s.placeholder && !s.image_key, card: s.card,
    bannerHeadline: s.banner_headline, bannerText: s.banner_text, focalX: s.focal_x, focalY: s.focal_y, hasMotion: !!s.motion_key,
    needsImage: !s.image_key,
  }));
  return (
    <Frame width="medium">
      <PageTitle folio={<Kicker tone="gold"><Link href="/admin" className="tap inline-flex min-h-6 items-center hover:underline">Control Room</Link></Kicker>} title="Sponsors" dek="Sponsored cards in For You: always labeled, never ranked, at fixed slots (4th item, then every 10th)." />
      <SponsorsAdmin sponsors={sponsors} enabled={getAds().enabled} />
    </Frame>
  );
}
