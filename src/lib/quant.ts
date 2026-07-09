// A small, honest technical-analysis toolkit. Every function returns both the
// result and the intermediate numbers so the UI can show its working.

export type Series = number[];

export function returns(prices: Series): Series {
  const out: Series = [];
  for (let i = 1; i < prices.length; i++) out.push((prices[i] - prices[i - 1]) / prices[i - 1]);
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

/** Exponential moving average — returns the final value and the smoothing k. */
export function ema(prices: Series, period: number): { value: number; k: number; line: number[] } {
  const k = 2 / (period + 1);
  const line: number[] = [];
  let prev = prices[0];
  line.push(prev);
  for (let i = 1; i < prices.length; i++) {
    prev = prices[i] * k + prev * (1 - k);
    line.push(prev);
  }
  return { value: prev, k, line };
}

export type RsiResult = { rsi: number; avgGain: number; avgLoss: number; rs: number; period: number };

/** RSI over `period` (default 14), simple-average variant. */
export function rsi(prices: Series, period = 14): RsiResult {
  const deltas: number[] = [];
  for (let i = 1; i < prices.length; i++) deltas.push(prices[i] - prices[i - 1]);
  const window = deltas.slice(-period);
  const gains = window.filter((d) => d > 0);
  const losses = window.filter((d) => d < 0).map((d) => -d);
  const avgGain = gains.length ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / period : 0;
  const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  const rsiVal = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
  return { rsi: rsiVal, avgGain, avgLoss, rs, period };
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

/** Return volatility from daily returns, annualised by √252. */
export function volatility(prices: Series): Volatility {
  const rs = returns(prices);
  const daily = stdDev(rs, true);
  return { daily, annualized: daily * Math.sqrt(252), n: rs.length };
}

export type Regression = {
  slope: number;
  intercept: number;
  r2: number;
  forecast: number[];
  fitted: number[];
};

/** Ordinary least squares of price on time index, plus an h-step forecast. */
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
  const forecast = Array.from({ length: horizon }, (_, h) => slope * (n - 1 + h + 1) + intercept);
  return { slope, intercept, r2, forecast, fitted };
}

export type Sharpe = { sharpe: number; meanRet: number; sigma: number; rf: number };

/** Annualised Sharpe ratio from daily returns (rf is an annual rate). */
export function sharpe(prices: Series, rf = 0.065): Sharpe {
  const rs = returns(prices);
  const meanRet = mean(rs);
  const sigma = stdDev(rs, true);
  const annRet = meanRet * 252;
  const annVol = sigma * Math.sqrt(252);
  const sh = annVol === 0 ? 0 : (annRet - rf) / annVol;
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

/** MACD(12,26,9): EMA_fast − EMA_slow, signal = EMA9 of MACD, hist = MACD − signal. */
export function macd(prices: Series, fast = 12, slow = 26, signalPeriod = 9): Macd {
  const eFast = ema(prices, fast).line;
  const eSlow = ema(prices, slow).line;
  const macdLine = prices.map((_, i) => eFast[i] - eSlow[i]);
  const signalLine = ema(macdLine, signalPeriod).line;
  const hist = macdLine.map((m, i) => m - signalLine[i]);
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

export type Levels = {
  supports: number[]; // nearest below price, descending
  resistances: number[]; // nearest above price, ascending
  pivot: { p: number; r1: number; s1: number };
};

/**
 * Swing-point S/R: fractal highs/lows (extreme vs 2 neighbours each side),
 * split around the current price; plus the classic floor-trader pivot from
 * the latest bar: P=(H+L+C)/3, R1=2P−L, S1=2P−H.
 */
export function supportResistance(bars: Ohlc[], maxLevels = 2): Levels | null {
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
  const resistances = Array.from(new Set(swingHighs.filter((h) => h > price)))
    .sort((a, b) => a - b)
    .slice(0, maxLevels);
  const supports = Array.from(new Set(swingLows.filter((l) => l < price)))
    .sort((a, b) => b - a)
    .slice(0, maxLevels);
  const p = (last.high + last.low + last.close) / 3;
  return { supports, resistances, pivot: { p, r1: 2 * p - last.low, s1: 2 * p - last.high } };
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
