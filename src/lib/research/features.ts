// Research Engine — Layer 3: feature engineering.
//
// Builds a large, flat vector of deterministically-derived quantitative
// features. Two hard rules:
//
//   1. Every value is computed from actual market data — nothing is sampled,
//      estimated by an LLM, or defaulted to a plausible constant. Features
//      that cannot be computed from the available history are OMITTED, not
//      zero-filled, so the count shown in the UI is the count that exists.
//   2. Everything reuses the verified primitives in quant.ts/forecast.ts —
//      no formula exists in two places.

import {
  smaLine, ema, rsi, macd, atr, bollinger, logReturns, mean, stdDev,
  linearRegression, volatility, sharpe, supportResistance, type Ohlc,
} from "@/lib/quant";
import type { FeatureVector, PriceData, IndexData } from "./types";

const WINDOWS = [5, 10, 20, 50, 100, 200];

/**
 * Wilder's ADX(14) with +DI/−DI.
 *
 *   +DM = H−H₋₁ when it exceeds L₋₁−L and 0 otherwise; −DM symmetric.
 *   TR, +DM, −DM are Wilder-accumulated (Sₜ = Sₜ₋₁ − Sₜ₋₁/n + Xₜ),
 *   ±DI = 100·(±DMₙ/TRₙ),  DX = 100·|+DI−−DI|/(+DI+−DI),
 *   ADX = Wilder-smoothed DX.
 */
export function adx(
  bars: Ohlc[],
  period = 14,
): { adx: number; plusDi: number; minusDi: number } | null {
  if (bars.length < period * 2 + 1) return null;
  const tr: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    ));
  }
  const wilder = (xs: number[]) => {
    let s = xs.slice(0, period).reduce((a, b) => a + b, 0);
    const out = [s];
    for (let i = period; i < xs.length; i++) {
      s = s - s / period + xs[i];
      out.push(s);
    }
    return out;
  };
  const trN = wilder(tr);
  const pN = wilder(plusDm);
  const mN = wilder(minusDm);
  const dx: number[] = [];
  let lastPlus = 0;
  let lastMinus = 0;
  for (let i = 0; i < trN.length; i++) {
    if (trN[i] <= 0) continue;
    const pdi = (100 * pN[i]) / trN[i];
    const mdi = (100 * mN[i]) / trN[i];
    lastPlus = pdi;
    lastMinus = mdi;
    const sum = pdi + mdi;
    if (sum > 0) dx.push((100 * Math.abs(pdi - mdi)) / sum);
  }
  if (dx.length < period) return null;
  let a = mean(dx.slice(0, period));
  for (let i = period; i < dx.length; i++) a = (a * (period - 1) + dx[i]) / period;
  return { adx: a, plusDi: lastPlus, minusDi: lastMinus };
}

/** Sample skewness of a series (Fisher-Pearson, bias-adjusted). */
export function skewness(xs: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const m = mean(xs);
  const s = stdDev(xs, true);
  if (s === 0) return 0;
  const cubed = xs.reduce((a, x) => a + ((x - m) / s) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * cubed;
}

/** Excess kurtosis (0 for a normal distribution), bias-adjusted. */
export function excessKurtosis(xs: number[]): number {
  const n = xs.length;
  if (n < 4) return NaN;
  const m = mean(xs);
  const s = stdDev(xs, true);
  if (s === 0) return 0;
  const quart = xs.reduce((a, x) => a + ((x - m) / s) ** 4, 0);
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * quart -
    (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
}

/** Annualised downside deviation vs a zero target: √(mean(min(r,0)²))·√252. */
export function downsideDeviation(logRets: number[]): number {
  if (logRets.length < 2) return NaN;
  const sq = logRets.reduce((a, r) => a + Math.min(0, r) ** 2, 0) / logRets.length;
  return Math.sqrt(sq) * Math.sqrt(252);
}

/** Max drawdown of a close series, as a positive fraction (0.18 = −18%). */
export function maxDrawdown(closes: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const c of closes) {
    peak = Math.max(peak, c);
    if (peak > 0) worst = Math.max(worst, (peak - c) / peak);
  }
  return worst;
}

/** Pearson correlation of two equal-length series. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  const ma = mean(a.slice(-n));
  const mb = mean(b.slice(-n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[a.length - n + i] - ma;
    const xb = b[b.length - n + i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : NaN;
}

/** OLS beta of asset log-returns on benchmark log-returns. */
export function beta(assetCloses: number[], benchCloses: number[]): number {
  const ra = logReturns(assetCloses);
  const rb = logReturns(benchCloses);
  const n = Math.min(ra.length, rb.length);
  if (n < 10) return NaN;
  const a = ra.slice(-n);
  const b = rb.slice(-n);
  const mb = mean(b);
  const ma = mean(a);
  let cov = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    varB += (b[i] - mb) ** 2;
  }
  return varB > 0 ? cov / varB : NaN;
}

