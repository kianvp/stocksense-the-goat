// Forecast engine: three genuinely different models computed in TypeScript,
// combined into an ensemble with 95% confidence intervals. These are the
// browser-runnable cousins of the heavyweight stacks (Prophet ≈ trend +
// seasonality decomposition, ARIMA ≈ autoregression, smoothing family ≈ Holt)
// — every fitted parameter is returned so the UI can show the math.

import { mean, stdDev, returns, linearRegression, fmt } from "./quant";

export type ModelForecast = {
  id: string;
  name: string;
  family: string;
  formula: string;
  params: string;
  path: number[]; // length = horizon
  target: number; // last point of path
};

export type EnsembleForecast = {
  models: ModelForecast[];
  ensemble: number[];
  upper: number[]; // 95% CI
  lower: number[];
  sigmaDaily: number;
  horizon: number;
  z: number;
};

/* ------------------------------------------------ 1. trend + seasonality */

/**
 * OLS trend plus day-of-week (period-5) seasonality on the detrended
 * residuals — a miniature Prophet-style decomposition: ŷ = trend(t) + s(t mod 5).
 */
export function trendSeasonalForecast(prices: number[], horizon = 7): ModelForecast {
  const n = prices.length;
  const reg = linearRegression(prices, 0);
  const residuals = prices.map((p, i) => p - (reg.slope * i + reg.intercept));
  const seasonal = [0, 1, 2, 3, 4].map((j) => {
    const bucket = residuals.filter((_, i) => i % 5 === j);
    return bucket.length ? mean(bucket) : 0;
  });
  const path = Array.from({ length: horizon }, (_, h) => {
    const t = n + h;
    return reg.slope * t + reg.intercept + seasonal[t % 5];
  });
  const amp = Math.max(...seasonal) - Math.min(...seasonal);
  return {
    id: "trend",
    name: "Trend + weekly seasonality",
    family: "Prophet-style decomposition",
    formula: "ŷ(t) = β·t + α + s(t mod 5)",
    params: `β = ${fmt(reg.slope, 3)}/bar, α = ${fmt(reg.intercept)}, R² = ${fmt(reg.r2, 3)}, seasonal amp = ${fmt(amp)}`,
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

/**
 * Holt's double exponential smoothing (level + trend):
 * ℓₜ = αPₜ + (1−α)(ℓₜ₋₁+bₜ₋₁);  bₜ = β(ℓₜ−ℓₜ₋₁) + (1−β)bₜ₋₁;  ŷ(h) = ℓ + h·b
 */
export function holtForecast(prices: number[], horizon = 7, alpha = 0.5, beta = 0.3): ModelForecast {
  let level = prices[0];
  let trend = prices.length > 1 ? prices[1] - prices[0] : 0;
  for (let i = 1; i < prices.length; i++) {
    const prevLevel = level;
    level = alpha * prices[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  const path = Array.from({ length: horizon }, (_, h) => level + (h + 1) * trend);
  return {
    id: "holt",
    name: "Holt exponential smoothing",
    family: "Smoothing family",
    formula: "ℓₜ = αPₜ + (1−α)(ℓₜ₋₁+bₜ₋₁);  ŷ(h) = ℓ + h·b",
    params: `α = ${alpha}, β = ${beta}, ℓ = ${fmt(level)}, b = ${fmt(trend, 3)}/bar`,
    path,
    target: path[path.length - 1],
  };
}

/* ------------------------------------------------------------- ensemble */

/**
 * Equal-weight ensemble of the three models with a 95% CI that widens with
 * the horizon: CI(h) = z · σ_daily · P_last · √h, z = 1.96.
 */
export function ensembleForecast(prices: number[], horizon = 7): EnsembleForecast {
  const models = [
    trendSeasonalForecast(prices, horizon),
    arForecast(prices, horizon, 3),
    holtForecast(prices, horizon),
  ];
  const ensemble = Array.from({ length: horizon }, (_, h) => mean(models.map((m) => m.path[h])));
  const sigmaDaily = stdDev(returns(prices), true);
  const last = prices[prices.length - 1];
  const z = 1.96;
  const upper = ensemble.map((v, h) => v + z * sigmaDaily * last * Math.sqrt(h + 1));
  const lower = ensemble.map((v, h) => v - z * sigmaDaily * last * Math.sqrt(h + 1));
  return { models, ensemble, upper, lower, sigmaDaily, horizon, z };
}
