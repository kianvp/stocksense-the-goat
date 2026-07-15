"use client";

// The pinned cinematic hero: 400vh of scroll driving the CandleScene camera
// and morph, with three copy beats choreographed against it. Uses the proven
// rAF scroll driver (not a scroll library) and falls back to the flat live
// sparkline hero when WebGL or motion isn't available.

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { HeroBackdrop } from "../HeroBackdrop";
import { useScrollDriver } from "@/lib/use-section-progress";
import { getChart } from "@/lib/api/yahoo";
import { fallbackSeries } from "@/lib/quant-steps";

const CandleScene = dynamic(() => import("./CandleScene"), { ssr: false });

// True only for real, hardware-accelerated WebGL. Software rasterisers
// (SwiftShader/llvmpipe — common in VMs and GPU-less machines) technically
// support WebGL but would render this scene as a slideshow, so they get the
// calm flat hero instead.
function hasHardwareWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    return !/swiftshader|llvmpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 0→1→0 window: fade in over [a,b], hold, fade out over [c,d]. */
const win = (p: number, a: number, b: number, c: number, d: number) =>
  clamp01((p - a) / Math.max(1e-6, b - a)) * (1 - clamp01((p - c) / Math.max(1e-6, d - c)));

export function Hero3D() {
  const sectionRef = useRef<HTMLElement>(null);
  const beat1 = useRef<HTMLDivElement>(null);
  const beat2 = useRef<HTMLDivElement>(null);
  const beat3 = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);

  const [mode, setMode] = useState<"pending" | "webgl" | "flat">("pending");
  const [curve, setCurve] = useState<number[] | null>(null);

  // Gate: reduced motion or no hardware WebGL → calm flat hero
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMode(!reduced && hasHardwareWebGL() ? "webgl" : "flat");
  }, []);

  // Real NIFTY closes shape the morph target
  useEffect(() => {
    let cancelled = false;
    getChart("NIFTY50", "3mo", "1d").then((r) => {
      if (cancelled) return;
      const closes = r?.candles.map((c) => c.price).filter((v) => v > 0) ?? [];
      const series = closes.length > 30 ? closes : fallbackSeries(11, 24000);
      const min = Math.min(...series);
      const max = Math.max(...series);
      const span = max - min || 1;
      setCurve(series.map((v) => (v - min) / span));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onFrame = useCallback((p: number) => {
    progressRef.current = p;

    const apply = (el: HTMLDivElement | null, o: number, y: number) => {
      if (!el) return;
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      el.style.pointerEvents = o > 0.5 ? "auto" : "none";
    };

    // Beat 1 starts fully visible and fades out as the camera descends
    const o1 = 1 - clamp01((p - 0.14) / 0.14);
    apply(beat1.current, o1, -p * 220);

    const o2 = win(p, 0.34, 0.42, 0.52, 0.6);
    apply(beat2.current, o2, (1 - o2) * 26);

    const o3 = win(p, 0.8, 0.9, 1.01, 1.02);
    apply(beat3.current, o3, (1 - o3) * 30);

    if (cueRef.current) cueRef.current.style.opacity = (1 - clamp01(p / 0.08)).toFixed(3);

    if (dotsRef.current) {
      const active = p < 0.34 ? 0 : p < 0.72 ? 1 : 2;
      Array.from(dotsRef.current.children).forEach((dot, i) => {
        (dot as HTMLElement).style.opacity = i === active ? "1" : "0.28";
        (dot as HTMLElement).style.transform = i === active ? "scaleY(1)" : "scaleY(0.45)";
      });
    }
  }, []);

  useScrollDriver(sectionRef, "pin", onFrame, 0.16);

  /* ------------------------------------------------------- flat fallback */
  if (mode === "flat") {
    return (
      <section className="relative isolate flex min-h-[92vh] flex-col justify-center">
        <HeroBackdrop />
        <div className="mx-auto max-w-7xl px-5 py-24 text-center">
          <Badge />
          <Headline />
          <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-white/70">
            Live prices for every NSE stock and ETF, an AI research copilot, a quant engine that
            shows its math, and live tracking for the portfolio you already own.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Ctas />
          </div>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------- pinned cinema */
  return (
    <section ref={sectionRef} className="relative" style={{ height: mode === "webgl" ? "400vh" : "100vh" }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* Scene */}
        {mode === "webgl" && curve && (
          <CandleScene progressRef={progressRef} curve={curve} compact={typeof window !== "undefined" && window.innerWidth < 768} />
        )}
        {mode === "webgl" && !curve && <div className="absolute inset-0 bg-[#03130c]" />}

        {/* Legibility washes */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-(--color-brand-950)/80 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-(--color-brand-950)/70 to-transparent" />

        {/* Beat 1 — the market as a city */}
        <div ref={beat1} className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center" style={{ willChange: "transform, opacity" }}>
          <Badge />
          <Headline />
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-white/70 sm:text-[17.5px]">
            Scroll to fly through it.
          </p>
        </div>

        {/* Beat 2 — inside the field */}
        <div ref={beat2} className="absolute inset-0 flex items-end justify-start px-6 pb-[18vh] sm:px-16" style={{ opacity: 0, willChange: "transform, opacity" }}>
          <div className="max-w-md">
            <p className="text-[11px] uppercase tracking-[0.22em] font-semibold text-(--color-brand-300)">Inside the tape</p>
            <h2 className="mt-3 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-[46px]">
              Every tick,
              <br />
              live from the NSE.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/65">
              2,354 equities. 328 ETFs. Indices, day ranges and depth — streaming while you watch.
            </p>
          </div>
        </div>

        {/* Beat 3 — the morph resolves into the real NIFTY line */}
        <div ref={beat3} className="absolute inset-0 flex flex-col items-center justify-center px-5 pt-[30vh] text-center" style={{ opacity: 0, willChange: "transform, opacity" }}>
          <h2 className="text-[38px] font-semibold leading-[1.04] tracking-[-0.032em] text-white sm:text-[56px]">
            From chaos, <span className="text-gradient-emerald">clarity.</span>
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/65">
            That line is the real NIFTY 50, drawn from live closes. StockSense turns the whole
            firehose into something you can actually read.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Ctas />
          </div>
        </div>

        {/* Beat indicator */}
        <div ref={dotsRef} className="absolute right-5 top-1/2 hidden -translate-y-1/2 flex-col gap-2 sm:flex">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-7 w-[3px] rounded-full bg-(--color-brand-300) transition-all duration-300" style={{ opacity: i === 0 ? 1 : 0.28 }} />
          ))}
        </div>

        {/* Scroll cue */}
        <div ref={cueRef} className="absolute bottom-7 left-1/2 -translate-x-1/2 text-white/60">
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[10.5px] uppercase tracking-[0.22em]">Scroll</span>
            <ChevronDown className="h-4 w-4 animate-scroll-cue" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ shared bits */

function Badge() {
  return (
    <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[12px] font-medium text-white/85 backdrop-blur">
      <Sparkles className="h-3.5 w-3.5 text-(--color-brand-300)" />
      2,350+ NSE stocks · 325+ ETFs · live data
    </div>
  );
}

const HEADLINE = ["The", "entire", "Indian", "market,"];
const HEADLINE_ACCENT = ["alive", "on", "one", "screen."];

function Headline() {
  return (
    <h1 className="mt-7 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] text-white sm:text-6xl md:text-[76px]">
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
            <span className="word-rise" style={{ "--word-delay": `${80 * (i + HEADLINE.length)}ms` } as React.CSSProperties}>
              {w}&nbsp;
            </span>
          </span>
        ))}
      </span>
    </h1>
  );
}

function Ctas() {
  return (
    <>
      <MagneticButton>
        <Button href="/dashboard" size="lg" className="bg-white text-(--color-brand-900) hover:bg-white/90 shadow-none">
          Start exploring — free
          <ArrowRight className="h-4 w-4" />
        </Button>
      </MagneticButton>
      <MagneticButton>
        <Button href="/ask-ai" variant="ghost" size="lg" className="text-white hover:bg-white/10">
          <Sparkles className="h-4 w-4" /> Ask the AI
        </Button>
      </MagneticButton>
    </>
  );
}
