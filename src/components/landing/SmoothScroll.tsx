"use client";

// Lenis smooth scroll for the landing page only — the buttery inertia that
// makes scroll choreography feel cinematic. Native scroll position still
// updates, so the rAF scroll drivers keep working unchanged.

import { useEffect } from "react";
import Lenis from "lenis";

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.11, autoRaf: true });
    return () => lenis.destroy();
  }, []);
  return null;
}
