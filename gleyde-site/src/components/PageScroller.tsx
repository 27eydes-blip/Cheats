"use client";

import { useEffect } from "react";

/**
 * Buttery, one-panel-per-gesture scrolling for desktop.
 *
 * Each wheel flick, trackpad swipe, arrow / Page / Space key or in-page link
 * glides the page to the next panel with one long eased motion, instead of
 * the browser's quick native snap. Trackpad momentum after a swipe is
 * ignored, so one gesture never skips two panels.
 *
 * Active only where it helps: a fine pointer (mouse/trackpad), a screen at
 * least 768×700 (where every panel fits), and no prefers-reduced-motion.
 * Everywhere else the native CSS scroll snapping in globals.css applies.
 * While active it adds `paged` to <html>, which turns native snapping off.
 */

const DURATION = 1150; // ms per panel move
const QUIET = 180; // ms without wheel events that marks the start of a new gesture
const THRESHOLD = 12; // minimum wheel delta that counts as intent

/** Smooth start, long glide in, soft landing. */
function ease(t: number) {
  return t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;
}

export function PageScroller() {
  useEffect(() => {
    const query = window.matchMedia(
      "(pointer: fine) and (min-width: 768px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)",
    );
    let detach: (() => void) | null = null;

    const attach = () => {
      const root = document.documentElement;
      root.classList.add("paged");

      /** Scroll positions to stop at: each panel's top, then the very bottom (footer). */
      const stops = () => {
        const tops = Array.from(document.querySelectorAll<HTMLElement>(".panel")).map(
          (el) => el.getBoundingClientRect().top + window.scrollY,
        );
        tops.push(document.documentElement.scrollHeight - window.innerHeight);
        return [...new Set(tops.map((t) => Math.max(0, Math.round(t))))].sort((a, b) => a - b);
      };

      const current = () => {
        const s = stops();
        const y = window.scrollY;
        let best = 0;
        s.forEach((t, i) => {
          if (Math.abs(t - y) < Math.abs(s[best] - y)) best = i;
        });
        return { s, i: best };
      };

      let animating = false;
      let frame = 0;
      let pending: 0 | 1 | -1 = 0;

      const glideTo = (target: number) => {
        const from = window.scrollY;
        const distance = target - from;
        if (Math.abs(distance) < 2) return;
        cancelAnimationFrame(frame);
        animating = true;
        const start = performance.now();
        // One panel takes DURATION; longer jumps (nav links) get a little more, capped.
        const panels = Math.abs(distance) / window.innerHeight;
        const duration = Math.min(DURATION * (1 + Math.max(0, Math.log2(panels)) * 0.35), 1900);
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          window.scrollTo({ top: from + distance * ease(t), behavior: "instant" });
          if (t < 1) frame = requestAnimationFrame(step);
          else {
            animating = false;
            // A fresh gesture that arrived mid-glide chains to the next panel.
            const queued = pending;
            pending = 0;
            if (queued) go(queued);
          }
        };
        frame = requestAnimationFrame(step);
      };

      function go(dir: 1 | -1) {
        const { s, i } = current();
        const next = Math.min(s.length - 1, Math.max(0, i + dir));
        if (next !== i) glideTo(s[next]);
      }

      // Wheel / trackpad
      let lastWheel = 0;
      let armed = true; // a fresh gesture may trigger one move
      let accum = 0;
      const onWheel = (e: WheelEvent) => {
        if (e.ctrlKey) return; // pinch-zoom
        const target = e.target as HTMLElement | null;
        if (target?.closest("textarea, [data-native-scroll]")) return;
        e.preventDefault();
        const now = performance.now();
        if (now - lastWheel > QUIET) {
          armed = true;
          accum = 0;
        }
        lastWheel = now;
        if (!armed) return;
        accum += e.deltaY;
        if (Math.abs(accum) >= THRESHOLD) {
          armed = false; // the rest of this gesture (and its momentum) is ignored
          const dir = accum > 0 ? 1 : -1;
          if (animating) pending = dir; // queue it: runs when the current glide lands
          else go(dir);
        }
      };

      // Keyboard
      const onKey = (e: KeyboardEvent) => {
        const el = e.target as HTMLElement | null;
        if (el?.closest("input, textarea, select, [contenteditable]") || e.altKey || e.metaKey || e.ctrlKey) return;
        const map: Record<string, 1 | -1> = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 };
        let dir = map[e.key];
        if (e.key === " ") dir = e.shiftKey ? -1 : 1;
        if (e.key === "Home" || e.key === "End") {
          e.preventDefault();
          const s = stops();
          glideTo(e.key === "Home" ? 0 : s[s.length - 1]);
          return;
        }
        if (!dir) return;
        e.preventDefault();
        if (animating) pending = dir;
        else go(dir);
      };

      // In-page links (#about, #contact, …)
      const onClick = (e: MouseEvent) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
        const id = a?.getAttribute("href")?.slice(1);
        if (!a || !id) return;
        const el = document.getElementById(id);
        if (!el) return;
        e.preventDefault();
        glideTo(id === "top" ? 0 : el.getBoundingClientRect().top + window.scrollY);
        history.replaceState(null, "", `#${id}`);
      };

      // Keep the current panel aligned when the window is resized.
      let resizeTimer = 0;
      const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          const { s, i } = current();
          window.scrollTo({ top: s[i], behavior: "instant" });
        }, 150);
      };

      window.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("keydown", onKey);
      document.addEventListener("click", onClick);
      window.addEventListener("resize", onResize);

      return () => {
        cancelAnimationFrame(frame);
        root.classList.remove("paged");
        window.removeEventListener("wheel", onWheel);
        window.removeEventListener("keydown", onKey);
        document.removeEventListener("click", onClick);
        window.removeEventListener("resize", onResize);
      };
    };

    const update = () => {
      detach?.();
      detach = query.matches ? attach() : null;
    };
    update();
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
      detach?.();
    };
  }, []);

  return null;
}
