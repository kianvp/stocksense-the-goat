"use client";

// Hero: dark, cinematic, calm. A drifting emerald aurora + a few soft light
// beams (no hard speed lines), with a typewriter headline that cycles the last
// word. "We empower to create <wealth · clarity · confidence · the future>".

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { LandingNav } from "./LandingNav";

const WORDS = ["wealth.", "clarity.", "confidence.", "an edge."];

function useTypewriter(words: string[]) {
  const [text, setText] = useState("");
  const state = useRef({ w: 0, i: 0, deleting: false });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(words[0]);
      return;
    }
    let timer: number;
    const tick = () => {
      const s = state.current;
      const full = words[s.w];
      s.i += s.deleting ? -1 : 1;
      setText(full.slice(0, s.i));

      let delay = s.deleting ? 45 : 95;
      if (!s.deleting && s.i === full.length) {
        delay = 1500; // hold on the complete word
        s.deleting = true;
      } else if (s.deleting && s.i === 0) {
        s.deleting = false;
        s.w = (s.w + 1) % words.length;
        delay = 350;
      }
      timer = window.setTimeout(tick, delay);
    };
    timer = window.setTimeout(tick, 700);
    return () => window.clearTimeout(timer);
  }, [words]);

  return text;
}

export function Hero() {
  const typed = useTypewriter(WORDS);

  return (
    <section className="relative isolate flex h-screen min-h-[640px] flex-col overflow-hidden bg-(--color-brand-950)">
      {/* ---------------- backdrop ---------------- */}
      {/* drifting aurora glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="aurora-a absolute -left-[10%] top-[8%] h-[60vh] w-[60vh] rounded-full opacity-60 blur-[90px]"
          style={{ background: "radial-gradient(circle, rgba(31,122,79,0.55), transparent 70%)" }}
        />
        <div
          className="aurora-b absolute -right-[8%] top-[20%] h-[55vh] w-[55vh] rounded-full opacity-50 blur-[90px]"
          style={{ background: "radial-gradient(circle, rgba(6,120,95,0.45), transparent 70%)" }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-[70vh] w-[80vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-[100px]"
          style={{ background: "radial-gradient(ellipse 60% 45% at 50% 50%, rgba(94,234,212,0.10), transparent)" }}
        />
      </div>

      {/* fine dot grid, faded at the centre */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1.4px)",
          backgroundSize: "34px 34px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, transparent 20%, black 90%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, transparent 20%, black 90%)",
        }}
      />

      {/* soft light beams — slow and blurred */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="beam absolute left-0 top-[38%] h-px w-[45%] blur-[1px]" style={{ background: "linear-gradient(90deg, transparent, #5eead4, transparent)", ["--beam-dur" as string]: "11s", ["--beam-delay" as string]: "0s", transform: "rotate(-7deg)" }} />
        <div className="beam absolute left-0 top-[52%] h-px w-[40%] blur-[1px]" style={{ background: "linear-gradient(90deg, transparent, #3d9a6b, transparent)", ["--beam-dur" as string]: "14s", ["--beam-delay" as string]: "2.5s", transform: "rotate(-5deg)" }} />
        <div className="beam absolute left-0 top-[64%] h-px w-[38%] blur-[1px]" style={{ background: "linear-gradient(90deg, transparent, #6fb98e, transparent)", ["--beam-dur" as string]: "12.5s", ["--beam-delay" as string]: "5s", transform: "rotate(-9deg)" }} />
      </div>

      {/* grain + bottom fade */}
      <div className="noise pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-(--color-brand-950) to-transparent" />

      <LandingNav />

      {/* ---------------- headline ---------------- */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 text-center">
        <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[12px] font-medium text-white/85 backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-(--color-brand-300)" />
          2,350+ NSE stocks · 325+ ETFs · live data
        </div>

        <h1
          className="mt-7 flex flex-wrap items-center justify-center gap-x-3 font-semibold leading-[1.05] tracking-[-0.035em] text-white"
          style={{ fontSize: "clamp(38px, 7.5vw, 76px)" }}
        >
          <span>We empower to create</span>
          <span className="inline-flex items-center">
            <span className="text-gradient-emerald">{typed}</span>
            <span className="caret ml-1.5" style={{ height: "0.9em" }} />
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-white/70 sm:text-[17.5px]">
          The entire Indian market — live prices, an AI research copilot, a quant engine that shows
          its math, and your real portfolio, tracked.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
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
        </div>
      </div>

      {/* ---------------- bottom bar ---------------- */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 pb-6">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-white/70">
          Scroll
          <ChevronDown className="h-3.5 w-3.5 animate-scroll-cue" />
        </div>
        <div className="hidden items-center gap-4 sm:flex">
          <span className="text-[13px] text-white/60">Trusted by data-driven investors</span>
          <span className="h-4 w-px bg-white/20" />
          <div className="flex -space-x-2">
            <span className="h-7 w-7 rounded-full border-2 border-(--color-brand-950) bg-gradient-to-br from-(--color-brand-400) to-(--color-brand-300)" />
            <span className="h-7 w-7 rounded-full border-2 border-(--color-brand-950) bg-gradient-to-br from-(--color-brand-500) to-(--color-brand-300)" />
            <span className="h-7 w-7 rounded-full border-2 border-(--color-brand-950) bg-gradient-to-br from-(--color-brand-600) to-(--color-brand-400)" />
          </div>
          <span className="text-[12px] text-white/50">10k+ investors</span>
        </div>
      </div>
    </section>
  );
}
