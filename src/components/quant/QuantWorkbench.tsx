"use client";

// The Quant Engine pipeline:
//   Market data → Indicator engine → Forecast engine → AI analysis
// Every stage computes on real NSE daily closes and shows its math — formulas,
// fitted parameters, and the arithmetic behind the bull/bear score.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Cpu,
  Database,
  LineChart,
  TrendingUp,
  Sparkles,
  Check,
  Gauge,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { getChart, type Candle } from "@/lib/api/yahoo";
import { searchUniverse, lookupInstrument } from "@/lib/universe";
import {
  fmt,
  pct,
  smaLine,
  ema,
  rsi as rsiCalc,
  stdDev,
  linearRegression,
  volatility,
  macd as macdCalc,
  atr as atrCalc,
  supportResistance,
  detectPatterns,
  type Ohlc,
} from "@/lib/quant";
import { ensembleForecast, type EnsembleForecast } from "@/lib/forecast";
import { bullBearScore, type BullBearScore } from "@/lib/signals";
import { generateJson, hasGeminiKey } from "@/lib/api/gemini";
import { useCountUp } from "@/lib/use-reveal";
import { fallbackSeries } from "@/lib/quant-steps";
import { cn } from "@/lib/cn";

const PRESETS = ["NIFTY50", "RELIANCE", "TCS", "HDFCBANK", "INFY"];
const RANGES = [
  { id: "3M", range: "3mo" as const },
  { id: "6M", range: "6mo" as const },
  { id: "1Y", range: "1y" as const },
];

const STAGES = [
  { id: 1, label: "Market data", icon: Database },
  { id: 2, label: "Indicator engine", icon: LineChart },
  { id: 3, label: "Forecast engine", icon: TrendingUp },
  { id: 4, label: "AI analysis", icon: Sparkles },
];

type AiTake = { summary: string; risk: string; drivers: string[] };

type Computed = {
  prices: number[];
  bars: Ohlc[];
  sma20: number[];
  sma50: number[];
  ema20: number[];
  bandUpper: number[];
  bandLower: number[];
  rsi: ReturnType<typeof rsiCalc>;
  macd: ReturnType<typeof macdCalc>;
  atr: ReturnType<typeof atrCalc>;
  levels: ReturnType<typeof supportResistance>;
  patterns: ReturnType<typeof detectPatterns>;
  vol: ReturnType<typeof volatility>;
  reg: ReturnType<typeof linearRegression>;
  forecast: EnsembleForecast;
  score: BullBearScore;
};

function computeAll(prices: number[], candles: Candle[]): Computed {
  const sma20 = smaLine(prices, 20);
  const sma50 = smaLine(prices, 50);
  const ema20 = ema(prices, 20).line;
  // Rolling 2σ Bollinger band series
  const bandUpper: number[] = [];
  const bandLower: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i + 1 < 20) {
      bandUpper.push(NaN);
      bandLower.push(NaN);
    } else {
      const win = prices.slice(i - 19, i + 1);
      const sigma = stdDev(win, false);
      bandUpper.push(sma20[i] + 2 * sigma);
      bandLower.push(sma20[i] - 2 * sigma);
    }
  }
  const bars: Ohlc[] = candles
    .filter((c) => c.high != null && c.low != null)
    .map((c) => ({ high: c.high!, low: c.low!, close: c.price }));
  const r = rsiCalc(prices, 14);
  const m = macdCalc(prices);
  const a = bars.length > 15 ? atrCalc(bars, 14) : null;
  const levels = bars.length > 10 ? supportResistance(bars) : null;
  const patterns = detectPatterns(prices);
  const vol = volatility(prices);
  const reg = linearRegression(prices, 7);
  const forecast = ensembleForecast(prices, 7);
  const last = prices[prices.length - 1];
  const bu = bandUpper[bandUpper.length - 1];
  const bl = bandLower[bandLower.length - 1];
  const bollPos = isNaN(bu) || bu === bl ? 0.5 : Math.min(1, Math.max(0, (last - bl) / (bu - bl)));
  const score = bullBearScore({
    prices,
    rsi: r.rsi,
    macd: m,
    slope: reg.slope,
    bollPos,
    atr: a,
    ensembleTarget: forecast.ensemble[forecast.ensemble.length - 1],
  });
  return { prices, bars, sma20, sma50, ema20, bandUpper, bandLower, rsi: r, macd: m, atr: a, levels, patterns, vol, reg, forecast, score };
}

