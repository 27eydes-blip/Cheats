import { PageHeader } from "@/components/PageHeader";
import { LiveIcon } from "@/components/icons";

export const metadata = { title: "Live" };

export default function Live() {
  return (
    <>
      <PageHeader title="Live" />
      <div className="px-6 py-16 text-center">
        <LiveIcon size={48} className="mx-auto text-accent" />
        <h2 className="mt-4 text-2xl font-black">Live is on the way</h2>
        <p className="mx-auto mt-2 max-w-sm text-muted">
          Live blogs for big stories (Stage 2), creator shows with schedules and replays (Stage 3), and live video, audio rooms, and debate stages (Stage 4).
        </p>
      </div>
    </>
  );
}
