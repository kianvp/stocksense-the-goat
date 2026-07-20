// Research Engine — Layer 4: quantitative models.
//
// Wraps the verified forecast ensemble and adds three deterministic model
// classes the spec calls for. A deliberate scope note, because it matters:
// gradient-boosted trees (XGBoost et al.) are NOT here. Fitting tree
// ensembles to 120–250 daily bars in a browser would overfit catastrophically
// and reporting their "accuracy" would be theater. The models below are
// parsimonious, walk-forward validated, and every diagnostic they report is
// genuinely out-of-sample.

import {
  logReturns, stdDev, linearRegression, supportResistance,
  detectPatterns, type Ohlc,
} from "@/lib/quant";
import { ensembleForecast, backtestDiagnostics } from "@/lib/forecast";
import { bullBearScore } from "@/lib/signals";
import { bollinger, macd, rsi } from "@/lib/quant";
import type { Anomaly, ModelLayer, PriceData, Regime, VolForecast } from "./types";

/** RiskMetrics decay constant — the industry-standard EWMA parameter. */
export const EWMA_LAMBDA = 0.94;

/**
 * EWMA volatility forecast (RiskMetrics):
 *
 *   σ²ₜ = λ·σ²ₜ₋₁ + (1−λ)·r²ₜ ,  λ = 0.94
 *
 * The recursion weights recent squared returns more heavily than a flat
 * window, so the forecast adapts after volatility shocks. σₜ is the one-day-
 * ahead forecast; annualised by √252 like every other σ in the codebase.
 */
export function ewmaVolForecast(closes: number[], lambda = EWMA_LAMBDA): VolForecast {
  const rs = logReturns(closes);
  if (rs.length < 5) return { sigmaDaily: NaN, sigmaAnnual: NaN, lambda };
  // Seed with the sample variance of the first few returns.
  let v = Math.pow(stdDev(rs.slice(0, Math.min(20, rs.length)), true), 2);
  for (const r of rs) v = lambda * v + (1 - lambda) * r * r;
  const sigmaDaily = Math.sqrt(v);
  return { sigmaDaily, sigmaAnnual: sigmaDaily * Math.sqrt(252), lambda };
}

/**
 * Market-regime classifier — deliberately rules-based, with the thresholds in
 * the open rather than inside an opaque model:
 *
 *   trending  ⇔ |OLS t-stat| > 2      (slope significant at ~95%)
 *   volatile  ⇔ current 20-bar σ above the 80th percentile of its own history
 */
export function classifyRegime(closes: number[]): Regime {
  const reg = linearRegression(closes, 0);
  const sigmas: number[] = [];
  for (let i = 20; i <= closes.length; i++) {
    sigmas.push(stdDev(logReturns(closes.slice(i - 20, i)), true));
  }
  const current = sigmas[sigmas.length - 1] ?? 0;
  const sorted = [...sigmas].sort((a, b) => a - b);
  const rank = sorted.findIndex((s) => s >= current);
  const volPercentile = sorted.length > 1 ? Math.max(0, rank) / (sorted.length - 1) : 0.5;

  const trending = Math.abs(reg.tStat) > 2;
  const volatile = volPercentile > 0.8;
  const regime: Regime["regime"] = trending
    ? reg.tStat > 0 ? "trending-bull" : "trending-bear"
    : volatile ? "ranging-volatile" : "ranging-quiet";
  return { regime, trendT: reg.tStat, volPercentile };
}

/**
 * Anomaly scan: a bar is anomalous when its log return exceeds 3σ of the
 * trailing 60-bar distribution. Volume ratio (vs 20-bar median) is attached
 * when volume exists, as corroborating context — not as a second trigger.
 */
export function detectAnomalies(price: PriceData, window = 60, threshold = 3): Anomaly[] {
  const bars = price.bars;
  const out: Anomaly[] = [];
  for (let i = window + 1; i < bars.length; i++) {
    const trail = logReturns(bars.slice(i - window - 1, i).map((b) => b.close));
    const sigma = stdDev(trail, true);
    if (sigma <= 0) continue;
    const r = Math.log(bars[i].close / bars[i - 1].close);
    if (Math.abs(r) > threshold * sigma) {
      let volumeRatio: number | null = null;
      const vols = bars.slice(Math.max(0, i - 20), i)
        .map((b) => b.volume).filter((v): v is number => v != null && v > 0);
      if (vols.length >= 10 && bars[i].volume != null) {
        const median = [...vols].sort((a, b) => a - b)[Math.floor(vols.length / 2)];
        if (median > 0) volumeRatio = bars[i].volume! / median;
      }
      out.push({ time: bars[i].time, logReturn: r, sigmas: Math.abs(r) / sigma, volumeRatio });
    }
  }
  return out.slice(-6); // the recent ones are what matter for analysis
}

/** Runs the full model layer on priced data. Pure and synchronous. */
export function runModelLayer(price: PriceData): ModelLayer {
  const closes = price.bars.map((b) => b.close);
  const times = price.bars.map((b) => b.time);

  const ensemble = ensembleForecast(closes, 7, times);
  const diag = backtestDiagnostics(closes, times);

  const perModel = ensemble.models.map((m, i) => ({
    id: m.id,
    name: m.name,
    diagnostics: diag.n > 0
      ? {
          rmse: diag.rmse[i],
          mae: diag.mae[i],
          mape: diag.mape[i],
          directionalAccuracy: diag.dirAcc[i],
          sampleSize: diag.n,
        }
      : null,
  }));

  const ohlc: Ohlc[] = price.bars
    .filter((b) => b.high != null && b.low != null)
    .map((b) => ({ high: b.high!, low: b.low!, close: b.close }));
  const levels = ohlc.length > 10 ? supportResistance(ohlc, 3) : null;

  // Score inputs mirror the quant workbench exactly — one formula, one place.
  const reg = linearRegression(closes, 0);
  const b = closes.length >= 20 ? bollinger(closes, 20, 2) : null;
  const last = closes[closes.length - 1];
  const bollPos = b && b.upper !== b.lower
    ? Math.min(1, Math.max(0, (last - b.lower) / (b.upper - b.lower)))
    : 0.5;
  const score = bullBearScore({
    prices: closes,
    rsi: rsi(closes, 14).rsi,
    macd: macd(closes),
    trendT: reg.tStat,
    bollPos,
    atr: null,
    ensembleTarget: ensemble.ensemble[ensemble.ensemble.length - 1],
    forecastSigma: ensemble.sigmaPath[ensemble.sigmaPath.length - 1] ?? 0,
  });
  return {
    ensemble,
    perModel,
    baseline: {
      rmse: diag.baseline.rmse,
      mae: diag.baseline.mae,
      mape: diag.baseline.mape,
      directionalAccuracy: diag.baseline.dirAcc,
      sampleSize: diag.baseline.n,
    },
    regime: classifyRegime(closes),
    volForecast: ewmaVolForecast(closes),
    anomalies: detectAnomalies(price),
    score,
    levels: levels ? { supports: levels.supports, resistances: levels.resistances } : null,
    patterns: detectPatterns(closes),
  };
}
