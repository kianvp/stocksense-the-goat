"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { getSparkQuotes, type SparkQuote } from "@/lib/api/yahoo";
import { instrumentHref, lookupInstrument } from "@/lib/universe";
import { useScrollDriver } from "@/lib/use-section-progress";
import { useReveal, usePrefersReducedMotion } from "@/lib/use-reveal";
import { cn } from "@/lib/cn";

const SCREENS = [
  { sym: "NIFTY50", label: "NIFTY 50", sub: "NSE benchmark index", index: true },
  { sym: "SENSEX", label: "SENSEX", sub: "BSE benchmark index", index: true },
  { sym: "BANKNIFTY", label: "BANK NIFTY", sub: "Banking sector index", index: true },
  { sym: "RELIANCE", label: "RELIANCE", sub: "Reliance Industries", index: false },
  { sym: "HDFCBANK", label: "HDFCBANK", sub: "HDFC Bank", index: false },
  { sym: "TCS", label: "TCS", sub: "Tata Consultancy Services", index: false },
  { sym: "BHARTIARTL", label: "BHARTIARTL", sub: "Bharti Airtel", index: false },
  { sym: "ICICIBANK", label: "ICICIBANK", sub: "ICICI Bank", index: false },
  { sym: "INFY", label: "INFY", sub: "Infosys", index: false },
  { sym: "TATAMOTORS", label: "TATAMOTORS", sub: "Tata Motors", index: false },
  { sym: "SBIN", label: "SBIN", sub: "State Bank of India", index: false },
  { sym: "NIFTYBEES", label: "NIFTYBEES", sub: "Nifty 50 ETF", index: false },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function MarketPulse() {
  const sectionRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef(0);
  const reduced = usePrefersReducedMotion();

  const [quotes, setQuotes] = useState<Record<string, SparkQuote>>({});

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      const q = await getSparkQuotes(SCREENS.map((s) => s.sym));
      if (!cancelled && Object.keys(q).length > 0) setQuotes(q);
    }
    pull();
    const id = setInterval(pull, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useLayoutEffect(() => {
    function measure() {
      const track = trackRef.current;
      const viewport = viewportRef.current;
      if (!track || !viewport) return;
      shiftRef.current = Math.max(0, track.scrollWidth - viewport.clientWidth);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const onFrame = useCallback((p: number) => {
    const t = clamp01((p - 0.08) / 0.87);
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${(-t * shiftRef.current).toFixed(1)}px, 0, 0)`;
    }
    if (lineRef.current) lineRef.current.style.transform = `scaleX(${t.toFixed(4)})`;
    if (headerRef.current) {
      const opacity = p < 0.06 ? p / 0.06 : p > 0.9 ? 1 - ((p - 0.9) / 0.1) * 0.6 : 1;
      headerRef.current.style.opacity = clamp01(opacity).toFixed(3);
    }
  }, []);

  useScrollDriver(sectionRef, "pin", onFrame, 0.14);

  return (
    <section ref={sectionRef} className="relative" style={{ height: reduced ? "auto" : "340vh" }}>
      <div
        ref={viewportRef}
        className={reduced ? "py-20" : "sticky top-0 flex h-screen flex-col justify-center overflow-hidden"}
      >
        <div ref={headerRef} className="mx-auto w-full max-w-7xl px-5" style={{ willChange: "opacity" }}>
          <p className="text-[11px] uppercase tracking-[0.22em] font-semibold text-(--color-brand-300)">
            Live screens
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
            Glide through the market.
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/60">
            Indices, large caps and ETFs — every screen live from the exchange. Keep scrolling.
          </p>
        </div>

        <div className="mt-10 w-full">
          <div
            ref={trackRef}
            style={{ willChange: "transform" }}
            className={
              reduced
                ? "flex gap-5 overflow-x-auto px-5 pb-4"
                : "flex w-max gap-5 pl-[max(1.25rem,calc((100vw-80rem)/2+1.25rem))] pr-10"
            }
          >
            {SCREENS.map((s, i) => (
              <StockScreen key={s.sym} screen={s} quote={quotes[s.sym]} order={i} />
            ))}
            <EndCard />
          </div>
        </div>

        {/* Progress line */}
        {!reduced && (
          <div className="mx-auto mt-12 w-full max-w-7xl px-5">
            <div className="h-px w-full bg-white/10">
              <div ref={lineRef} className="h-px origin-left bg-(--color-brand-300)" style={{ transform: "scaleX(0)" }} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function StockScreen({
  screen,
  quote,
  order,
}: {
  screen: (typeof SCREENS)[number];
  quote?: SparkQuote;
  order: number;
}) {
  const { ref, shown } = useReveal<HTMLDivElement>("0px 240px 0px 240px");
  const up = (quote?.changePct ?? 0) >= 0;
  const accent = up ? "#4ade80" : "#f87171";
  const href = screen.index ? "/market" : instrumentHref(screen.sym);
  const kind = screen.index ? "INDEX" : lookupInstrument(screen.sym)?.kind === "etf" ? "ETF" : "EQUITY";

  return (
    <Link href={href} className="group block shrink-0">
      <div
        ref={ref}
        className={cn(
          "reveal relative w-[min(400px,82vw)] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm transition-colors duration-300 group-hover:border-white/25 group-hover:bg-white/[0.07]",
          shown && "reveal-shown",
        )}
        style={{ "--reveal-delay": `${Math.min(order * 45, 320)}ms` } as React.CSSProperties}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-semibold tracking-tight text-white">{screen.label}</p>
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[9.5px] font-semibold tracking-[0.12em] text-white/50">
                {kind}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-white/50">{screen.sub}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-2 py-1 text-[10px] font-semibold text-white/70">
            <span className="h-1.5 w-1.5 rounded-full animate-pulse-dot" style={{ background: accent }} />
            LIVE
          </span>
        </div>

        <div className="mt-5 flex items-baseline gap-3">
          {quote ? (
            <>
              <p className="text-[30px] font-semibold tabular tracking-tight text-white">
                {screen.index ? "" : "₹"}
                {quote.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="inline-flex items-center gap-0.5 text-[13px] font-semibold tabular" style={{ color: accent }}>
                {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {up ? "+" : ""}
                {quote.changePct.toFixed(2)}%
              </span>
            </>
          ) : (
            <div className="h-9 w-40 rounded-lg bg-white/8" />
          )}
        </div>

        <div className="mt-4 h-[72px]">
          {quote && quote.spark.length > 1 ? (
            <Sparkline values={quote.spark} color={accent} />
          ) : (
            <div className="h-full w-full rounded-lg bg-white/5" />
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3.5">
          <MiniStat label="Prev close" value={quote ? quote.previousClose.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"} />
          <MiniStat label="Day low" value={quote?.dayLow ? quote.dayLow.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"} />
          <MiniStat label="Day high" value={quote?.dayHigh ? quote.dayHigh.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"} />
        </div>
      </div>
    </Link>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const W = 352;
  const H = 72;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const px = (i / (values.length - 1)) * W;
    const py = H - 6 - ((v - min) / span) * (H - 12);
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  });
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${W},${H} L0,${H} Z`;
  const gid = `mp-${color.replace("#", "")}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} className="spark-fill" />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
        className="spark-line"
      />
    </svg>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9.5px] uppercase tracking-[0.14em] text-white/40">{label}</p>
      <p className="mt-0.5 text-[12.5px] font-semibold tabular text-white/85">{value}</p>
    </div>
  );
}

function EndCard() {
  return (
    <Link href="/stocks" className="group block shrink-0">
      <div className="flex h-full w-[min(320px,75vw)] flex-col items-start justify-center rounded-3xl border border-dashed border-white/15 p-8 transition-colors group-hover:border-(--color-brand-300)/60">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-(--color-brand-300)/15 text-(--color-brand-300)">
          <Activity className="h-5 w-5" />
        </span>
        <p className="mt-5 text-[20px] font-semibold tracking-tight text-white">
          + 2,600 more instruments
        </p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/55">
          Every NSE stock and ETF, searchable with live prices.
        </p>
        <span className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-(--color-brand-300)">
          Browse all stocks <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </div>
    </Link>
  );
}