export function QuantWorkbench() {
  const [symbol, setSymbol] = useState("NIFTY50");
  const [rangeId, setRangeId] = useState("6M");
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(false);
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [stage, setStage] = useState(0);
  const [ai, setAi] = useState<AiTake | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "done" | "off">("idle");

  const inst = lookupInstrument(symbol);
  const isIndex = symbol === "NIFTY50" || symbol.startsWith("^");
  const unit = isIndex ? "" : "₹";
  const label = inst?.name ?? (symbol === "NIFTY50" ? "NIFTY 50" : symbol);
  const results = useMemo(() => (query.trim() ? searchUniverse(query, 6) : []), [query]);

  // Stage 1: fetch data
  useEffect(() => {
    let cancelled = false;
    setCandles(null);
    setStage(0);
    setAi(null);
    setAiState("idle");
    const r = RANGES.find((x) => x.id === rangeId) ?? RANGES[1];
    getChart(symbol, r.range, "1d").then((res) => {
      if (cancelled) return;
      const list = res?.candles.filter((c) => c.price > 0) ?? [];
      if (list.length > 30) {
        setCandles(list);
      } else {
        const prices = fallbackSeries(symbol.length, isIndex ? 24000 : 1500);
        setCandles(prices.map((p, i) => ({ time: i, price: p })));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, rangeId, isIndex]);

  const computed = useMemo<Computed | null>(() => {
    if (!candles) return null;
    return computeAll(candles.map((c) => c.price), candles);
  }, [candles]);

  // Advance pipeline stages with a beat between each
  useEffect(() => {
    if (!computed) return;
    setStage(1);
    const t2 = setTimeout(() => setStage(2), 550);
    const t3 = setTimeout(() => setStage(3), 1150);
    const t4 = setTimeout(() => setStage(4), 1750);
    return () => {
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [computed]);

  // Stage 4: AI plain-English take
  useEffect(() => {
    if (!computed || stage < 4 || aiState !== "idle") return;
    if (!hasGeminiKey()) {
      setAiState("off");
      return;
    }
    setAiState("loading");
    const c = computed;
    const last = c.prices[c.prices.length - 1];
    const prompt = `You are a quant analyst. Given these computed indicators for ${label} (${symbol}, NSE):
close=${last.toFixed(2)}, RSI14=${c.rsi.rsi.toFixed(1)}, MACD_hist=${c.macd.lastHist.toFixed(2)},
SMA20=${c.sma20[c.sma20.length - 1]?.toFixed(2)}, trend_slope=${c.reg.slope.toFixed(3)}/bar, R2=${c.reg.r2.toFixed(2)},
annualised_vol=${(c.vol.annualized * 100).toFixed(1)}%, ATR%=${c.atr ? (c.atr.pct * 100).toFixed(2) : "n/a"},
7d_ensemble_forecast=${c.forecast.ensemble[6].toFixed(2)} (95% CI ${c.forecast.lower[6].toFixed(2)}–${c.forecast.upper[6].toFixed(2)}),
bull_bear_score=${c.score.score}/100 (${c.score.verdict}),
patterns=${c.patterns.filter((p) => p.detected).map((p) => p.name).join("; ") || "none"}.
Return JSON only: {"summary": "2-3 plain-English sentences a beginner understands, referencing the numbers", "risk": "1-2 sentences on the main risk", "drivers": ["3 short bullet drivers"]}. Educational tone, no buy/sell advice, INR context.`;
    generateJson<AiTake>([{ role: "user", parts: [{ text: prompt }] }], { temperature: 0.4 }).then((res) => {
      if (res?.summary) {
        setAi(res);
        setAiState("done");
      } else {
        setAiState("off");
      }
    });
  }, [computed, stage, aiState, label, symbol]);

  function pick(sym: string) {
    setSymbol(sym.toUpperCase());
    setQuery("");
    setFocus(false);
  }

  const last = computed ? computed.prices[computed.prices.length - 1] : 0;

  return (
    <div className="relative space-y-6">
      {/* Soft backdrop for the glass cards */}
      <div className="pointer-events-none absolute -inset-x-8 -top-8 -z-10 h-[520px] rounded-[48px] bg-[radial-gradient(80%_70%_at_20%_0%,color-mix(in_srgb,var(--color-brand-200)_35%,transparent)_0%,transparent_70%)]" />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] font-semibold text-(--color-fg-subtle)">
            <Cpu className="h-3.5 w-3.5" /> Quant engine
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">Pipeline: data → math → forecast → analysis</h1>
          <p className="mt-1 text-[13.5px] text-(--color-fg-muted)">
            Live NSE closes through an indicator engine, three forecast models with confidence intervals, and an AI read — every formula shown.
          </p>
        </div>
      </header>

      {/* Pipeline stages */}
      <div className="glass flex flex-wrap items-center gap-1 rounded-2xl p-2">
        {STAGES.map((s, i) => {
          const active = stage >= s.id;
          const Icon = s.icon;
          return (
            <div key={s.id} className="flex items-center">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold transition-all duration-500",
                  active ? "bg-(--color-brand-700) text-white shadow-(--shadow-sm)" : "text-(--color-fg-subtle)",
                )}
              >
                {active && stage === s.id ? (
                  <span className="h-3.5 w-3.5 animate-pulse-dot rounded-full bg-white/80" />
                ) : active ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                {s.label}
              </div>
              {i < STAGES.length - 1 && (
                <div className={cn("mx-1 h-px w-6 sm:w-10 transition-colors duration-500", stage > s.id ? "bg-(--color-brand-500)" : "bg-(--color-border)")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="glass rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-fg-subtle)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocus(true)}
              onBlur={() => setTimeout(() => setFocus(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) pick(results[0].symbol);
              }}
              placeholder="Run the pipeline on any NSE stock or ETF…"
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

          <div className="flex items-center gap-1 rounded-xl border border-(--color-border) bg-(--color-surface-2) p-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRangeId(r.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[12.5px] font-semibold",
                  rangeId === r.id ? "bg-(--color-surface) shadow-xs" : "text-(--color-fg-subtle) hover:text-(--color-fg-muted)",
                )}
              >
                {r.id}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => pick(p)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                  symbol === p
                    ? "border-(--color-brand-300) bg-(--color-brand-50) text-(--color-brand-700)"
                    : "border-(--color-border) text-(--color-fg-muted) hover:border-(--color-brand-300)",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Stage 1 line: data summary */}
        <p className="mt-3 font-mono text-[11.5px] text-(--color-fg-subtle)">
          {computed ? (
            <>
              <span className="text-(--color-brand-700)">data ✓</span> {computed.prices.length} daily closes · {label} · latest {unit}
              {fmt(last)} · source NSE via edge proxy · cache TTL 60s
            </>
          ) : (
            "loading daily closes…"
          )}
        </p>
      </div>

      {/* Stage 2: chart + indicators */}
      {computed && stage >= 2 && (
        <div className={cn("space-y-5 reveal reveal-shown")}>
          <div className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[14px] font-semibold tracking-tight">{label}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-(--color-fg-muted)">
                <Legend color="#115e3c" label="Close" />
                <Legend color="#3d9a6b" label="SMA 20" />
                <Legend color="#8a63d2" label="SMA 50" />
                <Legend color="#6fb98e" label="Bollinger 2σ" dashed />
                <Legend color="#b27a00" label="Ensemble forecast" dashed />
                <Legend color="#1d6fb8" label="Support/Resistance" dashed />
              </div>
            </div>
            <MainChart computed={computed} unit={unit} showForecast={stage >= 3} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <IndicatorCard title="RSI (14)" icon={<Gauge className="h-4 w-4" />} formula="RSI = 100 − 100/(1+RS), RS = avgGain/avgLoss">
              <RsiGauge value={computed.rsi.rsi} />
              <p className="mt-2 font-mono text-[11px] text-(--color-fg-subtle)">
                avgGain {fmt(computed.rsi.avgGain)} / avgLoss {fmt(computed.rsi.avgLoss)} → RS {fmt(computed.rsi.rs)}
              </p>
            </IndicatorCard>

            <IndicatorCard title="MACD (12, 26, 9)" icon={<LineChart className="h-4 w-4" />} formula="MACD = EMA₁₂ − EMA₂₆; signal = EMA₉(MACD)">
              <MacdMini macd={computed.macd} />
              <p className="mt-2 font-mono text-[11px] text-(--color-fg-subtle)">
                MACD {fmt(computed.macd.lastMacd)} · signal {fmt(computed.macd.lastSignal)} · hist{" "}
                <span className={computed.macd.lastHist >= 0 ? "text-(--color-up)" : "text-(--color-down)"}>{fmt(computed.macd.lastHist)}</span>
              </p>
            </IndicatorCard>

            <IndicatorCard title="ATR (14) · volatility" icon={<AlertTriangle className="h-4 w-4" />} formula="TR = max(H−L, |H−C₋₁|, |L−C₋₁|); Wilder-smoothed">
              {computed.atr ? (
                <>
                  <p className="text-[24px] font-semibold tabular tracking-tight">
                    {unit}
                    {fmt(computed.atr.atr)}
                  </p>
                  <p className="mt-1 text-[12.5px] text-(--color-fg-muted)">
                    {pct(computed.atr.pct)} of price per bar · annualised σ {pct(computed.vol.annualized)}
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-(--color-fg-muted)">Needs OHLC bars — unavailable for this series.</p>
              )}
            </IndicatorCard>

            <IndicatorCard title="Support / Resistance" icon={<Layers className="h-4 w-4" />} formula="Fractal swings ± pivot P=(H+L+C)/3">
              {computed.levels ? (
                <div className="space-y-1 font-mono text-[12px]">
                  {computed.levels.resistances.map((r, i) => (
                    <p key={`r${i}`} className="text-(--color-down)">
                      R{i + 1} {unit}
                      {fmt(r)}
                    </p>
                  ))}
                  <p className="text-(--color-fg-muted)">P&nbsp;&nbsp;{unit}{fmt(computed.levels.pivot.p)}</p>
                  {computed.levels.supports.map((s, i) => (
                    <p key={`s${i}`} className="text-(--color-up)">
                      S{i + 1} {unit}
                      {fmt(s)}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-(--color-fg-muted)">Not enough bars.</p>
              )}
            </IndicatorCard>
          </div>

          {/* Patterns */}
          <div className="glass rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-(--color-fg-subtle)">Pattern detection</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {computed.patterns.map((p) => (
                <span
                  key={p.id + p.name}
                  title={p.detail}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12px] font-medium",
                    p.detected && p.id !== "death"
                      ? "border-(--color-brand-300) bg-(--color-brand-50) text-(--color-brand-700)"
                      : p.detected && p.id === "death"
                        ? "border-(--color-down)/40 bg-(--color-down-soft) text-(--color-down)"
                        : "border-(--color-border) text-(--color-fg-subtle) line-through decoration-1 opacity-60",
                  )}
                >
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stage 3: forecast engine */}
      {computed && stage >= 3 && (
        <div className="glass rounded-2xl p-5 reveal reveal-shown">
          <div className="flex items-center justify-between">
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] font-semibold text-(--color-fg-subtle)">
              <TrendingUp className="h-3.5 w-3.5" /> Forecast engine · 7 bars ahead
            </p>
            <p className="font-mono text-[11.5px] text-(--color-fg-subtle)">CI(h) = 1.96·σ·P·√h · σ_daily = {pct(computed.forecast.sigmaDaily, 3)}</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {computed.forecast.models.map((m) => (
              <div key={m.id} className="rounded-xl border border-(--color-border) bg-(--color-surface)/70 p-4">
                <p className="text-[13px] font-semibold tracking-tight">{m.name}</p>
                <p className="text-[11px] text-(--color-fg-subtle)">{m.family}</p>
                <p className="mt-2 font-mono text-[11.5px] text-(--color-fg-muted)">{m.formula}</p>
                <p className="mt-1 font-mono text-[11px] text-(--color-fg-subtle)">{m.params}</p>
                <p className="mt-2.5 text-[15px] font-semibold tabular">
                  t+7 ⇒ {unit}
                  {fmt(m.target)}{" "}
                  <span className={cn("text-[11.5px]", m.target >= last ? "text-(--color-up)" : "text-(--color-down)")}>
                    ({m.target >= last ? "+" : ""}
                    {(((m.target - last) / last) * 100).toFixed(2)}%)
                  </span>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-(--color-brand-50)/70 p-4">
            <p className="text-[13.5px]">
              <span className="font-semibold">Ensemble (equal weight):</span> t+7 ⇒ {unit}
              {fmt(computed.forecast.ensemble[6])} · 95% CI [{unit}
              {fmt(computed.forecast.lower[6])} – {unit}
              {fmt(computed.forecast.upper[6])}]
            </p>
          </div>
        </div>
      )}

      {/* Stage 4: AI analysis */}
      {computed && stage >= 4 && (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] reveal reveal-shown">
          <div className="glass rounded-2xl p-5">
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] font-semibold text-(--color-fg-subtle)">
              <Gauge className="h-3.5 w-3.5" /> Bull / bear score
            </p>
            <ScoreMeter score={computed.score} />
            <div className="mt-4 space-y-1.5">
              {computed.score.components.map((c) => (
                <div key={c.label} className="flex items-baseline justify-between gap-3 border-b border-(--color-border)/60 pb-1.5 last:border-0">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium">{c.label}</p>
                    <p className="truncate font-mono text-[10.5px] text-(--color-fg-subtle)">{c.why}</p>
                  </div>
                  <p className="shrink-0 font-mono text-[12px] font-semibold tabular">
                    {c.points}/{c.max}
                  </p>
                </div>
              ))}
              <p className="pt-1 text-right font-mono text-[11.5px] text-(--color-fg-muted)">
                total {computed.score.totalPoints}/{computed.score.maxPoints} → {computed.score.score}/100
              </p>
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] font-semibold text-(--color-fg-subtle)">
              <Sparkles className="h-3.5 w-3.5" /> Plain-English analysis {aiState === "done" ? "· Gemini" : ""}
            </p>
            {aiState === "loading" && (
              <p className="mt-4 inline-flex items-center gap-2 text-[13.5px] text-(--color-fg-muted)">
                <span className="h-2 w-2 animate-pulse-dot rounded-full bg-(--color-brand-500)" /> Writing the analysis from the numbers above…
              </p>
            )}
            {aiState === "done" && ai && (
              <div className="mt-3 space-y-3">
                <p className="text-[14.5px] leading-relaxed">{ai.summary}</p>
                <div className="rounded-xl border border-(--color-warn)/25 bg-[color-mix(in_srgb,var(--color-warn)_7%,white)] p-3">
                  <p className="text-[12px] font-semibold text-(--color-warn)">Risk</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed">{ai.risk}</p>
                </div>
                {ai.drivers?.length > 0 && (
                  <ul className="space-y-1">
                    {ai.drivers.slice(0, 4).map((d, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-(--color-fg-muted)">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-brand-500)" />
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {aiState === "off" && (
              <p className="mt-4 text-[13.5px] leading-relaxed text-(--color-fg-muted)">
                {computed.score.verdict} setup: score {computed.score.score}/100. RSI at {fmt(computed.rsi.rsi, 1)}, MACD histogram{" "}
                {computed.macd.lastHist >= 0 ? "positive" : "negative"}, trend slope {fmt(computed.reg.slope, 3)}/bar, and the 7-bar ensemble points to {unit}
                {fmt(computed.forecast.ensemble[6])}. (Add a Gemini key for a fuller written analysis.)
              </p>
            )}
            <p className="mt-4 border-t border-(--color-border) pt-3 text-[11px] text-(--color-fg-subtle)">
              Educational tooling computed from live NSE data — not investment advice.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ sub-pieces */

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

function IndicatorCard({ title, icon, formula, children }: { title: string; icon: React.ReactNode; formula: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-tight text-(--color-fg)">
        <span className="text-(--color-brand-700)">{icon}</span> {title}
      </p>
      <div className="mt-3">{children}</div>
      <p className="mt-3 border-t border-(--color-border)/70 pt-2 font-mono text-[10px] leading-relaxed text-(--color-fg-subtle)">{formula}</p>
    </div>
  );
}

function RsiGauge({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div>
      <p className="text-[24px] font-semibold tabular tracking-tight">{fmt(clamped, 1)}</p>
      <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-gradient-to-r from-(--color-down)/50 via-(--color-surface-3) to-(--color-up)/50">
        <div className="absolute inset-y-0 left-[30%] w-px bg-(--color-fg-subtle)/50" />
        <div className="absolute inset-y-0 left-[70%] w-px bg-(--color-fg-subtle)/50" />
        <div
          className="absolute top-1/2 h-4 w-1.5 -translate-y-1/2 rounded-full bg-(--color-fg) shadow transition-[left] duration-700"
          style={{ left: `calc(${clamped}% - 3px)` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] text-(--color-fg-subtle)">
        <span>0 · oversold&lt;30</span>
        <span>overbought&gt;70 · 100</span>
      </div>
    </div>
  );
}

function MacdMini({ macd }: { macd: ReturnType<typeof macdCalc> }) {
  const N = 48;
  const hist = macd.hist.slice(-N);
  const maxAbs = Math.max(...hist.map((h) => Math.abs(h)), 1e-9);
  return (
    <div className="flex h-16 items-center gap-[2px]">
      {hist.map((h, i) => {
        const ratio = Math.abs(h) / maxAbs;
        return (
          <div key={i} className="flex h-full flex-1 flex-col justify-center">
            <div
              className={cn("w-full rounded-sm", h >= 0 ? "bg-(--color-up)/80" : "bg-(--color-down)/80")}
              style={{ height: `${Math.max(4, ratio * 50)}%`, alignSelf: "center" }}
            />
          </div>
        );
      })}
    </div>
  );
}

function ScoreMeter({ score }: { score: BullBearScore }) {
  const shown = useCountUp(score.score, true, 1200);
  const tone = score.score >= 58 ? "var(--color-up)" : score.score < 42 ? "var(--color-down)" : "var(--color-warn)";
  return (
    <div className="mt-3">
      <div className="flex items-baseline gap-3">
        <p className="text-[44px] font-semibold tabular leading-none tracking-tight" style={{ color: tone }}>
          {Math.round(shown)}
        </p>
        <p className="text-[15px] font-semibold" style={{ color: tone }}>
          {score.verdict}
        </p>
      </div>
      <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-gradient-to-r from-(--color-down)/60 via-(--color-warn)/50 to-(--color-up)/60">
        <div
          className="absolute top-1/2 h-5 w-1.5 -translate-y-1/2 rounded-full bg-(--color-fg) shadow transition-[left] duration-1000 ease-out"
          style={{ left: `calc(${Math.min(100, Math.max(0, shown))}% - 3px)` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-(--color-fg-subtle)">
        <span>Bearish 0</span>
        <span>50</span>
        <span>100 Bullish</span>
      </div>
    </div>
  );
}

function MainChart({ computed, unit, showForecast }: { computed: Computed; unit: string; showForecast: boolean }) {
  const W = 980;
  const H = 400;
  const pad = { l: 6, r: 10, t: 14, b: 18 };
  const prices = computed.prices;
  const f = computed.forecast;
  const horizon = showForecast ? f.horizon : 0;

  const allVals = [
    ...prices,
    ...computed.bandUpper.filter((v) => !isNaN(v)),
    ...computed.bandLower.filter((v) => !isNaN(v)),
    ...(showForecast ? [...f.upper, ...f.lower] : []),
    ...(computed.levels ? [...computed.levels.supports, ...computed.levels.resistances] : []),
  ];
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const span = max - min || 1;
  const total = prices.length + horizon;

  const xAt = (i: number) => pad.l + (i / (total - 1)) * (W - pad.l - pad.r);
  const yAt = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);

  const linePath = (vals: number[], offset = 0) =>
    vals
      .map((v, i) => (isNaN(v) ? null : `${xAt(i + offset).toFixed(1)},${yAt(v).toFixed(1)}`))
      .map((p, i, arr) => (p === null ? "" : `${i === 0 || arr[i - 1] === null ? "M" : "L"}${p}`))
      .join(" ");

  const pricePath = linePath(prices);
  const sma20Path = linePath(computed.sma20);
  const sma50Path = linePath(computed.sma50);

  // Bollinger polygon
  const bandPts: string[] = [];
  for (let i = 0; i < prices.length; i++) if (!isNaN(computed.bandUpper[i])) bandPts.push(`${xAt(i).toFixed(1)},${yAt(computed.bandUpper[i]).toFixed(1)}`);
  for (let i = prices.length - 1; i >= 0; i--) if (!isNaN(computed.bandLower[i])) bandPts.push(`${xAt(i).toFixed(1)},${yAt(computed.bandLower[i]).toFixed(1)}`);
  const bandPolygon = bandPts.join(" ");

  // Forecast cone
  const lastIdx = prices.length - 1;
  let conePolygon = "";
  let ensemblePath = "";
  if (showForecast) {
    const up = [`${xAt(lastIdx).toFixed(1)},${yAt(prices[lastIdx]).toFixed(1)}`, ...f.upper.map((v, h) => `${xAt(lastIdx + 1 + h).toFixed(1)},${yAt(v).toFixed(1)}`)];
    const down = [...f.lower.map((v, h) => `${xAt(lastIdx + 1 + h).toFixed(1)},${yAt(v).toFixed(1)}`).reverse(), `${xAt(lastIdx).toFixed(1)},${yAt(prices[lastIdx]).toFixed(1)}`];
    conePolygon = [...up, ...down].join(" ");
    ensemblePath = `M${xAt(lastIdx).toFixed(1)},${yAt(prices[lastIdx]).toFixed(1)} ` + f.ensemble.map((v, h) => `L${xAt(lastIdx + 1 + h).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
  }

  return (
    <div className="reveal reveal-shown mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[300px] w-full sm:h-[400px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="mc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#115e3c" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#115e3c" stopOpacity="0" />
          </linearGradient>
        </defs>

        {bandPolygon && <polygon points={bandPolygon} fill="#6fb98e" opacity="0.09" stroke="#6fb98e" strokeOpacity="0.35" strokeWidth="0.6" strokeDasharray="4 4" />}

        {/* S/R levels */}
        {computed.levels?.resistances.map((r, i) => (
          <g key={`r${i}`}>
            <line x1={pad.l} x2={W - pad.r} y1={yAt(r)} y2={yAt(r)} stroke="#1d6fb8" strokeWidth="1" strokeDasharray="6 5" opacity="0.5" />
            <text x={W - pad.r - 4} y={yAt(r) - 4} textAnchor="end" fontSize="10" fill="#1d6fb8">R{i + 1} {unit}{fmt(r, 0)}</text>
          </g>
        ))}
        {computed.levels?.supports.map((s, i) => (
          <g key={`s${i}`}>
            <line x1={pad.l} x2={W - pad.r} y1={yAt(s)} y2={yAt(s)} stroke="#1d6fb8" strokeWidth="1" strokeDasharray="6 5" opacity="0.5" />
            <text x={W - pad.r - 4} y={yAt(s) + 11} textAnchor="end" fontSize="10" fill="#1d6fb8">S{i + 1} {unit}{fmt(s, 0)}</text>
          </g>
        ))}

        <path d={`${pricePath} L${xAt(lastIdx).toFixed(1)},${H - pad.b} L${xAt(0).toFixed(1)},${H - pad.b} Z`} fill="url(#mc-fill)" />
        <path d={pricePath} fill="none" stroke="#115e3c" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="spark-line" />
        {sma20Path && <path d={sma20Path} fill="none" stroke="#3d9a6b" strokeWidth="1.5" strokeLinejoin="round" />}
        {sma50Path && <path d={sma50Path} fill="none" stroke="#8a63d2" strokeWidth="1.5" strokeLinejoin="round" />}

        {showForecast && conePolygon && <polygon points={conePolygon} fill="#b27a00" opacity="0.1" />}
        {showForecast && ensemblePath && <path d={ensemblePath} fill="none" stroke="#b27a00" strokeWidth="2" strokeDasharray="5 5" strokeLinejoin="round" />}

        <circle cx={xAt(lastIdx)} cy={yAt(prices[lastIdx])} r="3.5" fill="#115e3c" />
        <text x={xAt(lastIdx) - 6} y={yAt(prices[lastIdx]) - 10} textAnchor="end" fontSize="12" fontWeight="600" fill="#0d1f17">
          {unit}
          {fmt(prices[lastIdx])}
        </text>
      </svg>
    </div>
  );
}
