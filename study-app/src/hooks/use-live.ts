"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Table = "classes" | "topics" | "notes" | "note_pages" | "quiz_sets" | "questions";

/**
 * Loads data and re-loads it whenever any of `tables` changes in the
 * database, from this device or another. That is what keeps phone, iPad and
 * laptop in sync instantly. RLS means only the student's own rows stream in.
 */
export function useLive<T>(key: string | null, load: () => Promise<T>, tables: Table[], filter?: string) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  const refresh = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e as Error);
    }
  }, []);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    loadRef
      .current()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e));
    const sb = supabaseBrowser();
    const channel = sb.channel(`live:${key}:${Math.random().toString(36).slice(2)}`);
    for (const table of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, () => {
        // Coalesce bursts (e.g. 20 questions inserted at once) into one reload.
        clearTimeout(timer);
        timer = setTimeout(() => !cancelled && refresh(), 150);
      });
    }
    channel.subscribe();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, filter, tables.join(",")]);

  return { data, error, refresh, loading: data === undefined && !error };
}
