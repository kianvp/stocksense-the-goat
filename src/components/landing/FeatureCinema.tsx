"use client";

import { useState } from "react";
import {
  CandlestickChart,
  Bot,
  Briefcase,
  Newspaper,
  Scale,
  TrendingUp,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useReveal, useInCenter, useStableCallback } from "@/lib/use-reveal";
import { SpotlightCard } from "@/components/ui/SpotlightCard";

const FEATURES = [
  {
    id: "data",
    icon: CandlestickChart,
    eyebrow: "01 — Market data",
    title: "Every listed stock. Actually live.",
    body:
      "2,350+ NSE equities and 325+ ETFs stream real prices from the exchange — indices, day ranges, 52-week bands and intraday charts, refreshed continuously while you watch.",
    Visual: DataVisual,
  },
  {
    id: "ai",
    icon: Bot,
    eyebrow: "02 — AI copilot",
    title: "Research that talks back.",
    body:
      "Ask about any company in plain English. Sense reads the live tape, breaks down opportunities and risks, and shows its confidence — powered by Gemini.",
    Visual: AiVisual,
  },
  {
    id: "compare",
    icon: Scale,
    eyebrow: "03 — Compare desk",
    title: "Two stocks. One verdict.",
    body:
      "Put any two Nifty 50 companies head-to-head — normalized performance, six fundamentals scored side by side, and an AI verdict on which looks stronger right now.",
    Visual: CompareVisual,
  },
  {
    id: "portfolio",
    icon: Briefcase,
    eyebrow: "04 — Portfolio tracker",
    title: "Your real holdings. Tracked live.",
    body:
      "Log the stocks you already own with your average buy price — StockSense streams live prices and shows total value, P&L and sector allocation while you watch.",
    Visual: PortfolioVisual,
  },
  {
    id: "news",
    icon: Newspaper,
    eyebrow: "05 — News intelligence",
    title: "Headlines, with the 'so what' attached.",
    body:
      "Live market news scored for sentiment, and an AI 'why it matters' brief on every story — so you read less and understand more.",
    Visual: NewsVisual,
  },
];

