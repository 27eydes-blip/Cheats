"use client";

import { useEffect, useState } from "react";

/** True when the media query matches (false during server render). */
export function useMedia(query: string) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = matchMedia(query);
    setM(mq.matches);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return m;
}

export const usePhone = () => useMedia("(max-width: 639px)");
