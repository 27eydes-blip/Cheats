"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/States";
import { reportClientError } from "@/components/ui/ErrorBoundary";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError("page", error, error.digest), [error]);
  return (
    <div className="py-10">
      <ErrorState message="Something went wrong loading this page." onRetry={reset} />
    </div>
  );
}
