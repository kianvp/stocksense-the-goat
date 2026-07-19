// A small, honest technical-analysis toolkit. Every function returns both the
// result and the intermediate numbers so the UI can show its working.

export type Series = number[];

/** Simple (arithmetic) returns: rₜ = (Pₜ − Pₜ₋₁)/Pₜ₋₁. */
export function returns(prices: Series): Series {
  const out: Series = [];
  for (let i = 1; i < prices.length; i++) out.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  return out;
}

/**
 * Log (continuously-compounded) returns: rₜ = ln(Pₜ / Pₜ₋₁).
 *
 * The correct basis for volatility work: log returns are additive across time,
 * so σ scales by √t, which is what the √252 annualisation assumes. Simple
 * returns are not additive and bias σ upward for volatile series.
 */
export function logReturns(prices: Series): Series {
  const out: Series = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) out.push(Math.log(prices[i] / prices[i - 1]));
  }
  return out;
}

export function mean(xs: Series): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdDev(xs: Series, sample = true): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const ss = xs.reduce((a, b) => a + (b - m) ** 2, 0);
  return Math.sqrt(ss / (xs.length - (sample ? 1 : 0)));
}

/** Simple moving average over the last `period` points. */
export function sma(prices: Series, period: number): number {
  const slice = prices.slice(-period);
  return mean(slice);
}

/** Full SMA line (NaN until enough points). */
export function smaLine(prices: Series, period: number): number[] {
  return prices.map((_, i) => (i + 1 < period ? NaN : mean(prices.slice(i + 1 - period, i + 1))));
}

/**
 * Exponential moving average, seeded the standard way.
 *
 *   k    = 2/(period+1)
 *   EMA₀ = SMA(first `period` values)            ← seed
 *   EMAₜ = Pₜ·k + EMAₜ₋₁·(1−k)
 *
 * The seed matters: priming with a single price (EMA₀ = P₀) leaves the first
 * ~2·period values badly biased, and because MACD subtracts two EMAs of
 * *different* lengths, that bias does not cancel — it produces a spurious
 * early MACD signal. Values before the seed are NaN (genuinely undefined)
 * rather than silently fabricated.
 */
export function ema(prices: Series, period: number): { value: number; k: number; line: number[] } {
  const k = 2 / (period + 1);
  const line: number[] = new Array(prices.length).fill(NaN);
  if (prices.length < period) return { value: NaN, k, line };

  let prev = mean(prices.slice(0, period));
  line[period - 1] = prev;
  for (let i = period; i < prices.length; i++) {
    prev = prices[i] * k + prev * (1 - k);
    line[i] = prev;
  }
  return { value: prev, k, line };
}

export type RsiResult = {
  rsi: number;
  avgGain: number;
  avgLoss: number;
  rs: number;
  period: number;
  line: number[];
};

/**
 * Wilder's Relative Strength Index (New Concepts in Technical Trading, 1978).
 *
 *   seed:  avgGain = Σgain(1..n)/n,  avgLoss = Σloss(1..n)/n
 *   step:  avgGainₜ = (avgGainₜ₋₁·(n−1) + gainₜ)/n     ← Wilder smoothing
 *          avgLossₜ = (avgLossₜ₋₁·(n−1) + lossₜ)/n
 *   RS    = avgGain/avgLoss
 *   RSI   = 100 − 100/(1+RS)
 *
 * The previous implementation averaged only the most recent `period` deltas
 * with no recursive smoothing. That is a different (and much noisier)
 * indicator: Wilder's RSI carries the entire history forward with decay, so
 * on real series the two can differ by 10+ points and cross the 30/70
 * thresholds at different times.
 */
