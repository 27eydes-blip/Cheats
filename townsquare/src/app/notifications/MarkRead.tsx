"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsReadAction } from "@/actions/social";

/** Opening the page marks everything read; unread items keep their highlight until you leave. */
export function MarkRead() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => markNotificationsReadAction().then(() => router.refresh()), 1500);
    return () => clearTimeout(t);
  }, [router]);
  return null;
}
