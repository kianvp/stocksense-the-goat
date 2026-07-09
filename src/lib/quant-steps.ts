// Shared step builder for the Quant workbench: turns a price series into an
// ordered list of {formula, work, result} steps, reusing the pure math in
// ./quant. Kept UI-free so both the landing engine and the in-app workbench
// can render it however they like.

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
  volatility,
} from "./quant";

export type QuantStep = {
  id: string;
  title: string;
  formula: string;
  work: string;
  result: string;
  tone?: "up" | "down" | "neutral";
};

export type QuantComputed = {
  prices: number[];
  smaLine20: number[];
  boll: ReturnType<typeof bollinger>;
  reg: ReturnType<typeof linearRegression>;
  rsiValue: number;
  steps: QuantStep[];
};

export function computeQuant(unit: string, prices: number[]): QuantComputed {
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

  const steps: QuantStep[] = [
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
      work: `μ = mean of ${rets.length} returns`,
      result: `μ = ${pct(muDaily, 3)} / day`,
      tone: muDaily >= 0 ? "up" : "down",
    },
    {
      id: "sma",
      title: "Simple moving average (20)",
      formula: "SMA₂₀ = (1/20) Σ Pₜ₋ᵢ ,  i = 0…19",
      work: `mean of last 20 closes`,
      result: `SMA₂₀ = ${u}${fmt(s20)}`,
      tone: last >= s20 ? "up" : "down",
    },
    {
      id: "ema",
      title: "Exponential moving average (20)",
      formula: "k = 2/(N+1);  EMAₜ = Pₜ·k + EMAₜ₋₁·(1−k)",
      work: `k = 2/21 = ${fmt(e.k, 4)}`,
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
      work: `σ = ${u}${fmt(boll.sigma)}`,
      result: `[${u}${fmt(boll.lower)}, ${u}${fmt(boll.upper)}] · width ${pct(boll.width)}`,
    },
    {
      id: "vol",
      title: "Volatility (annualised)",
      formula: "σ_annual = σ_daily · √252",
      work: `σ_daily = ${pct(vol.daily, 3)}`,
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

  return { prices, smaLine20: smaLine(prices, 20), boll, reg, rsiValue: r.rsi, steps };
}

// Deterministic fallback if the live fetch fails, so the workbench always has
// a real-looking series to compute on.
export function fallbackSeries(seed: number, base: number): number[] {
  const out: number[] = [];
  let p = base;
  for (let i = 0; i < 60; i++) {
    const x = Math.sin((i + seed) / 4) * 0.6 + Math.cos((i + seed) / 9) * 0.4;
    p = p * (1 + (x + (i / 60 - 0.3)) * 0.006);
    out.push(Math.round(p * 100) / 100);
  }
  return out;
}
