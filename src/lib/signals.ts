// AI analysis layer, part 1: a bull/bear score built from standardised effect
// sizes rather than arbitrary points. Every component is expressed as a
// z-score — "how many standard deviations is this signal from neutral?" — so
// the arithmetic is both visible and comparable across instruments.

import { fmt, stdDev, sma, smaLine, logReturns, type Macd, type Atr } from "./quant";

export type ScoreComponent = {
  label: string;
  /** Standardised effect size, clamped to ±3σ. Positive = bullish. */
  z: number;
  /** Relative importance in the composite (weights sum to 1). */
  weight: number;
  /** Contribution to the composite z (= z × weight). */
  contribution: number;
  why: string;
};

export type BullBearScore = {
  score: number; // 0–100
  verdict: "Bullish" | "Leaning bullish" | "Neutral" | "Leaning bearish" | "Bearish";
  components: ScoreComponent[];
  /** Weighted composite z-score before the CDF mapping. */
  compositeZ: number;
};

export type ScoreInput = {
  prices: number[];
  rsi: number;
  macd: Macd;
  /** OLS trend t-statistic (β/SE(β)) — already scale-free. */
  trendT: number;
  bollPos: number; // %B: 0 = lower band, 1 = upper band
  atr: Atr | null;
  ensembleTarget: number;
  /** Forecast σ at the horizon, in log space. */
  forecastSigma: number;
};

/** Keeps a single noisy input from dominating the composite. */
const clamp3 = (z: number) => Math.max(-3, Math.min(3, isFinite(z) ? z : 0));

/**
 * Standard normal CDF via the Abramowitz & Stegun 7.1.26 erf approximation
 * (|ε| < 1.5e-7). Maps the composite z onto 0–100.
 */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Composite bull/bear score.
 *
 * Each component is converted to a z-score, then combined:
 *
 *   Z = Σ wᵢ·zᵢ  /  √(Σ wᵢ²)      ← unit-variance composite
 *   score = 100 · Φ(Z)
 *
 * The √(Σw²) divisor matters: summing weighted independent z's shrinks the
 * variance, so without it the composite would cluster near 50 and the score
 * would never reach its extremes. Φ then maps the real line onto 0–100
 * smoothly, so a marginal signal moves the score a little and a decisive one
 * moves it a lot — unlike the previous binary point system, where a close
 * 0.01% above the SMA scored identically to one 20% above.
 */
export function bullBearScore(input: ScoreInput): BullBearScore {
  const { prices, rsi, macd, trendT, bollPos, ensembleTarget, forecastSigma } = input;
  const last = prices[prices.length - 1];

  // Daily log-return σ is the natural yardstick for "how big is this move?"
  const sigmaDaily = stdDev(logReturns(prices), true) || 1e-6;

  const c: ScoreComponent[] = [];

  // 1. Price vs SMA20, measured in daily-σ units.
  const s20 = sma(prices, 20);
  const zTrend = clamp3(Math.log(last / s20) / sigmaDaily);
  c.push({
    label: "Price vs SMA₂₀",
    z: zTrend,
    weight: 0.2,
    contribution: 0,
    why: `close ${fmt(last)} is ${fmt(zTrend, 2)}σ ${zTrend >= 0 ? "above" : "below"} SMA₂₀ ${fmt(s20)}`,
  });

  // 2. SMA20 vs SMA50 spread, same yardstick.
  const s50line = smaLine(prices, 50);
  const s50 = s50line[s50line.length - 1];
  if (!isNaN(s50) && s50 > 0) {
    const zSpread = clamp3(Math.log(s20 / s50) / (sigmaDaily * Math.sqrt(20)));
    c.push({
      label: "SMA₂₀ vs SMA₅₀",
      z: zSpread,
      weight: 0.15,
      contribution: 0,
      why: `SMA₂₀ ${fmt(s20)} vs SMA₅₀ ${fmt(s50)} → ${fmt(zSpread, 2)}σ spread`,
    });
  }

  // 3. MACD histogram, standardised by its own recent dispersion — the raw
  //    value is in price units and means nothing across instruments.
  const histSeries = macd.hist.filter((v) => !isNaN(v));
  const histSigma = stdDev(histSeries.slice(-60), true) || 1e-6;
  const zMacd = clamp3(macd.lastHist / histSigma);
  c.push({
    label: "MACD histogram",
    z: zMacd,
    weight: 0.2,
    contribution: 0,
    why: `hist ${fmt(macd.lastHist, 2)} = ${fmt(zMacd, 2)}σ of its 60-bar dispersion`,
  });

  // 4. RSI: centred at 50. Its own sampling sd is ~15 on liquid names, which
  //    turns the 30/70 lines into roughly ∓1.3σ.
  const zRsi = clamp3((rsi - 50) / 15);
  c.push({
    label: "RSI(14) regime",
    z: zRsi,
    weight: 0.15,
    contribution: 0,
    why: `RSI ${fmt(rsi, 1)} → ${fmt(zRsi, 2)}σ from the neutral 50`,
  });

  // 5. Trend significance: the OLS t-statistic is already a z-like quantity.
  const zSlope = clamp3(trendT / 2);
  c.push({
    label: "Trend significance (t)",
    z: zSlope,
    weight: 0.15,
    contribution: 0,
    why: `OLS t = ${fmt(trendT, 2)} (${Math.abs(trendT) > 2 ? "significant" : "not significant"} at 95%)`,
  });

  // 6. Bollinger %B recentred: 0.5 → 0, bands → ±2σ by construction.
  const zBoll = clamp3((bollPos - 0.5) * 4);
  c.push({
    label: "Bollinger %B",
    z: zBoll,
    weight: 0.05,
    contribution: 0,
    why: `%B = ${fmt(bollPos, 2)} → ${fmt(zBoll, 2)}σ within the band`,
  });

  // 7. Forecast: how far the target sits from spot, relative to the forecast's
  //    own uncertainty. A big move the model is unsure about scores modestly.
  const sigF = forecastSigma > 0 ? forecastSigma : sigmaDaily * Math.sqrt(7);
  const zFore = clamp3(Math.log(ensembleTarget / last) / sigF);
  c.push({
    label: "Ensemble forecast",
    z: zFore,
    weight: 0.1,
    contribution: 0,
    why: `t+7 ${fmt(ensembleTarget)} vs ${fmt(last)} → ${fmt(zFore, 2)}σ of forecast error`,
  });

  // Unit-variance weighted composite.
  const wNorm = Math.sqrt(c.reduce((a, x) => a + x.weight * x.weight, 0)) || 1;
  let composite = 0;
  for (const comp of c) {
    comp.contribution = comp.z * comp.weight;
    composite += comp.contribution;
  }
  const compositeZ = composite / wNorm;

  const score = Math.round(100 * normalCdf(compositeZ));
  const verdict =
    compositeZ >= 1 ? "Bullish"
    : compositeZ >= 0.33 ? "Leaning bullish"
    : compositeZ > -0.33 ? "Neutral"
    : compositeZ > -1 ? "Leaning bearish"
    : "Bearish";

  return { score, verdict, components: c, compositeZ };
}
