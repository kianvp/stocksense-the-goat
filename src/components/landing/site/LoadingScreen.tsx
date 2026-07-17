"use client";

// Kuvera-style branded intro: a clean full-screen panel where the InvestSense
// chart-mark draws itself, the wordmark rises in, and a hairline progress bar
// fills — then the whole panel lifts away to reveal the page. Rendered in the
// static HTML (client components are prerendered), so there's no flash of the
// page before it appears. Scroll is locked while it's up.

import { useEffect, useState } from "react";

type Phase = "show" | "out" | "gone";

export function LoadingScreen() {
  const [phase, setPhase] = useState<Phase>("show");

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Lock scroll while the panel covers the page.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const outAt = reduced ? 150 : 1800;
    const goneAt = reduced ? 300 : 2450;

    const t1 = window.setTimeout(() => setPhase("out"), outAt);
    const t2 = window.setTimeout(() => {
      setPhase("gone");
      document.body.style.overflow = prevOverflow;
    }, goneAt);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-(--color-brand-950)"
      style={{
        transition: "opacity 0.65s cubic-bezier(0.22,1,0.36,1), visibility 0.65s",
        opacity: phase === "out" ? 0 : 1,
        visibility: phase === "out" ? "hidden" : "visible",
      }}
    >
      {/* faint glow behind the mark */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(94,234,212,0.14), transparent 70%)" }}
      />

      <div className="relative flex flex-col items-center">
        {/* drawing mark */}
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" className="drop-shadow-[0_0_12px_rgba(94,234,212,0.35)]">
          <path
            d="M4 16l5-5 3.5 3L20 7"
            stroke="#5eead4"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 26,
              strokeDashoffset: 26,
              animation: "loader-mark 1.05s cubic-bezier(0.65,0,0.35,1) 0.15s forwards",
            }}
          />
          <circle
            cx="20"
            cy="7"
            r="2"
            fill="#5eead4"
            style={{ animation: "fade-up 0.4s ease 1.05s both" }}
          />
        </svg>

        {/* wordmark */}
        <div
          className="mt-5 text-[19px] font-semibold tracking-tight text-white"
          style={{ animation: "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) 0.75s both" }}
        >
          Invest<span className="text-(--color-brand-300)">Sense</span>
        </div>

        {/* progress hairline */}
        <div className="mt-6 h-px w-40 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full w-full bg-gradient-to-r from-(--color-brand-400) to-(--color-brand-300)"
            style={{ transformOrigin: "left", animation: "loader-bar 1.5s cubic-bezier(0.5,0,0.2,1) 0.2s forwards" }}
          />
        </div>
      </div>
    </div>
  );
}
