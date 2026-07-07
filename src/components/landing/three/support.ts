"use client";

import { useEffect, useState } from "react";

let cached: boolean | null = null;

export function canUseWebGL(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement("canvas");
    cached = !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    cached = false;
  }
  return cached;
}

/**
 * Gate for decorative WebGL canvases: true only after mount, when the device
 * has WebGL and the user hasn't asked for reduced motion.
 */
export function useWebGLGate(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setOk(!reduced && canUseWebGL());
  }, []);
  return ok;
}
