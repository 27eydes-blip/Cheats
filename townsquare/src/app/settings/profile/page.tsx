import { requireViewerPage } from "@/lib/session";
import { mediaUrl } from "@/lib/users";
import { PageHeader } from "@/components/PageHeader";
import { ProfileForm } from "../forms";

export const metadata = { title: "Edit profile" };

export default async function Page() {
  const u = await requireViewerPage("/settings/profile");
  return (
    <>
      <PageHeader title="Edit profile" back />
      <ProfileForm initial={{ displayName: u.display_name, bio: u.bio, links: JSON.parse(u.links), avatarUrl: mediaUrl(u.avatar_media_id), bannerUrl: mediaUrl(u.banner_media_id) }} />
    </>
  );
}
