"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Remembers the browser's time zone in a cookie so game times and "Today" match the reader's clock. */
export function TzCookie() {
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!tz) return;
    const have = document.cookie.match(/(?:^|; )tz=([^;]*)/)?.[1];
    if (have && decodeURIComponent(have) === tz) return;
    document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    if (path.startsWith("/sports") || path === "/topics/sports") router.refresh();
  }, [path, router]);
  return null;
}
