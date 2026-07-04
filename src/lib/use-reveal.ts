"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One-shot IntersectionObserver reveal. Attach `ref`, then toggle the
 * `.reveal-shown` class (or any style) off `shown`.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(rootMargin = "0px 0px -12% 0px") {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          obs.disconnect();
        }
      },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin, shown]);

  return { ref, shown };
}

/** Fires `onEnter` whenever the element crosses the vertical centre band of the viewport. */
export function useInCenter<T extends HTMLElement = HTMLDivElement>(onEnter: () => void) {
  const ref = useRef<T>(null);
  const cb = useRef(onEnter);
  cb.current = onEnter;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) cb.current();
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return ref;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

/** rAF count-up from 0 to `to` once `start` is true. */
export function useCountUp(to: number, start: boolean, duration = 1800) {
  const [val, setVal] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    if (!start || done.current) return;
    done.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVal(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 5);
    function frame(now: number) {
      const t = Math.min(1, (now - t0) / duration);
      setVal(to * ease(t));
      if (t < 1) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [start, to, duration]);

  return val;
}

/** Stable callback helper for list items. */
export function useStableCallback<A extends unknown[]>(fn: (...args: A) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}
