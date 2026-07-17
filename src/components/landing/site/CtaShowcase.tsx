"use client";

// Product/CTA beat: an emerald wash fading to page background, a headline whose
// lines slide up out of a clipped mask, and a dashboard card that rises in.

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { useReveal } from "@/lib/use-reveal";

export function CtaShowcase() {
  const { ref, shown } = useReveal<HTMLDivElement>("0px 0px -18% 0px");

  return (
    <section
      className="relative px-5 pt-28 pb-32"
      style={{ background: "linear-gradient(180deg, #0c4a30 0%, #1f7a4f 22%, var(--color-bg) 62%)" }}
    >
      <div ref={ref} className={`mx-auto max-w-4xl text-center ${shown ? "is-in" : ""}`}>
        <h2 className="font-semibold tracking-[-0.03em] text-white" style={{ fontSize: "clamp(32px, 6vw, 54px)", lineHeight: 1.08 }}>
          <span className="line-clip block">
            <span className="line-rise block" style={{ animationDelay: "0.05s" }}>Close the gap between</span>
          </span>
          <span className="line-clip block">
            <span className="line-rise block" style={{ animationDelay: "0.18s" }}>
              you and <span className="text-(--color-brand-200)">the market.</span>
            </span>
          </span>
        </h2>

        <p className="line-clip mx-auto mt-5 max-w-xl">
          <span className="line-rise block text-[16px] leading-relaxed text-white/80" style={{ animationDelay: "0.36s" }}>
            Real-time intelligence that turns raw market noise into decisions you can act on — before
            the move happens.
          </span>
        </p>

        <div
          className="mt-8 flex justify-center"
          style={{ opacity: shown ? 1 : 0, transition: "opacity 0.6s ease 0.5s" }}
        >
          <MagneticButton>
            <Button href="/dashboard" size="lg" className="bg-white text-(--color-brand-900) hover:bg-white/90 shadow-none">
              Open the dashboard <ArrowRight className="h-4 w-4" />
            </Button>
          </MagneticButton>
        </div>

        {/* dashboard card */}
        <div
          className="mx-auto mt-14 max-w-3xl rounded-2xl border border-(--color-border) bg-(--color-surface) p-5 text-left shadow-[var(--shadow-xl)]"
          style={{
            opacity: shown ? 1 : 0,
            transform: shown ? "translateY(0) scale(1)" : "translateY(60px) scale(0.97)",
            transition: "opacity 0.8s cubic-bezier(0.16,1,0.3,1) 0.5s, transform 0.8s cubic-bezier(0.16,1,0.3,1) 0.5s",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] text-(--color-fg-subtle)">Portfolio value</p>
              <p className="text-[26px] font-bold text-(--color-fg) tabular">
                ₹24,89,050
                <span className="ml-2 text-[13px] font-semibold text-(--color-up)">▲ 12.4%</span>
              </p>
            </div>
            <div className="flex gap-2 text-[12px]">
              <span className="rounded-lg bg-(--color-surface-2) px-3 py-1 text-(--color-fg-subtle)">1D</span>
              <span className="rounded-lg bg-(--color-brand-100) px-3 py-1 font-medium text-(--color-brand-700)">1M</span>
              <span className="rounded-lg bg-(--color-surface-2) px-3 py-1 text-(--color-fg-subtle)">1Y</span>
            </div>
          </div>

          <svg viewBox="0 0 640 180" className="mt-4 h-40 w-full" preserveAspectRatio="none" fill="none">
            <defs>
              <linearGradient id="cta-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1f7a4f" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#1f7a4f" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,140 C80,120 120,150 190,110 C260,72 300,120 370,80 C440,44 500,70 560,40 L640,26"
              stroke="#1f7a4f"
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{ strokeDasharray: 900, strokeDashoffset: shown ? 0 : 900, transition: "stroke-dashoffset 1.4s ease 0.9s" }}
            />
            <path d="M0,140 C80,120 120,150 190,110 C260,72 300,120 370,80 C440,44 500,70 560,40 L640,26 L640,180 L0,180 Z" fill="url(#cta-area)" style={{ opacity: shown ? 1 : 0, transition: "opacity 0.8s ease 1.4s" }} />
          </svg>

          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              { k: "Alpha", v: "+4.8%" },
              { k: "Sharpe", v: "1.92" },
              { k: "Max DD", v: "-3.1%" },
            ].map((t) => (
              <div key={t.k} className="rounded-xl bg-(--color-surface-2) p-3">
                <p className="text-[11px] text-(--color-fg-subtle)">{t.k}</p>
                <p className="text-[15px] font-semibold text-(--color-fg) tabular">{t.v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
