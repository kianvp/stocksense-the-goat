// Forecast engine: three genuinely different models computed in TypeScript,
// combined into an ensemble with 95% confidence intervals. These are the
// browser-runnable cousins of the heavyweight stacks (Prophet ≈ trend +
// seasonality decomposition, ARIMA ≈ autoregression, smoothing family ≈ Holt)
// — every fitted parameter is returned so the UI can show the math.

import { mean, stdDev, logReturns, returns, linearRegression, fmt } from "./quant";

export type ModelForecast = {
  id: string;
  name: string;
  family: string;
  formula: string;
  params: string;
  path: number[]; // length = horizon
  target: number; // last point of path
  /** Walk-forward one-step RMSE (in price units); lower is better. */
  rmse?: number;
  /** Walk-forward mean absolute error (price units). */
  mae?: number;
  /** Walk-forward mean absolute percentage error, as a fraction. */
  mape?: number;
  /** Share of walk-forward origins where the predicted direction was right. */
  dirAcc?: number;
  /** Ensemble weight actually applied, ∝ 1/MSE. */
  weight?: number;
};

/** Diagnostics for the random-walk baseline the models must beat. */
export type BaselineDiagnostics = {
  rmse: number;
  mae: number;
  mape: number;
  /** Directional accuracy of the majority-class ("always up") guess. */
  dirAcc: number;
  n: number;
};

export type EnsembleForecast = {
  models: ModelForecast[];
  ensemble: number[];
  upper: number[]; // 95% CI
  lower: number[];
  sigmaDaily: number;
  horizon: number;
  z: number;
  /** Std-dev of the h-step forecast in log space, per horizon step. */
  sigmaPath: number[];
  /** Backtest sample size behind the weights (0 = equal weights used). */
  backtestN: number;
};

/** Trading days per year — the standard annualisation base. */
export const TRADING_DAYS = 252;

/* ------------------------------------------------ 1. trend + seasonality */

/**
 * OLS trend plus day-of-week seasonality on the detrended residuals — a
 * miniature Prophet-style decomposition:  ŷ(t) = β·t + α + s(weekday(t))
 *
 * `timestamps` (epoch MILLISECONDS, one per price) are what make the seasonal term
 * real. The previous version bucketed on `i % 5`, which only equals the
 * weekday if the series starts on a Monday and never skips a session — and
 * the NSE calendar is full of holidays, so in practice the buckets drifted and
 * mixed all five weekdays together. Without timestamps the seasonal term is
 * held at zero rather than fabricating a cycle, so the model degrades to a
 * pure trend instead of quietly reporting a meaningless one.
 */
export function trendSeasonalForecast(
  prices: number[],
  horizon = 7,
  timestamps?: number[],
): ModelForecast {
  const n = prices.length;
  const reg = linearRegression(prices, 0);
  const residuals = prices.map((p, i) => p - (reg.slope * i + reg.intercept));

  const haveDates = !!timestamps && timestamps.length === prices.length;
  // Mon–Fri buckets (JS getDay: 1..5).
  const seasonal = [0, 0, 0, 0, 0];
  if (haveDates) {
    for (let d = 1; d <= 5; d++) {
      const bucket = residuals.filter((_, i) => new Date(timestamps![i]).getDay() === d);
      seasonal[d - 1] = bucket.length >= 3 ? mean(bucket) : 0;
    }
  }

  /** Weekday index (0=Mon..4=Fri) of the h-th future *trading* day. */
  function futureWeekday(h: number): number {
    if (!haveDates) return -1;
    const d = new Date(timestamps![n - 1]);
    let added = 0;
    while (added <= h) {
      d.setDate(d.getDate() + 1);
      const wd = d.getDay();
      if (wd >= 1 && wd <= 5) added++; // skip weekends
    }
    return d.getDay() - 1;
  }

  const path = Array.from({ length: horizon }, (_, h) => {
    const t = n + h;
    const wd = futureWeekday(h);
    const s = wd >= 0 && wd < 5 ? seasonal[wd] : 0;
    return reg.slope * t + reg.intercept + s;
  });

  const amp = Math.max(...seasonal) - Math.min(...seasonal);
  return {
    id: "trend",
    name: haveDates ? "Trend + weekday seasonality" : "Linear trend (OLS)",
    family: "Prophet-style decomposition",
    formula: haveDates ? "ŷ(t) = β·t + α + s(weekday)" : "ŷ(t) = β·t + α",
    params:
      `β = ${fmt(reg.slope, 3)}/bar, α = ${fmt(reg.intercept)}, R² = ${fmt(reg.r2, 3)}, ` +
      `t = ${fmt(reg.tStat, 2)}` +
      (haveDates ? `, seasonal amp = ${fmt(amp)}` : ", seasonality off (no dates)"),
    path,
    target: path[path.length - 1],
  };
}