export function FeatureCinema() {
  const [active, setActive] = useState(0);
  const onActive = useStableCallback((i: number) => setActive(i));

  return (
    <section id="features" className="relative bg-(--color-bg)">
      {/* Fade transition from the dark section above */}
      <div className="absolute inset-x-0 -top-px h-24 bg-gradient-to-b from-(--color-brand-950) to-transparent" />

      <div className="mx-auto max-w-7xl px-5 pt-36 pb-28">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          {/* Sticky rail */}
          <div className="hidden lg:block">
            <div className="sticky top-28">
              <p className="text-[11px] uppercase tracking-[0.22em] font-semibold text-(--color-brand-600)">
                Why StockSense
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-(--color-fg) sm:text-[44px] sm:leading-[1.06]">
                A full research desk,
                <br />
                minus the desk.
              </h2>
              <div className="mt-10 space-y-1">
                {FEATURES.map((f, i) => (
                  <div
                    key={f.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300",
                      active === i
                        ? "border border-(--color-border) bg-(--color-surface) shadow-(--shadow-sm)"
                        : "opacity-45",
                    )}
                  >
                    <f.icon
                      className={cn("h-4.5 w-4.5", active === i ? "text-(--color-brand-700)" : "text-(--color-fg-subtle)")}
                    />
                    <span className="text-[14.5px] font-semibold tracking-tight text-(--color-fg)">
                      {f.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Panels */}
          <div className="space-y-24 lg:space-y-40">
            <div className="lg:hidden">
              <p className="text-[11px] uppercase tracking-[0.22em] font-semibold text-(--color-brand-600)">
                Why StockSense
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-(--color-fg)">
                A full research desk, minus the desk.
              </h2>
            </div>
            {FEATURES.map((f, i) => (
              <FeaturePanel key={f.id} feature={f} index={i} onActive={onActive} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturePanel({
  feature,
  index,
  onActive,
}: {
  feature: (typeof FEATURES)[number];
  index: number;
  onActive: (i: number) => void;
}) {
  const centerRef = useInCenter<HTMLDivElement>(() => onActive(index));
  const { ref, shown } = useReveal<HTMLDivElement>();
  const { Visual } = feature;

  return (
    <div ref={centerRef}>
      <div ref={ref} className={cn("reveal", shown && "reveal-shown")}>
        <p className="text-[11.5px] uppercase tracking-[0.18em] font-semibold text-(--color-fg-subtle)">
          {feature.eyebrow}
        </p>
        <h3 className="mt-2.5 text-[26px] font-semibold tracking-[-0.02em] text-(--color-fg) sm:text-[30px]">
          {feature.title}
        </h3>
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-(--color-fg-muted)">{feature.body}</p>
        <div className="mt-8">
          <Visual />
        </div>
      </div>
    </div>
  );
}

/* --- Mini product visuals ------------------------------------------------ */

function Frame({ children, shown, innerRef }: { children: React.ReactNode; shown?: boolean; innerRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={innerRef}
      className={cn(shown !== undefined && "reveal", shown && "reveal-shown")}
      style={{ perspective: "1100px" }}
    >
      <SpotlightCard className="overflow-hidden rounded-3xl border border-(--color-border) bg-(--color-surface) p-6 shadow-(--shadow-lg)">
        {children}
      </SpotlightCard>
    </div>
  );
}

function DataVisual() {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const bars = [34, 58, 42, 71, 52, 88, 64, 96, 78, 60, 84, 100];
  return (
    <Frame innerRef={ref} shown={shown}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13.5px] font-semibold tracking-tight">RELIANCE · NSE</p>
          <p className="text-[11.5px] text-(--color-fg-subtle)">Reliance Industries</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-(--color-up-soft) px-2 py-0.5 text-[11px] font-semibold text-(--color-up)">
          <TrendingUp className="h-3 w-3" /> +1.24%
        </span>
      </div>
      <div className="mt-5 flex h-28 items-end gap-1.5">
        {bars.map((h, i) => (
          <div
            key={i}
            className={cn("grow-transition flex-1 rounded-t-md", i % 3 === 0 ? "bg-(--color-brand-200)" : "bg-(--color-brand-600)")}
            style={{ height: shown ? `${h}%` : "0%", "--grow-delay": `${i * 50}ms` } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-(--color-border) pt-3 text-[11.5px] text-(--color-fg-subtle)">
        <span>09:15</span><span>11:30</span><span>13:45</span><span>15:30 IST</span>
      </div>
    </Frame>
  );
}

function AiVisual() {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <Frame innerRef={ref} shown={shown}>
      <div className="flex justify-end">
        <div className="rounded-2xl rounded-tr-md bg-(--color-brand-700) px-4 py-2.5 text-[13px] text-white">
          Compare HDFC Bank and ICICI Bank
        </div>
      </div>
      <div className="mt-3 flex gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-(--color-brand-50) text-(--color-brand-700)">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="space-y-2">
          <div
            className={cn("reveal rounded-2xl rounded-tl-md border border-(--color-border) bg-(--color-surface-2)/70 px-4 py-2.5 text-[13px] leading-relaxed text-(--color-fg)", shown && "reveal-shown")}
            style={{ "--reveal-delay": "250ms" } as React.CSSProperties}
          >
            Both trade near ₹1,000–1,700 with similar deposit growth. ICICI's ROE is trending higher; HDFC is cheaper on price-to-book…
          </div>
          <div
            className={cn("reveal flex items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2", shown && "reveal-shown")}
            style={{ "--reveal-delay": "480ms" } as React.CSSProperties}
          >
            <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-(--color-fg-subtle)">Confidence</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--color-surface-2)">
              <div
                className="grow-transition h-full rounded-full bg-gradient-to-r from-(--color-brand-300) to-(--color-brand-600)"
                style={{ width: shown ? "84%" : "0%", "--grow-delay": "650ms" } as React.CSSProperties}
              />
            </div>
            <span className="text-[12px] font-semibold tabular">84%</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function CompareVisual() {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const rows = [
    { label: "Valuation (P/E)", a: 62, b: 38 },
    { label: "Dividend yield", a: 44, b: 56 },
    { label: "52-week position", a: 58, b: 42 },
  ];
  return (
    <Frame innerRef={ref} shown={shown}>
      <div className="flex items-center justify-between">
        <p className="text-[13.5px] font-semibold tracking-tight">
          HDFCBANK <span className="font-medium text-(--color-fg-subtle)">vs</span> ICICIBANK
        </p>
        <span className="inline-flex items-center gap-1 rounded-full bg-(--color-brand-50) px-2 py-0.5 text-[11px] font-semibold text-(--color-brand-700)">
          <Scale className="h-3 w-3" /> Compare
        </span>
      </div>
      <div className="mt-5 space-y-3.5">
        {rows.map((r, i) => (
          <div key={r.label}>
            <p className="text-[11px] font-medium text-(--color-fg-subtle)">{r.label}</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <div className="flex flex-1 justify-end overflow-hidden rounded-full bg-(--color-surface-2)">
                <div
                  className="grow-transition h-2 rounded-full bg-(--color-brand-600)"
                  style={{ width: shown ? `${r.a}%` : "0%", "--grow-delay": `${250 + i * 130}ms` } as React.CSSProperties}
                />
              </div>
              <div className="flex flex-1 overflow-hidden rounded-full bg-(--color-surface-2)">
                <div
                  className="grow-transition h-2 rounded-full bg-[#b27a00]"
                  style={{ width: shown ? `${r.b}%` : "0%", "--grow-delay": `${250 + i * 130}ms` } as React.CSSProperties}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        className={cn(
          "reveal mt-4 flex items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-surface-2)/60 px-3 py-2",
          shown && "reveal-shown",
        )}
        style={{ "--reveal-delay": "650ms" } as React.CSSProperties}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-(--color-brand-700)" />
        <span className="text-[12.5px] text-(--color-fg)">
          AI verdict: <span className="font-semibold">leans HDFCBANK</span> on valuation and stability
        </span>
      </div>
    </Frame>
  );
}

function PortfolioVisual() {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const rows = [
    { sym: "HDFCBANK", pnl: "+₹4,820", up: true, w: "72%" },
    { sym: "INFY", pnl: "+₹2,140", up: true, w: "54%" },
    { sym: "TATAMOTORS", pnl: "-₹1,080", up: false, w: "38%" },
  ];
  return (
    <Frame innerRef={ref} shown={shown}>
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-semibold text-(--color-fg-subtle)">My holdings</p>
        <p className="text-[22px] font-semibold tabular tracking-tight">₹5,12,484</p>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((r, i) => (
          <div key={r.sym} className="flex items-center gap-3">
            <span className="w-24 text-[12.5px] font-semibold tracking-tight">{r.sym}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-(--color-surface-2)">
              <div
                className={cn("grow-transition h-full rounded-full", r.up ? "bg-(--color-brand-500)" : "bg-(--color-down)/70")}
                style={{ width: shown ? r.w : "0%", "--grow-delay": `${300 + i * 140}ms` } as React.CSSProperties}
              />
            </div>
            <span className={cn("w-16 text-right text-[12px] font-semibold tabular", r.up ? "text-(--color-up)" : "text-(--color-down)")}>
              {r.pnl}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function NewsVisual() {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const items = [
    { t: "RBI holds repo rate; bond yields ease 6 bps", s: "Positive", up: true },
    { t: "IT majors brace for softer US discretionary spend", s: "Negative", up: false },
  ];
  return (
    <Frame innerRef={ref} shown={shown}>
      <div className="space-y-3">
        {items.map((n, i) => (
          <div
            key={n.t}
            className={cn("reveal rounded-2xl border border-(--color-border) bg-(--color-surface-2)/60 p-4", shown && "reveal-shown")}
            style={{ "--reveal-delay": `${200 + i * 160}ms` } as React.CSSProperties}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[13.5px] font-semibold leading-snug tracking-tight">{n.t}</p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                  n.up ? "bg-(--color-up-soft) text-(--color-up)" : "bg-(--color-down-soft) text-(--color-down)",
                )}
              >
                {n.s}
              </span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-(--color-brand-700)">
              <Sparkles className="h-3 w-3" /> AI: why it matters
              <ArrowUpRight className="h-3 w-3" />
            </p>
          </div>
        ))}
      </div>
    </Frame>
  );
}
