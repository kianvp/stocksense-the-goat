"use client";

import { useCallback, useRef } from "react";
import { ArrowRight, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { HeroPreview } from "./HeroPreview";
import { HeroBackdrop } from "./HeroBackdrop";
import { useScrollDriver } from "@/lib/use-section-progress";

const HEADLINE = ["The", "entire", "Indian", "market,"];
const HEADLINE_ACCENT = ["alive", "on", "one", "screen."];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function CinematicHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);

  const onFrame = useCallback((p: number) => {
    const fade = 1 - clamp01(p / 0.55);
    const enter = clamp01(p / 0.5);
    if (copyRef.current) {
      copyRef.current.style.transform = `translate3d(0, ${(-140 * p).toFixed(1)}px, 0)`;
      copyRef.current.style.opacity = fade.toFixed(3);
    }
    if (previewRef.current) {
      previewRef.current.style.transform = `perspective(1400px) rotateX(${(10 * (1 - enter)).toFixed(2)}deg) scale(${(0.96 + 0.06 * enter).toFixed(3)}) translate3d(0, ${(-60 * p).toFixed(1)}px, 0)`;
    }
    if (orb1Ref.current) orb1Ref.current.style.transform = `translate3d(0, ${(180 * p).toFixed(1)}px, 0)`;
    if (orb2Ref.current) orb2Ref.current.style.transform = `translate3d(0, ${(-140 * p).toFixed(1)}px, 0)`;
    if (cueRef.current) cueRef.current.style.opacity = fade.toFixed(3);
  }, []);

  useScrollDriver(sectionRef, "exit", onFrame);

  return (
    <section ref={sectionRef} className="relative isolate min-h-[108vh]">
      {/* Parallax orbs */}
      <div
        ref={orb1Ref}
        className="absolute -top-32 left-[8%] -z-10 h-[440px] w-[440px] rounded-full bg-(--color-brand-400)/14 blur-3xl"
      />
      <div
        ref={orb2Ref}
        className="absolute top-[30%] right-[4%] -z-10 h-[380px] w-[380px] rounded-full bg-(--color-brand-300)/10 blur-3xl"
      />

      {/* Live market backdrop (sits above orbs, below content) */}
      <HeroBackdrop />

      <div className="mx-auto max-w-7xl px-5 pt-14 pb-24 sm:pt-20 md:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-[1.08fr_1fr] lg:gap-16">
          <div ref={copyRef} style={{ willChange: "transform, opacity" }}>
            <div
              className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[12px] font-medium text-white/85 backdrop-blur"
            >
              <Sparkles className="h-3.5 w-3.5 text-(--color-brand-300)" />
              2,350+ NSE stocks · 325+ ETFs · live data
            </div>

            <h1 className="mt-7 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] text-white sm:text-6xl md:text-[74px]">
              <span className="block">
                {HEADLINE.map((w, i) => (
                  <span key={w} className="inline-block overflow-hidden pb-1 align-bottom">
                    <span className="word-rise" style={{ "--word-delay": `${80 * i}ms` } as React.CSSProperties}>
                      {w}&nbsp;
                    </span>
                  </span>
                ))}
              </span>
              <span className="block text-gradient-emerald">
                {HEADLINE_ACCENT.map((w, i) => (
                  <span key={w} className="inline-block overflow-hidden pb-2 align-bottom">
                    <span
                      className="word-rise"
                      style={{ "--word-delay": `${80 * (i + HEADLINE.length)}ms` } as React.CSSProperties}
                    >
                      {w}&nbsp;
                    </span>
                  </span>
                ))}
              </span>
            </h1>

            <p
              className="animate-fade-up mt-7 max-w-xl text-base leading-relaxed text-white/70 sm:text-[17.5px]"
              style={{ animationDelay: "550ms" }}
            >
              Every listed NSE stock and ETF with live prices, institutional-grade charts,
              an AI research copilot, and a ₹5,00,000 virtual portfolio to practise on.
              Calm, fast, and built for Indian investors.
            </p>

            <div
              className="animate-fade-up mt-9 flex flex-wrap items-center gap-3"
              style={{ animationDelay: "700ms" }}
            >
              <Button href="/dashboard" size="lg" className="bg-white text-(--color-brand-900) hover:bg-white/90 shadow-none">
                Start exploring — free
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button href="/ask-ai" variant="ghost" size="lg" className="text-white hover:bg-white/10">
                <Sparkles className="h-4 w-4" /> Ask the AI
              </Button>
            </div>

            <dl
              className="animate-fade-up mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-white/10 pt-6"
              style={{ animationDelay: "880ms" }}
            >
              <Stat value="2,350+" label="NSE stocks" />
              <Stat value="325+" label="ETFs live" />
              <Stat value="₹5L" label="Virtual cash" />
            </dl>
          </div>

          <div className="animate-fade-up relative hidden lg:block" style={{ animationDelay: "350ms" }}>
            <div ref={previewRef} style={{ willChange: "transform" }}>
              <HeroPreview />
            </div>
          </div>
        </div>
      </div>

      {/* Scroll cue */}
      <div ref={cueRef} className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50">
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[10.5px] uppercase tracking-[0.22em]">Scroll</span>
          <ChevronDown className="h-4 w-4 animate-scroll-cue" />
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.14em] text-white/45">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight text-white tabular">{value}</dd>
    </div>
  );
}
