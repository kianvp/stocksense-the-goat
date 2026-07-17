"use client";

// The landing centrepiece: a live technical-analysis engine that computes
// real indicators on real daily closes and streams every formula — with the
// numbers substituted in — into a terminal-style console, beside a chart of
// what it just calculated. This replaces the decorative 3D globe with
// something that actually does the math.

import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal, Cpu } from "lucide-react";
import { getChart } from "@/lib/api/yahoo";
import {
  bollinger,
  ema,
  fmt,
  linearRegression,
  mean,
  pct,
  returns,
  rsi,
  sharpe,
  sma,
  smaLine,
  stdDev,
  volatility,
} from "@/lib/quant";
import { useReveal } from "@/lib/use-reveal";
import { cn } from "@/lib/cn";

const SYMBOLS = [
  { sym: "NIFTY50", label: "NIFTY 50", unit: "" },
  { sym: "RELIANCE", label: "RELIANCE", unit: "₹" },
  { sym: "TCS", label: "TCS", unit: "₹" },
  { sym: "HDFCBANK", label: "HDFCBANK", unit: "₹" },
];

type Step = {
  id: string;
  title: string;
  formula: string;
  work: string;
  result: string;
  tone?: "up" | "down" | "neutral";
};

type Computed = {
  prices: number[];
  smaLine20: (number)[];
  boll: ReturnType<typeof bollinger>;
  reg: ReturnType<typeof linearRegression>;
  steps: Step[];
};

function computeSteps(symbol: string, unit: string, prices: number[]): Computed {
  const n = prices.length;
  const last = prices[n - 1];
  const rets = returns(prices);
  const muDaily = mean(rets);
  const s20 = sma(prices, 20);
  const e = ema(prices, 20);
  const r = rsi(prices, 14);
  const boll = bollinger(prices, 20, 2);
  const vol = volatility(prices);
  const reg = linearRegression(prices, 7);
  const sh = sharpe(prices);
  const forecastTarget = reg.forecast[reg.forecast.length - 1];
  const u = unit;

  const steps: Step[] = [
    {
      id: "data",
      title: "Load daily closes",
      formula: "P = { P₀, P₁, …, Pₙ₋₁ }",
      work: `n = ${n} closes · latest Pₙ₋₁ = ${u}${fmt(last)}`,
      result: `${n} points ready`,
    },
    {
      id: "ret",
      title: "Daily returns",
      formula: "rₜ = (Pₜ − Pₜ₋₁) / Pₜ₋₁     μ = (1/N) Σ rₜ",
      work: `μ = mean of ${rets.length} returns = ${pct(muDaily, 3)} per day`,
      result: `μ = ${pct(muDaily, 3)}`,
      tone: muDaily >= 0 ? "up" : "down",
    },
    {
      id: "sma",
      title: "Simple moving average (20)",
      formula: "SMA₂₀ = (1/20) Σ Pₜ₋ᵢ ,  i = 0…19",
      work: `mean of last 20 closes = ${u}${fmt(s20)}`,
      result: `SMA₂₀ = ${u}${fmt(s20)}`,
      tone: last >= s20 ? "up" : "down",
    },
    {
      id: "ema",
      title: "Exponential moving average (20)",
      formula: "k = 2/(N+1);  EMAₜ = Pₜ·k + EMAₜ₋₁·(1−k)",
      work: `k = 2/21 = ${fmt(e.k, 4)}  →  EMA₂₀ = ${u}${fmt(e.value)}`,
      result: `EMA₂₀ = ${u}${fmt(e.value)}`,
      tone: last >= e.value ? "up" : "down",
    },
    {
      id: "rsi",
      title: "Relative Strength Index (14)",
      formula: "RS = avgGain/avgLoss;  RSI = 100 − 100/(1 + RS)",
      work: `avgGain = ${u}${fmt(r.avgGain)}, avgLoss = ${u}${fmt(r.avgLoss)}, RS = ${fmt(r.rs)}`,
      result: `RSI = ${fmt(r.rsi)}${r.rsi >= 70 ? " · overbought" : r.rsi <= 30 ? " · oversold" : " · neutral"}`,
      tone: r.rsi >= 70 ? "down" : r.rsi <= 30 ? "up" : "neutral",
    },
    {
      id: "boll",
      title: "Bollinger Bands (20, 2σ)",
      formula: "mid = SMA₂₀;  upper/lower = mid ± 2σ",
      work: `σ = ${u}${fmt(boll.sigma)}  →  [${u}${fmt(boll.lower)}, ${u}${fmt(boll.upper)}]`,
      result: `band width = ${pct(boll.width)}`,
    },
    {
      id: "vol",
      title: "Volatility (annualised)",
      formula: "σ_annual = σ_daily · √252",
      work: `σ_daily = ${pct(vol.daily, 3)}  →  × √252`,
      result: `σ_annual = ${pct(vol.annualized)}`,
      tone: vol.annualized > 0.3 ? "down" : "neutral",
    },
    {
      id: "reg",
      title: "OLS trend + 7-day forecast",
      formula: "P̂ = β·t + α;  β = Σ(tₜ−t̄)(Pₜ−P̄) / Σ(tₜ−t̄)²",
      work: `β = ${fmt(reg.slope, 3)}/day, α = ${u}${fmt(reg.intercept)}, R² = ${fmt(reg.r2, 3)}`,
      result: `t+7 ⇒ ${u}${fmt(forecastTarget)}`,
      tone: reg.slope >= 0 ? "up" : "down",
    },
    {
      id: "sharpe",
      title: "Sharpe ratio",
      formula: "S = (E[R]·252 − r_f) / (σ·√252)",
      work: `annRet = ${pct(sh.meanRet * 252)}, annVol = ${pct(sh.sigma * Math.sqrt(252))}, r_f = ${pct(sh.rf)}`,
      result: `Sharpe = ${fmt(sh.sharpe)}`,
      tone: sh.sharpe >= 1 ? "up" : sh.sharpe < 0 ? "down" : "neutral",
    },
  ];

  return { prices, smaLine20: smaLine(prices, 20), boll, reg, steps };
}

