"use client";

// Igloo-style centerpiece: one saturated brand moment between the light
// editorial sections — a draggable particle globe of the Indian market's
// place in the world, paired with an oversized headline.

import dynamic from "next/dynamic";
import { Move3d } from "lucide-react";
import { useReveal } from "@/lib/use-reveal";
import { cn } from "@/lib/cn";

const PulseGlobe = dynamic(() => import("./three/PulseGlobe"), {
  ssr: false,
  loading: () => (
    <div className="particle-dust h-full w-full rounded-[32px] border border-white/10 bg-white/[0.03]" aria-hidden="true" />
  ),
});

const CHIPS = [
  "NSE · BSE",
  "2,354 listed equities",
  "328 ETFs",
  "Live from the exchange",
];

export function MarketPulse3D() {
  const { ref, shown } = useReveal<HTMLDivElement>();

  return (
    <section id="market-pulse" className="relative overflow-hidden bg-(--color-brand-950)">
      {/* Single saturated brand moment — restrained glows, no gradient soup */}
      <div className="absolute left-1/2 top-0 h-px w-[min(1200px,90%)] -translate-x-1/2 bg-gradient-to-r from-transparent via-(--color-brand-400)/40 to-transparent" />
      <div className="pointer-events-none absolute -left-40 top-1/3 h-[420px] w-[420px] rounded-full bg-(--color-brand-500)/10 blur-3xl" />

      <div
        ref={ref}
        className={cn("reveal mx-auto grid max-w-7xl items-center gap-14 px-5 py-28 lg:grid-cols-[0.95fr_1.05fr] lg:gap-10 lg:py-36", shown && "reveal-shown")}
      >
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] font-semibold text-(--color-brand-300)">
            Market pulse
          </p>
          <h2 className="mt-4 text-[40px] font-semibold leading-[1.02] tracking-[-0.035em] text-white sm:text-[56px] md:text-[64px]">
            Markets,
            <br />
            made legible.
          </h2>
          <p className="mt-6 max-w-md text-[15.5px] leading-relaxed text-white/60">
            India is the world&apos;s most active exchange by trades. StockSense turns that firehose —
            every tick on the NSE and BSE — into something you can actually read.
          </p>

          <div className="mt-9 flex flex-wrap gap-2">
            {CHIPS.map((chip, i) => (
              <span
                key={chip}
                className={cn(
                  "reveal rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-[12px] font-medium text-white/75",
                  shown && "reveal-shown",
                )}
                style={{ "--reveal-delay": `${200 + i * 90}ms` } as React.CSSProperties}
              >
                {chip}
              </span>
            ))}
          </div>

          <p className="mt-10 inline-flex items-center gap-2 text-[11.5px] uppercase tracking-[0.18em] text-white/35">
            <Move3d className="h-3.5 w-3.5" /> Drag the globe to orbit
          </p>
        </div>

        <div className="relative h-[440px] sm:h-[540px] lg:h-[600px]">
          <PulseGlobe />
        </div>
      </div>
    </section>
  );
}