/* ---------------------------------------------------- 2. autoregression */

/** Solve the (small) normal equations Ax = b by Gaussian elimination. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * AR(p) on daily returns (the stationary series — this is the "I" in ARIMA):
 * rₜ = c + φ₁rₜ₋₁ + … + φₚrₜ₋ₚ, fit by OLS, then iterate forward and
 * integrate the forecast returns back into a price path.
 */
export function arForecast(prices: number[], horizon = 7, p = 3): ModelForecast {
  const r = returns(prices);
  const rows: number[][] = [];
  const ys: number[] = [];
  for (let t = p; t < r.length; t++) {
    rows.push([1, ...Array.from({ length: p }, (_, k) => r[t - 1 - k])]);
    ys.push(r[t]);
  }
  // Normal equations XᵀX β = Xᵀy
  const k = p + 1;
  const XtX: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty: number[] = Array(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += rows[i][a] * ys[i];
      for (let b = 0; b < k; b++) XtX[a][b] += rows[i][a] * rows[i][b];
    }
  }
  const beta = solve(XtX, Xty) ?? [mean(r), ...Array(p).fill(0)];
  const [c, ...phis] = beta;

  const recent = r.slice(-p);
  const futureR: number[] = [];
  const lags = [...recent].reverse(); // lags[0] = most recent return
  for (let h = 0; h < horizon; h++) {
    const rHat = c + phis.reduce((acc, phi, i) => acc + phi * (lags[i] ?? 0), 0);
    futureR.push(rHat);
    lags.unshift(rHat);
    lags.length = p;
  }
  const path: number[] = [];
  let price = prices[prices.length - 1];
  for (const rr of futureR) {
    price = price * (1 + rr);
    path.push(price);
  }
  return {
    id: "ar",
    name: `AR(${p}) autoregression`,
    family: "ARIMA family",
    formula: "rₜ = c + φ₁rₜ₋₁ + φ₂rₜ₋₂ + φ₃rₜ₋₃",
    params: `c = ${(c * 100).toFixed(3)}%, φ = [${phis.map((x) => fmt(x, 3)).join(", ")}]`,
    path,
    target: path[path.length - 1],
  };
}

/* ------------------------------------------------------ 3. Holt smoothing */

