"use client";

import { ErrorState } from "@/components/ui/States";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-10">
      <ErrorState message="Something went wrong loading this page." onRetry={reset} />
    </div>
  );
}