export function rsi(prices: Series, period = 14): RsiResult {
  const line: number[] = new Array(prices.length).fill(NaN);
  if (prices.length < period + 1) {
    return { rsi: NaN, avgGain: NaN, avgLoss: NaN, rs: NaN, period, line };
  }

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    gains.push(Math.max(0, d));
    losses.push(Math.max(0, -d));
  }

  // Seed with the simple average of the first `period` changes.
  let avgGain = mean(gains.slice(0, period));
  let avgLoss = mean(losses.slice(0, period));
  const rsiFrom = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  line[period] = rsiFrom(avgGain, avgLoss);

  // gains[i] corresponds to prices[i+1].
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    line[i + 1] = rsiFrom(avgGain, avgLoss);
  }

  const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  return { rsi: rsiFrom(avgGain, avgLoss), avgGain, avgLoss, rs, period, line };
}

export type Bollinger = { mid: number; upper: number; lower: number; sigma: number; period: number; width: number };

export function bollinger(prices: Series, period = 20, mult = 2): Bollinger {
  const slice = prices.slice(-period);
  const mid = mean(slice);
  const sigma = stdDev(slice, false);
  const upper = mid + mult * sigma;
  const lower = mid - mult * sigma;
  return { mid, upper, lower, sigma, period, width: (upper - lower) / mid };
}

export type Volatility = { daily: number; annualized: number; n: number };

/**
 * Realised volatility from LOG returns, annualised over 252 trading days:
 *
 *   σ_daily  = stdev( ln(Pₜ/Pₜ₋₁) )          (sample, n−1)
 *   σ_annual = σ_daily · √252
 *
 * Log returns are used because the √t scaling rule is only valid for an
 * additive series. Using simple returns here (the previous behaviour)
 * overstates σ, and the error grows with volatility.
 */
export function volatility(prices: Series): Volatility {
  const rs = logReturns(prices);
  const daily = stdDev(rs, true);
  return { daily, annualized: daily * Math.sqrt(252), n: rs.length };
}

export type Regression = {
  slope: number;
  intercept: number;
  r2: number;
  forecast: number[];
  fitted: number[];
  /** Standard error of the slope estimate. */
  seSlope: number;
  /** t = β/SE(β) — how many standard errors the trend sits from zero. */
  tStat: number;
  /** Residual standard error (√ of the unbiased residual variance). */
  residualSe: number;
};

/**
 * Ordinary least squares of price on the time index, with inference:
 *
 *   β  = Σ(xᵢ−x̄)(yᵢ−ȳ) / Σ(xᵢ−x̄)²
 *   α  = ȳ − β·x̄
 *   s² = SSres/(n−2)                       (unbiased residual variance)
 *   SE(β) = √( s² / Σ(xᵢ−x̄)² )
 *   t  = β / SE(β)
 *
 * The t-statistic is what makes trend comparable across instruments: a slope
 * of ₹2/bar is meaningless on its own, but "3.4 standard errors above zero"
 * is the same statement for any stock at any price level.
 */
