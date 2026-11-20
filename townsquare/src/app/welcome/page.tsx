import { redirect } from "next/navigation";
import { requireViewerPage } from "@/lib/session";
import { whoToFollow } from "@/lib/social";
import { INTERESTS } from "@/lib/users";
import { Onboarding } from "./Onboarding";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome" };

export default async function Welcome({ searchParams }: { searchParams: Promise<{ again?: string }> }) {
  const viewer = await requireViewerPage("/welcome");
  if (viewer.onboarded && !(await searchParams).again) redirect("/");
  return (
    <Onboarding
      name={viewer.display_name.split(" ")[0]}
      interests={[...INTERESTS]}
      initialInterests={JSON.parse(viewer.interests || "[]")}
      initialTown={viewer.town ?? ""}
      people={whoToFollow(viewer.id, 6)}
    />
  );
}
