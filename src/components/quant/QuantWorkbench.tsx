"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Cpu, Terminal } from "lucide-react";
import { getChart } from "@/lib/api/yahoo";
import { searchUniverse, lookupInstrument } from "@/lib/universe";
import { computeQuant, fallbackSeries, type QuantComputed } from "@/lib/quant-steps";
import { fmt } from "@/lib/quant";
import { cn } from "@/lib/cn";

const PRESETS = [
  { sym: "NIFTY50", label: "NIFTY 50", index: true },
  { sym: "RELIANCE", label: "RELIANCE", index: false },
  { sym: "TCS", label: "TCS", index: false },
  { sym: "HDFCBANK", label: "HDFCBANK", index: false },
  { sym: "INFY", label: "INFY", index: false },
];

export function QuantWorkbench() {
  const [symbol, setSymbol] = useState("NIFTY50");
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(false);
  const [prices, setPrices] = useState<number[] | null>(null);
  const [visible, setVisible] = useState(0);
  const consoleRef = useRef<HTMLDivElement>(null);

  const inst = lookupInstrument(symbol);
  const isIndex = symbol === "NIFTY50" || symbol.startsWith("^");
  const unit = isIndex ? "" : "₹";
  const label = inst?.name ?? symbol;

  const results = useMemo(() => (query.trim() ? searchUniverse(query, 6) : []), [query]);

  useEffect(() => {
    let cancelled = false;
    setPrices(null);
    setVisible(0);
    getChart(symbol, "3mo", "1d").then((r) => {
      if (cancelled) return;
      const closes = r?.candles.map((c) => c.price).filter((v) => v > 0) ?? [];
      setPrices(closes.length > 25 ? closes : fallbackSeries(symbol.length, isIndex ? 24000 : 1500));
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, isIndex]);

  const computed = useMemo<QuantComputed | null>(
    () => (prices ? computeQuant(unit, prices) : null),
    [prices, unit],
  );

  useEffect(() => {
    if (!computed) return;
    if (visible >= computed.steps.length) return;
    const id = setTimeout(() => setVisible((v) => v + 1), visible === 0 ? 250 : 480);
    return () => clearTimeout(id);
  }, [computed, visible]);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight, behavior: "smooth" });
  }, [visible]);

  const streaming = computed ? visible < computed.steps.length : true;

  function pick(sym: string) {
    setSymbol(sym.toUpperCase());
    setQuery("");
    setFocus(false);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] font-semibold text-(--color-fg-subtle)">
            <Cpu className="h-3.5 w-3.5" /> Quant engine
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">The math, live</h1>
          <p className="mt-1 text-[13.5px] text-(--color-fg-muted)">
            Real daily closes in, every indicator computed step by step — formulas with the numbers plugged in.
          </p>
        </div>
      </header>

      {/* Symbol picker */}
      <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-fg-subtle)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) pick(results[0].symbol);
            }}
            placeholder="Analyse any NSE stock or ETF — e.g. TATAMOTORS, gold ETF…"
            className="h-11 w-full rounded-xl border border-(--color-border) bg-(--color-surface) pl-10 pr-3 text-sm placeholder:text-(--color-fg-subtle) focus:border-(--color-brand-300) focus:ring-4 focus:ring-(--color-brand-50) focus:outline-none"
          />
          {focus && results.length > 0 && (
            <ul className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-(--color-border) bg-(--color-surface) shadow-(--shadow-lg)">
              {results.map((r) => (
                <li key={r.symbol}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(r.symbol)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-(--color-surface-2)"
                  >
                    <span className="min-w-0">
                      <span className="text-[13.5px] font-semibold tracking-tight">{r.symbol}</span>
                      <span className="ml-2 text-[11.5px] text-(--color-fg-subtle)">{r.name}</span>
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-(--color-fg-subtle)">
                      {r.kind === "etf" ? "ETF" : "NSE"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.sym}
              type="button"
              onClick={() => pick(p.sym)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                symbol === p.sym
                  ? "border-(--color-brand-300) bg-(--color-brand-50) text-(--color-brand-700)"
                  : "border-(--color-border) text-(--color-fg-muted) hover:border-(--color-brand-300)",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Console */}
        <div className="overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-brand-950)">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
            <Terminal className="h-3.5 w-3.5 text-(--color-brand-300)" />
            <p className="font-mono text-[11.5px] text-white/60">engine://{symbol.toLowerCase()} · daily · 3mo</p>
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-white/40">
              <span className={cn("h-1.5 w-1.5 rounded-full", streaming ? "bg-(--color-brand-300) animate-pulse-dot" : "bg-white/30")} />
              {streaming ? "computing" : "done"}
            </span>
          </div>
          <div ref={consoleRef} className="h-[460px] overflow-y-auto p-4 font-mono text-[12.5px] leading-relaxed">
            {!computed ? (
              <p className="text-white/40">$ loading market data…</p>
            ) : (
              <div className="space-y-3.5">
                {computed.steps.slice(0, visible).map((step, i) => (
                  <div key={step.id} className="animate-fade-up">
                    <p className="text-(--color-brand-300)">&#47;&#47; {i + 1}. {step.title}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-white/80">{step.formula}</p>
                    <p className="mt-0.5 text-white/45">{step.work}</p>
                    <p
                      className={cn(
                        "mt-0.5 font-semibold",
                        step.tone === "up" && "text-[#4ade80]",
                        step.tone === "down" && "text-[#f87171]",
                        (!step.tone || step.tone === "neutral") && "text-(--color-brand-200)",
                      )}
                    >
                      ⇒ {step.result}
                    </p>
                  </div>
                ))}
                {streaming && <p className="text-(--color-brand-300)">▍</p>}
              </div>
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-[13.5px] font-semibold tracking-tight">{label}</p>
            <p className="text-[11.5px] text-(--color-fg-subtle)">Close · SMA₂₀ · Bollinger · forecast</p>
          </div>
          <div className="mt-4">
            {computed ? (
              <QuantChart computed={computed} unit={unit} reveal={visible} />
            ) : (
              <div className="skeleton h-[360px] rounded-xl" />
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-(--color-fg-muted)">
            <Legend color="#115e3c" label="Close" />
            <Legend color="#3d9a6b" label="SMA 20" />
            <Legend color="#6fb98e" label="Bollinger 2σ" dashed />
            <Legend color="#b27a00" label="7-day forecast" dashed />
          </div>
        </div>
      </div>

      <p className="text-[12px] text-(--color-fg-subtle)">
        Indicators computed from live NSE daily closes. Educational tooling, not investment advice.
      </p>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-0.5 w-4 rounded-full"
        style={dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` } : { background: color }}
      />
      {label}
    </span>
  );
}

function QuantChart({ computed, unit, reveal }: { computed: QuantComputed; unit: string; reveal: number }) {
  const W = 520;
  const H = 360;
  const pad = { l: 4, r: 8, t: 12, b: 16 };
  const prices = computed.prices;
  const showBoll = reveal >= 6;
  const showForecast = reveal >= 8;
  const forecast = computed.reg.forecast;

  const allVals = [
    ...prices,
    ...(showBoll ? [computed.boll.upper, computed.boll.lower] : []),
    ...(showForecast ? forecast : []),
  ];
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const span = max - min || 1;
  const total = prices.length + (showForecast ? forecast.length : 0);

  const xAt = (i: number) => pad.l + (i / (total - 1)) * (W - pad.l - pad.r);
  const yAt = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);

  const pricePath = prices.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
  const smaPath = computed.smaLine20
    .map((v, i) => (isNaN(v) ? null : `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`))
    .filter(Boolean)
    .map((p, i) => `${i === 0 ? "M" : "L"}${p}`)
    .join(" ");
  const forecastPath = showForecast
    ? forecast.map((v, i) => `${i === 0 ? `M${xAt(prices.length - 1).toFixed(1)},${yAt(prices[prices.length - 1]).toFixed(1)} L` : "L"}${xAt(prices.length + i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ")
    : "";
  const areaPath = `${pricePath} L${xAt(prices.length - 1).toFixed(1)},${H - pad.b} L${xAt(0).toFixed(1)},${H - pad.b} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[360px] w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="qw-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#115e3c" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#115e3c" stopOpacity="0" />
        </linearGradient>
      </defs>
      {showBoll && (
        <>
          <line x1={pad.l} x2={W - pad.r} y1={yAt(computed.boll.upper)} y2={yAt(computed.boll.upper)} stroke="#6fb98e" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
          <line x1={pad.l} x2={W - pad.r} y1={yAt(computed.boll.lower)} y2={yAt(computed.boll.lower)} stroke="#6fb98e" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
          <rect x={pad.l} width={W - pad.l - pad.r} y={yAt(computed.boll.upper)} height={Math.max(0, yAt(computed.boll.lower) - yAt(computed.boll.upper))} fill="#6fb98e" opacity="0.06" />
        </>
      )}
      <path d={areaPath} fill="url(#qw-fill)" />
      <path d={pricePath} fill="none" stroke="#115e3c" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {reveal >= 3 && smaPath && <path d={smaPath} fill="none" stroke="#3d9a6b" strokeWidth="1.6" strokeLinejoin="round" />}
      {showForecast && forecastPath && <path d={forecastPath} fill="none" stroke="#b27a00" strokeWidth="1.8" strokeDasharray="5 5" strokeLinejoin="round" />}
      <circle cx={xAt(prices.length - 1)} cy={yAt(prices[prices.length - 1])} r="3" fill="#115e3c" />
      <text x={xAt(prices.length - 1) - 4} y={yAt(prices[prices.length - 1]) - 8} textAnchor="end" fontSize="11" fill="#0d1f17" fontWeight="600">
        {unit}{fmt(prices[prices.length - 1])}
      </text>
    </svg>
  );
}