export function buildFeatures(price: PriceData, index: IndexData | null): FeatureVector {
  const closes = price.bars.map((b) => b.close);
  const n = closes.length;
  const last = closes[n - 1];
  const features: Record<string, number> = {};
  const groups: Record<string, string[]> = {};

  const put = (group: string, name: string, value: number) => {
    if (!Number.isFinite(value)) return; // omit, never zero-fill
    features[name] = value;
    (groups[group] ??= []).push(name);
  };

  /* ---- returns & momentum across horizons ---- */
  for (const w of WINDOWS) {
    if (n > w) {
      put("momentum", `return_${w}d`, last / closes[n - 1 - w] - 1);
      const lr = logReturns(closes.slice(-(w + 1)));
      put("volatility", `vol_${w}d_ann`, stdDev(lr, true) * Math.sqrt(252));
    }
  }
  put("momentum", "return_1d", n > 1 ? last / closes[n - 2] - 1 : NaN);

  /* ---- moving averages: value, price distance, slope ---- */
  for (const w of WINDOWS) {
    if (n < w) continue;
    const s = smaLine(closes, w);
    const sv = s[n - 1];
    put("trend", `sma_${w}`, sv);
    put("trend", `price_vs_sma_${w}`, last / sv - 1);
    if (n >= w + 5 && Number.isFinite(s[n - 6])) {
      put("trend", `sma_${w}_slope_5d`, sv / s[n - 6] - 1);
    }
    const e = ema(closes, w).value;
    put("trend", `ema_${w}`, e);
    put("trend", `price_vs_ema_${w}`, last / e - 1);
  }

  /* ---- oscillators ---- */
  const r = rsi(closes, 14);
  put("oscillator", "rsi_14", r.rsi);
  const rsiLineVals = r.line.filter(Number.isFinite);
  if (rsiLineVals.length > 5) {
    put("oscillator", "rsi_14_mean_20d", mean(rsiLineVals.slice(-20)));
  }
  const m = macd(closes);
  put("oscillator", "macd", m.lastMacd);
  put("oscillator", "macd_signal", m.lastSignal);
  put("oscillator", "macd_hist", m.lastHist);
  const histVals = m.hist.filter(Number.isFinite);
  if (histVals.length > 10) {
    const hs = stdDev(histVals.slice(-60), true);
    if (hs > 0) put("oscillator", "macd_hist_z", m.lastHist / hs);
  }

  /* ---- bands & range ---- */
  if (n >= 20) {
    const b = bollinger(closes, 20, 2);
    put("bands", "boll_mid", b.mid);
    put("bands", "boll_width", b.width);
    if (b.upper !== b.lower) {
      put("bands", "boll_pctB", (last - b.lower) / (b.upper - b.lower));
    }
  }
  const ohlc: Ohlc[] = price.bars
    .filter((b) => b.high != null && b.low != null)
    .map((b) => ({ high: b.high!, low: b.low!, close: b.close }));
  const a = ohlc.length > 15 ? atr(ohlc, 14) : null;
  if (a) {
    put("bands", "atr_14", a.atr);
    put("bands", "atr_pct", a.pct);
  }
  const dmi = adx(ohlc, 14);
  if (dmi) {
    put("oscillator", "adx_14", dmi.adx);
    put("oscillator", "plus_di_14", dmi.plusDi);
    put("oscillator", "minus_di_14", dmi.minusDi);
  }

  /* ---- volume profile: how volume distributed across the price range ---- */
  {
    const withVol = price.bars.filter((b) => b.volume != null && b.volume > 0);
    if (withVol.length > 30) {
      const lo = Math.min(...withVol.map((b) => b.close));
      const hi = Math.max(...withVol.map((b) => b.close));
      if (hi > lo) {
        const buckets = new Array(10).fill(0);
        let total = 0;
        for (const b of withVol) {
          const idx = Math.min(9, Math.floor(((b.close - lo) / (hi - lo)) * 10));
          buckets[idx] += b.volume!;
          total += b.volume!;
        }
        if (total > 0) {
          buckets.forEach((v, i) => put("volume_profile", `vp_bucket_${i}`, v / total));
          // Point of control: the bucket midprice holding the most volume,
          // expressed as distance from the current price.
          const poc = buckets.indexOf(Math.max(...buckets));
          const pocPrice = lo + ((poc + 0.5) / 10) * (hi - lo);
          put("volume_profile", "poc_price", pocPrice);
          put("volume_profile", "price_vs_poc", last / pocPrice - 1);
        }
      }
    }
  }

  /* ---- regression & risk ---- */
  const reg = linearRegression(closes, 0);
  put("regression", "ols_slope", reg.slope);
  put("regression", "ols_t_stat", reg.tStat);
  put("regression", "ols_r2", reg.r2);
  put("risk", "vol_daily", volatility(closes).daily);
  put("risk", "vol_annual", volatility(closes).annualized);
  put("risk", "sharpe", sharpe(closes).sharpe);
  put("risk", "max_drawdown", maxDrawdown(closes));
  for (const w of WINDOWS) {
    if (n > w) {
      put("risk", `max_drawdown_${w}d`, maxDrawdown(closes.slice(-w)));
      put("risk", `sharpe_${w}d`, sharpe(closes.slice(-(w + 1))).sharpe);
    }
  }

  /* ---- return distribution shape & downside risk ---- */
  const allRets = logReturns(closes);
  if (allRets.length > 10) {
    put("distribution", "returns_skewness", skewness(allRets));
    put("distribution", "returns_excess_kurtosis", excessKurtosis(allRets));
    const dd = downsideDeviation(allRets);
    put("distribution", "downside_deviation_ann", dd);
    // Sortino: same numerator as Sharpe, downside deviation as denominator.
    const annRet = mean(allRets) * 252;
    if (dd > 0) put("risk", "sortino", (annRet - 0.065) / dd);
    put("distribution", "up_day_share", allRets.filter((r) => r > 0).length / allRets.length);
    // Longest consecutive up/down streaks — persistence of the tape.
    let upStreak = 0, downStreak = 0, curUp = 0, curDown = 0;
    for (const r of allRets) {
      curUp = r > 0 ? curUp + 1 : 0;
      curDown = r < 0 ? curDown + 1 : 0;
      upStreak = Math.max(upStreak, curUp);
      downStreak = Math.max(downStreak, curDown);
    }
    put("distribution", "longest_up_streak", upStreak);
    put("distribution", "longest_down_streak", downStreak);
  }

  /* ---- volume ---- */
  const vols = price.bars.map((b) => b.volume).filter((v): v is number => v != null && v > 0);
  if (vols.length > 20) {
    const v20 = mean(vols.slice(-20));
    put("volume", "volume_last", vols[vols.length - 1]);
    put("volume", "volume_avg_20d", v20);
    if (v20 > 0) put("volume", "volume_ratio_20d", vols[vols.length - 1] / v20);
    // Liquidity: median daily traded value (₹), log10-scaled for readability.
    const traded = price.bars
      .filter((b) => b.volume != null && b.volume > 0)
      .map((b) => b.close * b.volume!);
    const sortedTv = [...traded].sort((x, y) => x - y);
    const medianTv = sortedTv[Math.floor(sortedTv.length / 2)];
    if (medianTv > 0) put("volume", "liquidity_log10_traded_value", Math.log10(medianTv));
    // VWAP over the last 20 bars with volume.
    const withVol = price.bars.filter((b) => b.volume != null && b.volume > 0).slice(-20);
    const pv = withVol.reduce((acc, b) => acc + b.close * b.volume!, 0);
    const vv = withVol.reduce((acc, b) => acc + b.volume!, 0);
    if (vv > 0) {
      const vwap = pv / vv;
      put("volume", "vwap_20d", vwap);
      put("volume", "price_vs_vwap_20d", last / vwap - 1);
    }
  }

  /* ---- gaps & seasonality (needs OHLC / timestamps) ---- */
  if (ohlc.length > 20) {
    let gaps = 0;
    for (let i = 1; i < price.bars.length; i++) {
      const o = price.bars[i].open;
      const prevC = price.bars[i - 1].close;
      if (o != null && prevC > 0 && Math.abs(o / prevC - 1) > 0.01) gaps++;
    }
    put("structure", "gap_frequency", gaps / (price.bars.length - 1));
  }
  {
    // Mean 1-day return by weekday (Mon..Fri), from real timestamps.
    const byDay: number[][] = [[], [], [], [], []];
    for (let i = 1; i < price.bars.length; i++) {
      const d = new Date(price.bars[i].time).getDay();
      if (d >= 1 && d <= 5 && closes[i - 1] > 0) {
        byDay[d - 1].push(closes[i] / closes[i - 1] - 1);
      }
    }
    const names = ["mon", "tue", "wed", "thu", "fri"];
    byDay.forEach((bucket, i) => {
      if (bucket.length >= 4) put("seasonality", `mean_return_${names[i]}`, mean(bucket));
    });
  }

  /* ---- support / resistance strength ---- */
  const lv = ohlc.length > 10 ? supportResistance(ohlc, 3) : null;
  if (lv) {
    lv.supports.forEach((s, i) => {
      put("levels", `support_${i + 1}_dist`, last / s.price - 1);
      put("levels", `support_${i + 1}_touches`, s.touches);
    });
    lv.resistances.forEach((rz, i) => {
      put("levels", `resistance_${i + 1}_dist`, rz.price / last - 1);
      put("levels", `resistance_${i + 1}_touches`, rz.touches);
    });
    put("levels", "pivot_p", lv.pivot.p);
  }

  /* ---- benchmark-relative (needs index series) ---- */
  if (index && index.closes.length > 20) {
    const b = beta(closes, index.closes);
    put("benchmark", "beta_vs_index", b);
    // Treynor: excess return per unit of systematic (beta) risk.
    if (Number.isFinite(b) && Math.abs(b) > 0.05) {
      const annRet = mean(logReturns(closes)) * 252;
      put("benchmark", "treynor", (annRet - 0.065) / b);
    }
    for (const w of [20, 60]) {
      const ra = logReturns(closes.slice(-(w + 1)));
      const rb = logReturns(index.closes.slice(-(w + 1)));
      if (ra.length >= w - 2 && rb.length >= w - 2) {
        put("benchmark", `corr_index_${w}d`, correlation(ra, rb));
      }
    }
    const iN = index.closes.length;
    for (const w of [20, 60]) {
      if (n > w && iN > w) {
        const assetRet = last / closes[n - 1 - w] - 1;
        const idxRet = index.closes[iN - 1] / index.closes[iN - 1 - w] - 1;
        put("benchmark", `excess_return_${w}d`, assetRet - idxRet);
      }
    }
  }

  /* ---- range position ---- */
  for (const w of [20, 52, Math.min(n, 252)]) {
    if (n >= w) {
      const win = closes.slice(-w);
      const hi = Math.max(...win);
      const lo = Math.min(...win);
      if (hi > lo) put("structure", `range_position_${w}d`, (last - lo) / (hi - lo));
      put("structure", `dist_from_high_${w}d`, last / hi - 1);
    }
  }

  return { features, groups, count: Object.keys(features).length };
}
