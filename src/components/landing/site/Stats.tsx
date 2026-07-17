"use client";

// "The numbers speak": a dashed arc draws on, an emerald dot travels it, and the
// headline figure counts up with a blur-in. Uses SMIL animateMotion for the dot
// so it stays glued to the arc at every viewport width (no motion-path/scale
// drift). Everything triggers when the block scrolls into view.

import { useEffect, useRef } from "react";
import { useReveal, useCountUp } from "@/lib/use-reveal";

const ARC = "M 60,210 A 380,380 0 0,1 640,210";
const TOTAL = 2682; // 2,354 NSE equities + 328 ETFs

const SUBSTATS = [
  { value: "2,354", label: "Equities" },
  { value: "328", label: "ETFs" },
  { value: "24/7", label: "AI copilot" },
];

export function Stats() {
  const { ref, shown } = useReveal<HTMLDivElement>("0px 0px -25% 0px");
  const count = useCountUp(TOTAL, shown, 2000);
  const dotAnim = useRef<SVGAnimateMotionElement>(null);

  // Kick the SMIL dot off exactly when the section reveals.
  useEffect(() => {
    if (shown && dotAnim.current) {
      try { dotAnim.current.beginElement(); } catch { /* SMIL unsupported — dot rests at start */ }
    }
  }, [shown]);

  return (
    <section id="numbers" className="overflow-hidden bg-(--color-surface) px-5 py-24">
      <div ref={ref} className={`mx-auto max-w-3xl text-center ${shown ? "is-in" : ""}`}>
        <span className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-(--color-border) bg-(--color-surface-2) px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-fg-subtle)">
          <span className="h-1.5 w-1.5 rounded-full bg-(--color-brand-400)" /> The numbers speak
        </span>

        {/* arc stage — SVG scales as one unit, dot rides the path via SMIL */}
        <div className="relative mx-auto mt-12 w-full max-w-[700px]">
          <svg viewBox="0 0 700 230" className="w-full" fill="none">
            <defs>
              <linearGradient id="stat-arc" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#115e3c" />
                <stop offset="55%" stopColor="#1f7a4f" />
                <stop offset="100%" stopColor="#5eead4" />
              </linearGradient>
            </defs>

            {/* dashed track */}
            <path d={ARC} stroke="var(--color-border-strong)" strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" />
            {/* drawn arc */}
            <path
              d={ARC}
              stroke="url(#stat-arc)"
              strokeWidth="3"
              strokeLinecap="round"
              style={{
                strokeDasharray: 700,
                strokeDashoffset: shown ? 0 : 700,
                transition: "stroke-dashoffset 1.1s ease-in-out 0.15s",
              }}
            />
            {/* vertical drop line to the figure */}
            <path
              d="M 350,105 V 145"
              stroke="var(--color-fg-subtle)"
              strokeWidth="2"
              strokeDasharray="4 5"
              strokeLinecap="round"
              style={{ opacity: shown ? 1 : 0, transition: "opacity 0.5s ease 0.6s" }}
            />
            {/* travelling dot */}
            <circle r="7" fill="#5eead4" style={{ filter: "drop-shadow(0 0 8px rgba(94,234,212,0.7))" }}>
              <animateMotion ref={dotAnim} dur="1.6s" begin="indefinite" fill="freeze" path={ARC} />
            </circle>
          </svg>

          {/* figure + label, centred under the apex */}
          <div className="absolute inset-x-0 top-[42%] flex flex-col items-center">
            <div
              className={`text-gradient-emerald font-semibold leading-none tracking-tight ${shown ? "blur-in" : ""}`}
              style={{ fontSize: "clamp(56px, 11vw, 96px)", opacity: shown ? undefined : 0 }}
            >
              {Math.round(count).toLocaleString("en-IN")}
            </div>
            <div
              className="mt-3 text-[15px] font-medium text-(--color-fg-muted)"
              style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(8px)", transition: "opacity 0.6s ease 1.6s, transform 0.6s ease 1.6s" }}
            >
              NSE stocks &amp; ETFs, tracked live
            </div>
          </div>
        </div>

        {/* sub-stats */}
        <div className="mt-10 flex items-center justify-center gap-8 sm:gap-14">
          {SUBSTATS.map((s, i) => (
            <div
              key={s.label}
              style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(10px)", transition: `opacity 0.5s ease ${1.9 + i * 0.1}s, transform 0.5s ease ${1.9 + i * 0.1}s` }}
            >
              <div className="text-[22px] font-semibold text-(--color-fg)">{s.value}</div>
              <div className="mt-0.5 text-[12px] uppercase tracking-[0.14em] text-(--color-fg-subtle)">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