/** One pass of Holt's recursion; returns the final state and in-sample SSE. */
function holtPass(prices: number[], alpha: number, beta: number) {
  let level = prices[0];
  let trend = prices.length > 1 ? prices[1] - prices[0] : 0;
  let sse = 0;
  for (let i = 1; i < prices.length; i++) {
    const forecast = level + trend; // one-step-ahead, made before seeing prices[i]
    const err = prices[i] - forecast;
    sse += err * err;
    const prevLevel = level;
    level = alpha * prices[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return { level, trend, sse };
}

/**
 * Holt's linear (double exponential) smoothing:
 *
 *   ℓₜ = αPₜ + (1−α)(ℓₜ₋₁ + bₜ₋₁)          level
 *   bₜ = β(ℓₜ − ℓₜ₋₁) + (1−β)bₜ₋₁          trend
 *   ŷ(h) = ℓ + h·b
 *
 * α and β are **fitted**, not assumed: a coarse-to-fine grid search minimises
 * the one-step-ahead SSE. Hard-coding α=0.5, β=0.3 (the previous behaviour)
 * imposes the same responsiveness on a placid index and a volatile small-cap;
 * fitting lets the smoother match the series it was actually given.
 */
export function holtForecast(
  prices: number[],
  horizon = 7,
  alpha?: number,
  beta?: number,
): ModelForecast {
  let a = alpha ?? 0.5;
  let b = beta ?? 0.3;
  let fitted = false;

  if (alpha === undefined || beta === undefined) {
    // Coarse grid, then refine around the winner. Endpoints avoided: α or β
    // exactly 0/1 degenerates (no learning, or no smoothing at all).
    let best = { a, b, sse: Infinity };
    for (let ai = 1; ai <= 9; ai++) {
      for (let bi = 1; bi <= 9; bi++) {
        const ca = ai / 10;
        const cb = bi / 10;
        const { sse } = holtPass(prices, ca, cb);
        if (sse < best.sse) best = { a: ca, b: cb, sse };
      }
    }
    for (let ai = -4; ai <= 4; ai++) {
      for (let bi = -4; bi <= 4; bi++) {
        const ca = Math.min(0.99, Math.max(0.01, best.a + ai / 100));
        const cb = Math.min(0.99, Math.max(0.01, best.b + bi / 100));
        const { sse } = holtPass(prices, ca, cb);
        if (sse < best.sse) best = { a: ca, b: cb, sse };
      }
    }
    a = best.a;
    b = best.b;
    fitted = true;
  }

  const { level, trend, sse } = holtPass(prices, a, b);
  const path = Array.from({ length: horizon }, (_, h) => level + (h + 1) * trend);
  const rmse = prices.length > 1 ? Math.sqrt(sse / (prices.length - 1)) : 0;
  return {
    id: "holt",
    name: "Holt exponential smoothing",
    family: "Smoothing family",
    formula: "ℓₜ = αPₜ + (1−α)(ℓₜ₋₁+bₜ₋₁);  ŷ(h) = ℓ + h·b",
    params:
      `α = ${fmt(a, 2)}, β = ${fmt(b, 2)}${fitted ? " (fitted, min SSE)" : ""}, ` +
      `ℓ = ${fmt(level)}, b = ${fmt(trend, 3)}/bar, in-sample RMSE = ${fmt(rmse)}`,
    path,
    target: path[path.length - 1],
  };
}

/* ------------------------------------------------------------- ensemble */

/** Fits all three models on a price window and returns their h-step paths. */
function fitAll(prices: number[], horizon: number, timestamps?: number[]): ModelForecast[] {
  return [
    trendSeasonalForecast(prices, horizon, timestamps),
    arForecast(prices, horizon, 3),
    holtForecast(prices, horizon),
  ];
}

/**
 * Walk-forward backtest: at each origin t the models see only prices[0..t] and
 * predict t+1, which is then scored against the actual. This is genuine
 * out-of-sample error — no look-ahead — and it's what earns each model its
 * ensemble weight.
 */
export function backtestDiagnostics(
  prices: number[],
  timestamps: number[] | undefined,
  origins = 24,
): {
  rmse: number[];
  mae: number[];
  mape: number[];
  dirAcc: number[];
  baseline: BaselineDiagnostics;
  n: number;
} {
  const minTrain = 40;
  const start = Math.max(minTrain, prices.length - origins);
  const empty: BaselineDiagnostics = { rmse: 0, mae: 0, mape: 0, dirAcc: 0, n: 0 };
  if (prices.length - start < 5) {
    return { rmse: [0, 0, 0], mae: [0, 0, 0], mape: [0, 0, 0], dirAcc: [0, 0, 0], baseline: empty, n: 0 };
  }

  const se = [0, 0, 0];
  const ae = [0, 0, 0];
  const ape = [0, 0, 0];
  const dirHit = [0, 0, 0];
  // Random walk (P̂ₜ₊₁ = Pₜ) for the error metrics; "always up" (the majority
  // class in equity series) for direction — a flat guess has no direction.
  let bSe = 0, bAe = 0, bApe = 0, bDir = 0;
  let n = 0;

  for (let t = start; t < prices.length; t++) {
    const train = prices.slice(0, t);
    const ts = timestamps?.slice(0, t);
    const actual = prices[t];
    const prev = train[train.length - 1];
    const preds = fitAll(train, 1, ts);
    for (let m = 0; m < preds.length; m++) {
      const p = preds[m].path[0];
      const e = p - actual;
      if (!isFinite(e)) continue;
      se[m] += e * e;
      ae[m] += Math.abs(e);
      if (actual !== 0) ape[m] += Math.abs(e / actual);
      if ((p - prev) * (actual - prev) > 0) dirHit[m]++;
    }
    const be = prev - actual;
    bSe += be * be;
    bAe += Math.abs(be);
    if (actual !== 0) bApe += Math.abs(be / actual);
    if (actual > prev) bDir++;
    n++;
  }

  const div = Math.max(1, n);
  return {
    rmse: se.map((s) => Math.sqrt(s / div)),
    mae: ae.map((s) => s / div),
    mape: ape.map((s) => s / div),
    dirAcc: dirHit.map((s) => s / div),
    baseline: { rmse: Math.sqrt(bSe / div), mae: bAe / div, mape: bApe / div, dirAcc: bDir / div, n },
    n,
  };
}

/**
 * Ensemble forecast with an honest uncertainty band.
 *
 * **Weighting** — models are combined ∝ 1/MSE from the walk-forward backtest,
 * so a model that has actually been predicting well counts for more. With too
 * little history to backtest, weights fall back to equal.
 *
 * **Interval** — computed in LOG space and driven by two sources of variance:
 *
 *   σ_rw(h)   = σ_logret · √h            diffusion of the underlying process
 *   σ_disp(h) = stdev over models of ln(path_i(h))   model disagreement
 *   σ_tot(h)  = √(σ_rw² + σ_disp²)
 *   band      = ŷ(h) · exp(±z·σ_tot(h)),  z = 1.96
 *
 * Two things this fixes. The old band was ±z·σ·P_last·√h — additive, pinned to
 * *today's* price, and symmetric, so it could imply a negative price and never
 * widened as the models themselves diverged. Working in log space makes the
 * band multiplicative (strictly positive, right-skewed like real prices) and
 * folding in dispersion means the cone widens when the models disagree, which
 * is exactly when you should trust the point forecast least.
 */
export function ensembleForecast(
  prices: number[],
  horizon = 7,
  timestamps?: number[],
): EnsembleForecast {
  const models = fitAll(prices, horizon, timestamps);

  // Accuracy-weighted combination.
  const diag = backtestDiagnostics(prices, timestamps);
  const { rmse, n: backtestN } = diag;
  const usable = backtestN > 0 && rmse.every((r) => isFinite(r) && r > 0);
  const rawWeights = usable ? rmse.map((r) => 1 / (r * r)) : models.map(() => 1);
  const wSum = rawWeights.reduce((a, b) => a + b, 0);
  const weights = rawWeights.map((w) => w / wSum);
  models.forEach((m, i) => {
    m.rmse = usable ? rmse[i] : undefined;
    m.mae = usable ? diag.mae[i] : undefined;
    m.mape = usable ? diag.mape[i] : undefined;
    m.dirAcc = usable ? diag.dirAcc[i] : undefined;
    m.weight = weights[i];
  });

  const ensemble = Array.from({ length: horizon }, (_, h) =>
    models.reduce((acc, m, i) => acc + weights[i] * m.path[h], 0),
  );

  // Log-space uncertainty: diffusion + model disagreement.
  const sigmaDaily = stdDev(logReturns(prices), true);
  const z = 1.96;
  const sigmaPath: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  for (let h = 0; h < horizon; h++) {
    const sigmaRw = sigmaDaily * Math.sqrt(h + 1);
    const logPaths = models.map((m) => m.path[h]).filter((v) => v > 0).map((v) => Math.log(v));
    const sigmaDisp = logPaths.length > 1 ? stdDev(logPaths, true) : 0;
    const sigmaTot = Math.sqrt(sigmaRw * sigmaRw + sigmaDisp * sigmaDisp);
    sigmaPath.push(sigmaTot);
    upper.push(ensemble[h] * Math.exp(z * sigmaTot));
    lower.push(ensemble[h] * Math.exp(-z * sigmaTot));
  }

  return { models, ensemble, upper, lower, sigmaDaily, horizon, z, sigmaPath, backtestN };
}
