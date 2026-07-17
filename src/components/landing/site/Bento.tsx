"use client";

// Bento feature grid: three cards on a soft emerald field. Feature rows stagger
// in, the growth bars fill on reveal, and each card lifts slightly on hover.

import { Database, Sparkles, Gauge, MessageSquare, Smartphone } from "lucide-react";
import { useReveal } from "@/lib/use-reveal";

const FEATURES = [
  { icon: Database, label: "Live NSE data" },
  { icon: Gauge, label: "Quant signals" },
  { icon: Sparkles, label: "AI research" },
];

const BARS = [
  { label: "Signal accuracy", pct: 72, strong: true },
  { label: "Coverage", pct: 46, strong: false },
];

export function Bento() {
  const { ref, shown } = useReveal<HTMLDivElement>("0px 0px -12% 0px");

  return (
    <section id="features" className="bg-(--color-brand-100) px-5 py-20">
      <div ref={ref} className="mx-auto max-w-6xl rounded-3xl bg-(--color-surface)/60 p-4 backdrop-blur sm:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

          {/* Card 1 — intelligence */}
          <div className="rounded-2xl bg-(--color-surface) p-6 shadow-[var(--shadow-sm)] ring-1 ring-(--color-border) transition-transform duration-300 hover:-translate-y-1">
            <div className="flex items-center gap-2">
              <span className="h-8 w-8 rounded-full bg-gradient-to-br from-(--color-brand-400) to-(--color-brand-300)" />
              <span className="text-[13px] font-medium text-(--color-fg-subtle)">You</span>
            </div>
            <h3 className="mt-5 text-[24px] font-semibold leading-tight text-(--color-fg)">
              Smarter <span className="text-gradient-emerald">market intelligence</span>
            </h3>
            <ul className="mt-6 space-y-3">
              {FEATURES.map((f, i) => (
                <li
                  key={f.label}
                  className="flex items-center gap-3"
                  style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(12px)", transition: `opacity 0.5s ease ${0.1 + i * 0.1}s, transform 0.5s ease ${0.1 + i * 0.1}s` }}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-(--color-brand-100) text-(--color-brand-600)">
                    <f.icon className="h-4 w-4" />
                  </span>
                  <span className="text-[14px] text-(--color-fg-muted)">{f.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Card 2 — momentum / bars */}
          <div className="rounded-2xl bg-(--color-surface) p-6 shadow-[var(--shadow-sm)] ring-1 ring-(--color-border) transition-transform duration-300 hover:-translate-y-1">
            <p className="text-[12px] text-(--color-fg-subtle)">Momentum</p>
            <div className="mt-5 space-y-4">
              {BARS.map((b) => (
                <div key={b.label}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px] text-(--color-fg-muted)">
                    <span>{b.label}</span>
                    <span className="tabular">{b.pct}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-(--color-surface-3)">
                    <div
                      className={`h-full rounded-full ${b.strong ? "bg-gradient-to-r from-(--color-brand-600) to-(--color-brand-400)" : "bg-(--color-brand-300)"}`}
                      style={{ width: shown ? `${b.pct}%` : "0%", transition: "width 1.1s cubic-bezier(0.16,1,0.3,1) 0.3s" }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-[12px] text-(--color-fg-subtle)">Security &amp; innovation</p>
            <p className="mt-1 text-[18px] font-semibold text-(--color-fg)">We reinvest in the models</p>
            <p className="mt-2 text-[13px] leading-relaxed text-(--color-fg-muted)">
              Every edge we find flows back into the signals — compounding quarter over quarter.
            </p>
          </div>

          {/* Card 3 — stacked */}
          <div className="grid grid-rows-2 gap-4">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-(--color-brand-800) to-(--color-brand-950) p-6 text-white shadow-[var(--shadow-sm)]">
              <h3 className="max-w-[80%] text-[20px] font-semibold leading-tight">
                Ask anything, <span className="text-(--color-brand-300)">get an answer.</span>
              </h3>
              <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 backdrop-blur">
                <MessageSquare className="h-4 w-4 text-(--color-brand-300)" />
                <span className="text-[12.5px] text-white/85">How is Infosys doing this quarter?</span>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-(--color-brand-100) to-(--color-brand-200) shadow-[var(--shadow-sm)]">
              <div className="flex h-full items-center justify-center py-8">
                <Smartphone className="h-14 w-14 text-(--color-brand-700)" />
              </div>
              <span className="absolute bottom-3 left-4 text-[12px] font-medium text-(--color-brand-700)">On-the-go, always live</span>
            </div>
          </div>

        </div>
      </div>

      {/* marquee */}
      <div className="mt-8 overflow-hidden">
        <div className="flex whitespace-nowrap text-[13px] font-semibold uppercase tracking-[0.25em] text-(--color-brand-600)/60" style={{ animation: "marquee 26s linear infinite" }}>
          {[0, 1].map((n) => (
            <span key={n} className="px-6" aria-hidden={n === 1}>
              Live NSE data · AI research · Quant signals · Portfolio tracking · Head-to-head compare · Real-time prices ·&nbsp;
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