export function linearRegression(prices: Series, horizon = 7): Regression {
  const n = prices.length;
  const xs = Array.from({ length: n }, (_, i) => i);
  const mx = mean(xs);
  const my = mean(prices);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (prices[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  const fitted = xs.map((x) => slope * x + intercept);
  // R²
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (prices[i] - fitted[i]) ** 2;
    ssTot += (prices[i] - my) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  // Inference on the slope. Needs n > 2 for an unbiased residual variance.
  const residualVar = n > 2 ? ssRes / (n - 2) : 0;
  const residualSe = Math.sqrt(residualVar);
  const seSlope = den > 0 && residualVar > 0 ? Math.sqrt(residualVar / den) : 0;
  const tStat = seSlope > 0 ? slope / seSlope : 0;
  const forecast = Array.from({ length: horizon }, (_, h) => slope * (n - 1 + h + 1) + intercept);
  return { slope, intercept, r2, forecast, fitted, seSlope, tStat, residualSe };
}

export type Sharpe = { sharpe: number; meanRet: number; sigma: number; rf: number };

/**
 * Annualised Sharpe ratio on log returns:
 *
 *   μ_annual = mean(ln-returns) · 252        (continuously compounded)
 *   σ_annual = stdev(ln-returns) · √252
 *   Sharpe   = (μ_annual − r_f) / σ_annual
 *
 * Both legs use log returns so the numerator and denominator are annualised
 * on the same basis — mixing arithmetic drift with √t-scaled σ (the previous
 * behaviour) inflates the ratio. `rf` is an annual rate (default 6.5%, a
 * reasonable Indian risk-free proxy).
 */
export function sharpe(prices: Series, rf = 0.065): Sharpe {
  const rs = logReturns(prices);
  const meanRet = mean(rs);
  const sigma = stdDev(rs, true);
  const annRet = meanRet * 252;
  const annVol = sigma * Math.sqrt(252);
  // Guard on an epsilon, not on exact zero: a series with (near-)constant
  // returns leaves σ at ~1e-17 of floating-point noise rather than a clean 0,
  // and dividing by that produces a meaningless multi-trillion Sharpe.
  const sh = annVol < 1e-12 ? 0 : (annRet - rf) / annVol;
  return { sharpe: sh, meanRet, sigma, rf };
}

/* ------------------------------------------------------------------ MACD */

export type Macd = {
  macd: number[];
  signal: number[];
  hist: number[];
  lastMacd: number;
  lastSignal: number;
  lastHist: number;
  fast: number;
  slow: number;
  signalPeriod: number;
};

/**
 * MACD(12, 26, 9):
 *
 *   MACDₜ   = EMA_fast(P)ₜ − EMA_slow(P)ₜ
 *   signalₜ = EMA_signal(MACD)ₜ
 *   histₜ   = MACDₜ − signalₜ
 *
 * Both EMAs are SMA-seeded, so MACD is undefined until the slow EMA exists
 * (index slow−1). The signal EMA is then seeded from the *first valid* MACD
 * value and mapped back to the original indices — running it over the raw
 * array would seed it from NaN (or, before the EMA fix, from fabricated
 * early values) and shift every crossover.
 */
export function macd(prices: Series, fast = 12, slow = 26, signalPeriod = 9): Macd {
  const eFast = ema(prices, fast).line;
  const eSlow = ema(prices, slow).line;
  const macdLine = prices.map((_, i) =>
    isNaN(eFast[i]) || isNaN(eSlow[i]) ? NaN : eFast[i] - eSlow[i],
  );

  const firstValid = macdLine.findIndex((v) => !isNaN(v));
  const signalLine: number[] = new Array(prices.length).fill(NaN);
  if (firstValid >= 0) {
    const valid = macdLine.slice(firstValid);
    const sig = ema(valid, signalPeriod).line;
    for (let i = 0; i < sig.length; i++) signalLine[firstValid + i] = sig[i];
  }

  const hist = macdLine.map((m, i) =>
    isNaN(m) || isNaN(signalLine[i]) ? NaN : m - signalLine[i],
  );
  return {
    macd: macdLine,
    signal: signalLine,
    hist,
    lastMacd: macdLine[macdLine.length - 1],
    lastSignal: signalLine[signalLine.length - 1],
    lastHist: hist[hist.length - 1],
    fast,
    slow,
    signalPeriod,
  };
}

/* ------------------------------------------------------------------- ATR */

export type Ohlc = { high: number; low: number; close: number };

export type Atr = { atr: number; pct: number; period: number; lastTR: number };

/** Wilder's Average True Range. TR = max(H−L, |H−C₋₁|, |L−C₋₁|). */
export function atr(bars: Ohlc[], period = 14): Atr | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const { high, low } = bars[i];
    const prevClose = bars[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  let a = mean(trs.slice(0, period));
  for (let i = period; i < trs.length; i++) {
    a = (a * (period - 1) + trs[i]) / period; // Wilder smoothing
  }
  const lastClose = bars[bars.length - 1].close;
  return { atr: a, pct: lastClose ? a / lastClose : 0, period, lastTR: trs[trs.length - 1] };
}

/* -------------------------------------------------- support / resistance */

/** A price zone, not a single tick: several swings clustered into one level. */
export type Level = {
  /** Touch-weighted centre of the cluster. */
  price: number;
  /** How many swing points formed it — a proxy for how "respected" it is. */
  touches: number;
  /** 0–1 strength: touches scaled against the strongest level found. */
  strength: number;
};

export type Levels = {
  supports: Level[]; // nearest below price first
  resistances: Level[]; // nearest above price first
  pivot: { p: number; r1: number; s1: number; r2: number; s2: number };
};

/**
 * Cluster raw swing prices into zones. Any two swings within `tol` (an
 * absolute price distance, normally a fraction of ATR) collapse into one
 * level positioned at the mean of its members.
 */
function clusterLevels(raw: number[], tol: number): Level[] {
  if (raw.length === 0) return [];
  const sorted = [...raw].sort((a, b) => a - b);
  const groups: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const g = groups[groups.length - 1];
    // Compare against the running mean so a long drift doesn't chain-merge.
    if (Math.abs(sorted[i] - mean(g)) <= tol) g.push(sorted[i]);
    else groups.push([sorted[i]]);
  }
  const maxTouches = Math.max(...groups.map((g) => g.length));
  return groups.map((g) => ({
    price: mean(g),
    touches: g.length,
    strength: maxTouches > 0 ? g.length / maxTouches : 0,
  }));
}

/**
 * Swing-point support/resistance.
 *
 * Fractal pivots (a bar whose high/low is the extreme of its 2 neighbours on
 * each side) are collected, then **clustered** so that near-identical swings
 * become a single zone with a touch count. The previous version de-duplicated
 * only exact matches, so 1,204.10 and 1,204.85 were reported as two separate
 * levels — which is what produced stacked, overlapping labels on the chart.
 *
 * Also returns the floor-trader pivot set from the latest bar:
 *   P = (H+L+C)/3,  R1 = 2P−L,  S1 = 2P−H,  R2 = P+(H−L),  S2 = P−(H−L)
 */
export function supportResistance(bars: Ohlc[], maxLevels = 3): Levels | null {
  if (bars.length < 10) return null;
  const last = bars[bars.length - 1];
  const price = last.close;

  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = 2; i < bars.length - 2; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    if (h >= bars[i - 1].high && h >= bars[i - 2].high && h >= bars[i + 1].high && h >= bars[i + 2].high) {
      swingHighs.push(h);
    }
    if (l <= bars[i - 1].low && l <= bars[i - 2].low && l <= bars[i + 1].low && l <= bars[i + 2].low) {
      swingLows.push(l);
    }
  }

  // Cluster tolerance: half an ATR, falling back to 0.5% of price when ATR
  // isn't computable. Scales with the instrument instead of being a fixed tick.
  const a = atr(bars, Math.min(14, bars.length - 1));
  const tol = a ? a.atr * 0.5 : price * 0.005;

  const resistances = clusterLevels(swingHighs.filter((h) => h > price), tol)
    .sort((x, y) => x.price - y.price)
    .slice(0, maxLevels);
  const supports = clusterLevels(swingLows.filter((l) => l < price), tol)
    .sort((x, y) => y.price - x.price)
    .slice(0, maxLevels);

  const p = (last.high + last.low + last.close) / 3;
  const range = last.high - last.low;
  return {
    supports,
    resistances,
    pivot: { p, r1: 2 * p - last.low, s1: 2 * p - last.high, r2: p + range, s2: p - range },
  };
}

