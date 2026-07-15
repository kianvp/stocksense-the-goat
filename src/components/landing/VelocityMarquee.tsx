"use client";

// Giant outlined-text marquee whose speed and skew react to scroll velocity —
// scroll fast and the type whips and shears; settle and it glides. Hand-rolled
// rAF (no library), reduced-motion falls back to the existing CSS marquee.

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/use-reveal";

const LINE =
  "LIVE MARKET · 2,354 STOCKS · 328 ETFS · AI RESEARCH · QUANT ENGINE · REAL NIFTY DATA · ";

export function VelocityMarquee() {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const track = trackRef.current;
    if (!track) return;

    let raf = 0;
    let x = 0;
    let vel = 0;
    let lastY = window.scrollY;
    let half = track.scrollWidth / 2 || 1;

    function measure() {
      half = track!.scrollWidth / 2 || 1;
    }
    window.addEventListener("resize", measure);

    function tick() {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      // Smooth the velocity, let scroll whip the tape
      vel += (dy - vel) * 0.12;
      const speed = 1.1 + Math.min(22, Math.abs(vel) * 0.55);
      x -= speed;
      if (x <= -half) x += half;
      const skew = Math.max(-10, Math.min(10, vel * 0.25));
      track!.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0) skewX(${skew.toFixed(2)}deg)`;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [reduced]);

  return (
    <div className="relative overflow-hidden border-y border-white/8 bg-(--color-brand-950) py-6" aria-hidden="true">
      <div ref={trackRef} className={reduced ? "animate-marquee flex w-max" : "flex w-max will-change-transform"}>
        {[0, 1].map((copy) => (
          <span
            key={copy}
            className="shrink-0 whitespace-nowrap px-2 text-[64px] font-semibold leading-none tracking-[-0.02em] sm:text-[96px]"
            style={{
              WebkitTextStroke: "1.5px rgba(111, 185, 142, 0.55)",
              color: "transparent",
            }}
          >
            {LINE}
          </span>
        ))}
      </div>
    </div>
  );
}
