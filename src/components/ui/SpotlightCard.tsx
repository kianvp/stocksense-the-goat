"use client";

// Cursor-following spotlight + subtle 3D tilt. Pure CSS transforms driven by
// pointer events — no animation library. Wrap in a parent with `perspective`
// (the component sets its own if none given) for the tilt to read.

import { useRef } from "react";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/use-reveal";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Max tilt in degrees. 0 disables tilt but keeps the spotlight. */
  maxTilt?: number;
};

export function SpotlightCard({ children, className, maxTilt = 5 }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const reduced = usePrefersReducedMotion();

  function onPointerMove(e: React.PointerEvent) {
    if (reduced) return;
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty("--spot-x", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--spot-y", `${(y * 100).toFixed(1)}%`);
      el.style.setProperty("--spot-o", "1");
      const rx = (0.5 - y) * maxTilt;
      const ry = (x - 0.5) * maxTilt;
      el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    });
  }

  function onPointerLeave() {
    const el = cardRef.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.style.setProperty("--spot-o", "0");
    el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
  }

  return (
    <div
      ref={cardRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={cn("relative transition-transform duration-300 ease-out will-change-transform", className)}
      style={{ transformStyle: "preserve-3d" }}
    >
      {children}
      {/* Spotlight glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{
          opacity: "var(--spot-o, 0)",
          background:
            "radial-gradient(360px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in srgb, var(--color-brand-400) 9%, transparent), transparent 65%)",
        }}
      />
    </div>
  );
}
