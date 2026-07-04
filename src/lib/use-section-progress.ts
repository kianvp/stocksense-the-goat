"use client";

// framer-motion's animation pipeline doesn't run under this Next/React
// combination, so scroll-driven effects are implemented directly:
// a passive scroll listener + rAF lerp loop that hands a smoothed 0→1
// progress value to the caller, which writes styles imperatively.

import { useEffect, type RefObject } from "react";

type Mode = "pin" | "exit";

/**
 * Drives `onFrame(progress)` with a smoothed 0→1 progress value.
 * - "pin": 0 when the section top reaches the viewport top, 1 when its bottom
 *   aligns with the viewport bottom (for sticky/pinned scenes).
 * - "exit": 0 while the section top is at/below the viewport top, 1 once the
 *   section has fully scrolled past (for hero fade-outs).
 * `onFrame` MUST be referentially stable (useCallback).
 */
export function useScrollDriver(
  ref: RefObject<HTMLElement | null>,
  mode: Mode,
  onFrame: (p: number) => void,
  smoothing = 0.16,
) {
  useEffect(() => {
    let raf = 0;
    let target = 0;
    let current: number | null = null;
    let running = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function measure() {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const p =
        mode === "pin"
          ? rect.height - vh > 0
            ? -rect.top / (rect.height - vh)
            : 0
          : -rect.top / rect.height;
      target = Math.min(1, Math.max(0, p));
    }

    function tick() {
      if (current === null || reduced) {
        current = target;
      } else {
        current += (target - current) * smoothing;
      }
      if (Math.abs(target - current) < 0.001) {
        current = target;
        onFrame(current);
        running = false;
        return;
      }
      onFrame(current);
      raf = requestAnimationFrame(tick);
    }

    function kick() {
      measure();
      if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    }

    kick();
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", kick);
    };
  }, [ref, mode, onFrame, smoothing]);
}