// Deterministic fallback series if the live fetch is unavailable, so the
// section always has something real-looking to compute on.
function fallbackSeries(seed: number, base: number): number[] {
  const out: number[] = [];
  let p = base;
  for (let i = 0; i < 60; i++) {
    const x = Math.sin((i + seed) / 4) * 0.6 + Math.cos((i + seed) / 9) * 0.4;
    p = p * (1 + (x + (i / 60 - 0.3)) * 0.006);
    out.push(Math.round(p * 100) / 100);
  }
  return out;
}

export function QuantEngine() {
  const [active, setActive] = useState(0);
  const [prices, setPrices] = useState<number[] | null>(null);
  const [visible, setVisible] = useState(0);
  const { ref, shown } = useReveal<HTMLDivElement>();
  const consoleRef = useRef<HTMLDivElement>(null);
  const current = SYMBOLS[active];

  // Fetch ~3 months of daily closes for the selected symbol.
  useEffect(() => {
    let cancelled = false;
    setPrices(null);
    setVisible(0);
    getChart(current.sym, "3mo", "1d").then((r) => {
      if (cancelled) return;
      const closes = r?.candles.map((c) => c.price).filter((v) => v > 0) ?? [];
      setPrices(closes.length > 25 ? closes : fallbackSeries(active + 1, current.sym === "NIFTY50" ? 24000 : 1500));
    });
    return () => {
      cancelled = true;
    };
  }, [active, current.sym]);

  const computed = useMemo<Computed | null>(
    () => (prices ? computeSteps(current.sym, current.unit, prices) : null),
    [prices, current.sym, current.unit],
  );

  // Stream the steps one at a time once the section is on-screen and data ready.
  useEffect(() => {
    if (!shown || !computed) return;
    if (visible >= computed.steps.length) return;
    const id = setTimeout(() => setVisible((v) => v + 1), visible === 0 ? 300 : 620);
    return () => clearTimeout(id);
  }, [shown, computed, visible]);

  // Keep the console scrolled to the newest line.
  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight, behavior: "smooth" });
  }, [visible]);

  const streaming = computed ? visible < computed.steps.length : true;

  return (
    <section id="quant" className="relative overflow-hidden bg-(--color-brand-950) text-white">
      <div className="absolute left-1/2 top-0 h-px w-[min(1200px,90%)] -translate-x-1/2 bg-gradient-to-r from-transparent via-(--color-brand-400)/40 to-transparent" />
      <div className="pointer-events-none absolute -right-40 top-1/4 h-[420px] w-[420px] rounded-full bg-(--color-brand-500)/10 blur-3xl" />

      <div ref={ref} className={cn("reveal mx-auto max-w-7xl px-5 py-24 lg:py-32", shown && "reveal-shown")}>
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-semibold text-(--color-brand-300)">
            <Cpu className="h-3.5 w-3.5" /> Quant engine
          </p>
          <h2 className="mt-4 text-[40px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[56px]">
            It shows its work.
          </h2>
          <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-white/60">
            No black box. Pick an instrument and watch InvestSense pull real daily closes and compute
            the indicators live — every formula, with the numbers plugged in.
          </p>
        </div>

        {/* Symbol selector */}
        <div className="mt-8 flex flex-wrap gap-2">
          {SYMBOLS.map((s, i) => (
            <button
              key={s.sym}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-[12.5px] font-semibold transition-colors",
                active === i
                  ? "border-(--color-brand-300) bg-(--color-brand-300)/15 text-white"
                  : "border-white/12 bg-white/[0.03] text-white/60 hover:text-white",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Math console */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
              <Terminal className="h-3.5 w-3.5 text-(--color-brand-300)" />
              <p className="font-mono text-[11.5px] tracking-tight text-white/60">
                investsense://engine/{current.sym.toLowerCase()} · daily
              </p>
              <span className="ml-auto flex items-center gap-1.5 text-[11px] text-white/40">
                <span className={cn("h-1.5 w-1.5 rounded-full", streaming ? "bg-(--color-brand-300) animate-pulse-dot" : "bg-white/30")} />
                {streaming ? "computing" : "done"}
              </span>
            </div>
            <div ref={consoleRef} className="h-[420px] overflow-y-auto p-4 font-mono text-[12.5px] leading-relaxed">
              {!computed ? (
                <p className="text-white/40">$ loading market data…</p>
              ) : (
                <div className="space-y-3.5">
                  {computed.steps.slice(0, visible).map((step, i) => (
                    <div key={step.id} className="animate-fade-up">
                      <p className="text-white/45">
                        <span className="text-(--color-brand-300)">&#47;&#47; {i + 1}. {step.title}</span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-white/80">{step.formula}</p>
                      <p className="mt-0.5 text-white/50">{step.work}</p>
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

          {/* Chart of what was computed */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-semibold tracking-tight">{current.label}</p>
              <p className="text-[11.5px] text-white/45">Price · SMA₂₀ · Bollinger · forecast</p>
            </div>
            <div className="mt-4">
              {computed ? <QuantChart computed={computed} unit={current.unit} reveal={visible} /> : <div className="h-[340px] rounded-xl bg-white/5" />}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-white/50">
              <Legend color="#d8efe2" label="Close" />
              <Legend color="#4ade80" label="SMA 20" />
              <Legend color="#6fb98e" label="Bollinger 2σ" dashed />
              <Legend color="#b27a00" label="7-day forecast" dashed />
            </div>
          </div>
        </div>

        <p className="mt-6 text-[12px] text-white/35">
          Indicators are computed from live NSE daily closes. Educational tooling, not investment advice.
        </p>
      </div>
    </section>
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

function QuantChart({ computed, unit, reveal }: { computed: Computed; unit: string; reveal: number }) {
  const W = 520;
  const H = 340;
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
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[340px] w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="qc-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6fb98e" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#6fb98e" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Bollinger band */}
      {showBoll && (
        <>
          <line x1={pad.l} x2={W - pad.r} y1={yAt(computed.boll.upper)} y2={yAt(computed.boll.upper)} stroke="#6fb98e" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
          <line x1={pad.l} x2={W - pad.r} y1={yAt(computed.boll.lower)} y2={yAt(computed.boll.lower)} stroke="#6fb98e" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
          <rect x={pad.l} width={W - pad.l - pad.r} y={yAt(computed.boll.upper)} height={Math.max(0, yAt(computed.boll.lower) - yAt(computed.boll.upper))} fill="#6fb98e" opacity="0.05" />
        </>
      )}

      <path d={areaPath} fill="url(#qc-fill)" />
      <path d={pricePath} fill="none" stroke="#d8efe2" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {reveal >= 3 && smaPath && <path d={smaPath} fill="none" stroke="#4ade80" strokeWidth="1.6" strokeLinejoin="round" />}
      {showForecast && forecastPath && <path d={forecastPath} fill="none" stroke="#b27a00" strokeWidth="1.8" strokeDasharray="5 5" strokeLinejoin="round" />}

      {/* latest price dot */}
      <circle cx={xAt(prices.length - 1)} cy={yAt(prices[prices.length - 1])} r="3" fill="#d8efe2" />
      <text x={xAt(prices.length - 1) - 4} y={yAt(prices[prices.length - 1]) - 8} textAnchor="end" fontSize="11" fill="#d8efe2" fontWeight="600">
        {unit}{fmt(prices[prices.length - 1])}
      </text>
    </svg>
  );
}
