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

export function fmt(n: number, dp = 2): string {
  if (!isFinite(n)) return "∞";
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function pct(n: number, dp = 2): string {
  return `${(n * 100).toFixed(dp)}%`;
}