/* --------------------------------------------------------- pattern scan */

export type Pattern = { id: string; name: string; detected: boolean; detail: string };

/** Simple, honest pattern checks over the close series. */
export function detectPatterns(prices: Series): Pattern[] {
  const n = prices.length;
  const s20 = smaLine(prices, 20);
  const s50 = smaLine(prices, 50);
  const out: Pattern[] = [];

  // Golden / death cross within the last 5 bars
  let golden = false;
  let death = false;
  for (let i = Math.max(51, n - 5); i < n; i++) {
    if (isNaN(s20[i]) || isNaN(s50[i]) || isNaN(s20[i - 1]) || isNaN(s50[i - 1])) continue;
    if (s20[i - 1] <= s50[i - 1] && s20[i] > s50[i]) golden = true;
    if (s20[i - 1] >= s50[i - 1] && s20[i] < s50[i]) death = true;
  }
  out.push({
    id: "golden",
    name: "Golden cross (SMA20 × SMA50)",
    detected: golden,
    detail: golden ? "SMA20 crossed above SMA50 in the last 5 bars" : "No recent bullish cross",
  });
  out.push({
    id: "death",
    name: "Death cross (SMA20 × SMA50)",
    detected: death,
    detail: death ? "SMA20 crossed below SMA50 in the last 5 bars" : "No recent bearish cross",
  });

  // Bollinger squeeze: current 20-bar σ in the bottom quartile of recent σs
  if (n >= 60) {
    const sigmas: number[] = [];
    for (let i = 19; i < n; i++) {
      sigmas.push(stdDev(prices.slice(i - 19, i + 1), false));
    }
    const current = sigmas[sigmas.length - 1];
    const sorted = [...sigmas].sort((a, b) => a - b);
    const q25 = sorted[Math.floor(sorted.length * 0.25)];
    const squeezed = current <= q25;
    out.push({
      id: "squeeze",
      name: "Bollinger squeeze",
      detected: squeezed,
      detail: squeezed
        ? "Volatility compressed to the bottom quartile — breakouts often follow"
        : "Bands at normal width",
    });
  }

  // 52-bar breakout
  if (n >= 53) {
    const prevMax = Math.max(...prices.slice(n - 53, n - 1));
    const breakout = prices[n - 1] >= prevMax;
    out.push({
      id: "breakout",
      name: "52-bar high breakout",
      detected: breakout,
      detail: breakout ? `Close ${fmt(prices[n - 1])} printed a fresh 52-bar high` : "Below the recent high",
    });
  }

  // Trend structure from the last three 10-bar segment extremes
  if (n >= 30) {
    const seg = 10;
    const highsSeq: number[] = [];
    const lowsSeq: number[] = [];
    for (let s = 3; s >= 1; s--) {
      const slice = prices.slice(n - s * seg, n - (s - 1) * seg);
      highsSeq.push(Math.max(...slice));
      lowsSeq.push(Math.min(...slice));
    }
    const hh = highsSeq[0] < highsSeq[1] && highsSeq[1] < highsSeq[2];
    const hl = lowsSeq[0] < lowsSeq[1] && lowsSeq[1] < lowsSeq[2];
    const lh = highsSeq[0] > highsSeq[1] && highsSeq[1] > highsSeq[2];
    const ll = lowsSeq[0] > lowsSeq[1] && lowsSeq[1] > lowsSeq[2];
    if (hh && hl) {
      out.push({ id: "structure", name: "Uptrend structure", detected: true, detail: "Higher highs and higher lows across the last 30 bars" });
    } else if (lh && ll) {
      out.push({ id: "structure", name: "Downtrend structure", detected: true, detail: "Lower highs and lower lows across the last 30 bars" });
    } else {
      out.push({ id: "structure", name: "Range structure", detected: true, detail: "No clean higher-high/lower-low sequence — sideways" });
    }
  }

  return out;
}

/* ------------------------------------------------------------ formatting */

export function fmt(n: number, dp = 2): string {
  if (!isFinite(n)) return "∞";
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function pct(n: number, dp = 2): string {
  return `${(n * 100).toFixed(dp)}%`;
}
