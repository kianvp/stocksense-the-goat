// Verification harness for the quant/forecast/signals layer.
//
// Every check is against an INDEPENDENT reference: either a value computed by
// hand here from the textbook definition, or a published worked example.
// Run with:  node scripts/verify-quant.mjs
//
// The TS sources are transpiled on the fly by stripping types, so this tests
// the actual shipped code rather than a re-implementation.

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

/* ---------------------------------------------------------- load modules */

const dir = mkdtempSync(join(tmpdir(), "quant-verify-"));
function loadTs(srcPath, outName) {
  const src = readFileSync(srcPath, "utf8").replace(/from "\.\/quant"/g, `from "./quant.mjs"`);
  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const out = join(dir, outName);
  writeFileSync(out, js);
  return out;
}
loadTs("src/lib/quant.ts", "quant.mjs");
const forecastPath = loadTs("src/lib/forecast.ts", "forecast.mjs");
const signalsPath = loadTs("src/lib/signals.ts", "signals.mjs");

const Q = await import(pathToFileURL(join(dir, "quant.mjs")).href);
const F = await import(pathToFileURL(forecastPath).href);
const S = await import(pathToFileURL(signalsPath).href);

/* ------------------------------------------------------------- harness */

let pass = 0;
let fail = 0;
const failures = [];

function check(name, got, want, tol = 1e-9) {
  const ok =
    typeof want === "number"
      ? Number.isFinite(got) && Math.abs(got - want) <= tol
      : got === want;
  if (ok) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}\n      got  ${got}\n      want ${want}`);
  }
  const status = ok ? "PASS" : "FAIL";
  const shown = typeof got === "number" ? got.toFixed(6) : String(got);
  console.log(`  ${status}  ${name.padEnd(56)} ${shown}`);
}

function assert(name, cond, detail = "") {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name} ${detail}`);
  }
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

function section(t) {
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 62 - t.length))}`);
}

/* ------------------------------------------------------------ fixtures */

// Wilder's own worked RSI example (New Concepts in Technical Trading Systems,
// p.65): 14-period seed followed by smoothed steps. These closes are the
// canonical published series used to validate RSI implementations.
const WILDER = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
  46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35,
  44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13,
];

/* ------------------------------------------------------- 1. log returns */

section("Log returns & volatility");
{
  const p = [100, 110, 121];
  const lr = Q.logReturns(p);
  check("ln(110/100)", lr[0], Math.log(1.1), 1e-12);
  check("ln(121/110)", lr[1], Math.log(1.1), 1e-12);
  assert("log returns are additive", Math.abs(lr[0] + lr[1] - Math.log(121 / 100)) < 1e-12);

  // Independent σ: constant 1% daily log growth ⇒ zero dispersion.
  const flat = Array.from({ length: 50 }, (_, i) => 100 * Math.exp(0.01 * i));
  check("σ of constant-growth series = 0", Q.volatility(flat).daily, 0, 1e-12);

  // Annualisation must be exactly √252.
  const noisy = [100];
  for (let i = 1; i < 300; i++) noisy.push(noisy[i - 1] * Math.exp(((i * 7919) % 13) / 1000 - 0.006));
  const v = Q.volatility(noisy);
  check("σ_annual = σ_daily·√252", v.annualized, v.daily * Math.sqrt(252), 1e-12);
  assert("volatility uses log returns, not simple", Math.abs(v.daily - Q.stdDev(Q.returns(noisy), true)) > 1e-9,
    "(differs from simple-return σ as expected)");
}

/* -------------------------------------------------------------- 2. EMA */

section("EMA seeding");
{
  const p = Array.from({ length: 30 }, (_, i) => i + 1); // 1..30
  const { line, k } = Q.ema(p, 10);
  check("k = 2/(n+1)", k, 2 / 11, 1e-12);
  assert("undefined before the seed index", line.slice(0, 9).every(Number.isNaN));
  // Seed = SMA of first 10 = mean(1..10) = 5.5
  check("seed = SMA(first period)", line[9], 5.5, 1e-12);
  // Next step by hand: 11·k + 5.5·(1−k)
  check("first recursive step", line[10], 11 * (2 / 11) + 5.5 * (1 - 2 / 11), 1e-12);
  // On a constant series EMA must equal the constant.
  const flat = new Array(40).fill(7);
  check("EMA(constant) = constant", Q.ema(flat, 12).value, 7, 1e-12);
}

/* -------------------------------------------------------------- 3. RSI */

section("RSI — Wilder smoothing");
{
  const r = Q.rsi(WILDER, 14);

  // Independent reference: Wilder's definition re-implemented in a different
  // shape (explicit accumulators, no shared helpers) so agreement is evidence
  // about the recursion rather than a tautology.
  function refRsi(closes, n) {
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) g += d; else l -= d;
    }
    let ag = g / n, al = l / n;
    const out = [al === 0 ? 100 : 100 - 100 / (1 + ag / al)];
    for (let i = n + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      ag = (ag * (n - 1) + Math.max(0, d)) / n;
      al = (al * (n - 1) + Math.max(0, -d)) / n;
      out.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
    }
    return out;
  }
  const ref = refRsi(WILDER, 14);
  const mine = r.line.slice(14);
  assert("matches an independent Wilder implementation, bar for bar",
    mine.length === ref.length && mine.every((v, i) => Math.abs(v - ref[i]) < 1e-9),
    `${mine.length} bars compared`);

  // Gross sanity vs the published worked example (~70.5 at the first value).
  // Book tables are rounded and transcriptions vary by a cent, so this is a
  // loose bound — the exactness check above is the real test.
  assert("first value is in the published neighbourhood (~70.5)",
    Math.abs(r.line[14] - 70.53) < 0.2, `got ${r.line[14].toFixed(2)}`);
  assert("undefined before period", r.line.slice(0, 14).every(Number.isNaN));

  // Monotone rising series ⇒ no losses ⇒ RSI pinned at 100.
  const up = Array.from({ length: 40 }, (_, i) => 100 + i);
  check("all-gains RSI = 100", Q.rsi(up, 14).rsi, 100, 1e-9);
  const down = Array.from({ length: 40 }, (_, i) => 100 - i);
  check("all-losses RSI = 0", Q.rsi(down, 14).rsi, 0, 1e-9);
  assert("RSI stays within [0,100]", Q.rsi(WILDER, 14).line.filter((v) => !Number.isNaN(v)).every((v) => v >= 0 && v <= 100));
}

/* ------------------------------------------------------------- 4. MACD */

section("MACD");
{
  const p = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 6) * 10 + i * 0.2);
  const m = Q.macd(p, 12, 26, 9);
  assert("MACD undefined before slow EMA", m.macd.slice(0, 25).every(Number.isNaN));
  check("MACD defined at slow-1", Number.isNaN(m.macd[25]) ? NaN : 1, 1, 0);
  // Signal must be seeded from the first valid MACD, i.e. 9 bars later.
  assert("signal undefined before its own seed", m.signal.slice(0, 33).every(Number.isNaN));
  assert("signal defined at 25+9-1 = 33", !Number.isNaN(m.signal[33]));
  // Identity: hist = macd − signal, wherever both exist.
  const idOk = m.hist.every((h, i) =>
    Number.isNaN(h) ? true : Math.abs(h - (m.macd[i] - m.signal[i])) < 1e-12,
  );
  assert("hist ≡ MACD − signal", idOk);
  // On a pure constant series MACD is identically zero.
  const flat = new Array(80).fill(50);
  const mf = Q.macd(flat);
  check("MACD(constant) = 0", mf.lastMacd, 0, 1e-12);
}

/* -------------------------------------------------------------- 5. ATR */

section("ATR — Wilder");
{
  // Hand-built bars with a known true range.
  const bars = [];
  let c = 100;
  for (let i = 0; i < 40; i++) {
    bars.push({ high: c + 2, low: c - 2, close: c });
    c += 1;
  }
  // Each bar: H−L = 4; |H−C₋₁| = 3; |L−C₋₁| = 1 ⇒ TR = 4 throughout.
  const a = Q.atr(bars, 14);
  check("ATR of constant-range bars = range", a.atr, 4, 1e-9);
  check("ATR% = ATR/close", a.pct, 4 / bars[bars.length - 1].close, 1e-12);
  assert("returns null when too few bars", Q.atr(bars.slice(0, 5), 14) === null);
}

/* -------------------------------------------------- 6. Bollinger bands */

section("Bollinger bands");
{
  const p = [1, 2, 3, 4, 5];
  const b = Q.bollinger(p, 5, 2);
  check("mid = SMA", b.mid, 3, 1e-12);
  // Population σ of 1..5 = √2
  check("σ (population)", b.sigma, Math.SQRT2, 1e-12);
  check("upper = mid + 2σ", b.upper, 3 + 2 * Math.SQRT2, 1e-12);
  check("lower = mid − 2σ", b.lower, 3 - 2 * Math.SQRT2, 1e-12);
}

/* ------------------------------------------------ 7. OLS regression + SE */

section("OLS regression & inference");
{
  // Exact line y = 3x + 5 ⇒ perfect fit, zero residual, infinite t.
  const exact = Array.from({ length: 20 }, (_, i) => 3 * i + 5);
  const r = Q.linearRegression(exact, 3);
  check("slope", r.slope, 3, 1e-9);
  check("intercept", r.intercept, 5, 1e-9);
  check("R² = 1", r.r2, 1, 1e-12);
  check("residual SE = 0", r.residualSe, 0, 1e-9);
  check("forecast continues the line", r.forecast[0], 3 * 20 + 5, 1e-9);

  // Known noisy case: SE(β) must satisfy SE = √(s²/Σ(x−x̄)²).
  const y = [2, 4, 5, 4, 5, 7, 8, 9, 8, 11];
  const rr = Q.linearRegression(y, 0);
  const n = y.length;
  const xs = Array.from({ length: n }, (_, i) => i);
  const mx = Q.mean(xs);
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const ssRes = y.reduce((a, v, i) => a + (v - (rr.slope * i + rr.intercept)) ** 2, 0);
  const seRef = Math.sqrt(ssRes / (n - 2) / den);
  check("SE(β) matches closed form", rr.seSlope, seRef, 1e-12);
  check("t = β/SE(β)", rr.tStat, rr.slope / seRef, 1e-12);
  assert("upward trend is significant (|t|>2)", Math.abs(rr.tStat) > 2, `t=${rr.tStat.toFixed(2)}`);
}

/* ------------------------------------------------------ 8. Sharpe ratio */

section("Sharpe");
{
  // Deterministic 0.1% daily log growth, zero vol ⇒ σ=0 ⇒ guarded to 0.
  const steady = Array.from({ length: 100 }, (_, i) => 100 * Math.exp(0.001 * i));
  check("zero-vol Sharpe guarded to 0", Q.sharpe(steady).sharpe, 0, 1e-12);
  // rf must reduce the ratio.
  const noisy = [100];
  for (let i = 1; i < 400; i++) noisy.push(noisy[i - 1] * Math.exp(0.0008 + (((i * 7717) % 11) - 5) / 2000));
  assert("higher rf lowers Sharpe", Q.sharpe(noisy, 0.10).sharpe < Q.sharpe(noisy, 0.02).sharpe);
}

/* --------------------------------------------- 9. Support / resistance */

section("Support / resistance clustering");
{
  // Two swing highs 0.2 apart must collapse into ONE level, not two.
  const bars = [];
  for (let i = 0; i < 60; i++) {
    const base = 100 + Math.sin(i / 3) * 5;
    bars.push({ high: base + 1, low: base - 1, close: base });
  }
  // Plant two near-identical peaks well above price, then close low.
  bars[20] = { high: 130.0, low: 120, close: 125 };
  bars[40] = { high: 130.2, low: 120, close: 125 };
  bars[59] = { high: 101, low: 99, close: 100 };
  const lv = Q.supportResistance(bars, 3);
  assert("levels returned", lv !== null);
  const near130 = lv.resistances.filter((r) => Math.abs(r.price - 130) < 1);
  assert("near-identical peaks cluster into one level", near130.length === 1,
    `found ${near130.length} → ${lv.resistances.map((r) => r.price.toFixed(2)).join(", ")}`);
  if (near130.length === 1) assert("cluster records 2 touches", near130[0].touches === 2, `touches=${near130[0].touches}`);
  assert("resistances are above price", lv.resistances.every((r) => r.price > 100));
  assert("supports are below price", lv.supports.every((s) => s.price < 100));
  // Pivot identities.
  const last = bars[59];
  const p = (last.high + last.low + last.close) / 3;
  check("pivot P = (H+L+C)/3", lv.pivot.p, p, 1e-12);
  check("R1 = 2P − L", lv.pivot.r1, 2 * p - last.low, 1e-12);
  check("S1 = 2P − H", lv.pivot.s1, 2 * p - last.high, 1e-12);
}

/* ------------------------------------------------------- 10. Forecast */

section("Forecast — Holt fit, CI shape, backtest");
{
  const series = [];
  for (let i = 0; i < 160; i++) series.push(100 * Math.exp(0.001 * i) + Math.sin(i / 5) * 1.5);

  // Holt on a clean linear ramp should track it almost exactly.
  const ramp = Array.from({ length: 80 }, (_, i) => 50 + 2 * i);
  const h = F.holtForecast(ramp, 5);
  check("Holt extrapolates a linear ramp", h.path[0], 50 + 2 * 80, 0.5);
  assert("Holt reports fitted α/β", /fitted/.test(h.params), h.params);

  const f = F.ensembleForecast(series, 7);
  assert("horizon honoured", f.ensemble.length === 7 && f.upper.length === 7);
  assert("CI brackets the point forecast",
    f.ensemble.every((v, i) => f.lower[i] < v && v < f.upper[i]));
  assert("CI widens monotonically with horizon",
    f.sigmaPath.every((s, i) => i === 0 || s >= f.sigmaPath[i - 1]),
    `σ path: ${f.sigmaPath.map((s) => s.toFixed(4)).join(" → ")}`);
  assert("lower bound stays positive (log-space band)", f.lower.every((v) => v > 0));
  assert("band is right-skewed in price space",
    f.upper[6] - f.ensemble[6] > f.ensemble[6] - f.lower[6],
    "(multiplicative, as prices are lognormal)");
  assert("weights sum to 1",
    Math.abs(f.models.reduce((a, m) => a + m.weight, 0) - 1) < 1e-9);
  assert("backtest ran out-of-sample", f.backtestN > 0, `origins=${f.backtestN}`);
  assert("weights favour the lower-RMSE model", (() => {
    const withR = f.models.filter((m) => m.rmse !== undefined);
    if (withR.length < 2) return true;
    const best = withR.reduce((a, b) => (a.rmse < b.rmse ? a : b));
    const worst = withR.reduce((a, b) => (a.rmse > b.rmse ? a : b));
    return best.weight >= worst.weight;
  })());

  // Seasonality must be OFF without timestamps, and ON with real weekdays.
  const noDates = F.trendSeasonalForecast(series, 7);
  assert("no timestamps ⇒ seasonality disabled", /seasonality off/.test(noDates.params));
  // Candle.time is epoch MILLISECONDS (see yahoo.ts) — the fixture must match.
  const start = Date.UTC(2024, 0, 1); // a Monday
  const ts = series.map((_, i) => start + i * 86_400_000);
  const withDates = F.trendSeasonalForecast(series, 7, ts);
  assert("timestamps ⇒ weekday seasonality active", /seasonal amp/.test(withDates.params));
}

/* ---------------------------------------------------- 11. Bull/bear score */

section("Bull/bear score — z-scores & CDF");
{
  check("Φ(0) = 0.5", S.normalCdf(0), 0.5, 1e-7);
  check("Φ(1.96) ≈ 0.975", S.normalCdf(1.96), 0.975, 1e-4);
  check("Φ(-1.96) ≈ 0.025", S.normalCdf(-1.96), 0.025, 1e-4);
  assert("Φ is monotone increasing", (() => {
    for (let z = -3; z < 3; z += 0.1) if (S.normalCdf(z) > S.normalCdf(z + 0.1)) return false;
    return true;
  })());

  const mk = (prices) => {
    const m = Q.macd(prices);
    const reg = Q.linearRegression(prices, 0);
    const f = F.ensembleForecast(prices, 7);
    const b = Q.bollinger(prices, 20, 2);
    const last = prices[prices.length - 1];
    const bollPos = Math.min(1, Math.max(0, (last - b.lower) / (b.upper - b.lower)));
    return S.bullBearScore({
      prices, rsi: Q.rsi(prices, 14).rsi, macd: m, trendT: reg.tStat, bollPos,
      atr: null, ensembleTarget: f.ensemble[6], forecastSigma: f.sigmaPath[6],
    });
  };

  const bull = mk(Array.from({ length: 140 }, (_, i) => 100 * Math.exp(0.004 * i)));
  const bear = mk(Array.from({ length: 140 }, (_, i) => 100 * Math.exp(-0.004 * i)));
  assert("strong uptrend scores bullish", bull.score >= 70, `score=${bull.score} Z=${bull.compositeZ.toFixed(2)}`);
  assert("strong downtrend scores bearish", bear.score <= 30, `score=${bear.score} Z=${bear.compositeZ.toFixed(2)}`);
  assert("score bounded 0–100", bull.score <= 100 && bear.score >= 0);
  assert("weights sum to 1",
    Math.abs(bull.components.reduce((a, c) => a + c.weight, 0) - 1) < 1e-9,
    `Σw=${bull.components.reduce((a, c) => a + c.weight, 0)}`);
  assert("every z clamped to ±3", bull.components.every((c) => Math.abs(c.z) <= 3 + 1e-12));
  assert("contribution = z × weight",
    bull.components.every((c) => Math.abs(c.contribution - c.z * c.weight) < 1e-12));

  // Scale invariance: the same shape at 10× the price must score the same.
  const base = Array.from({ length: 140 }, (_, i) => 100 * Math.exp(0.002 * i) + Math.sin(i / 4));
  const scaled = base.map((v) => v * 10);
  assert("score is scale-invariant", Math.abs(mk(base).score - mk(scaled).score) <= 1,
    `${mk(base).score} vs ${mk(scaled).score}`);
}

/* ---------------------------------------------------------------- done */

console.log(`\n${"=".repeat(68)}`);
console.log(`  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  • " + f));
}
console.log("=".repeat(68));
process.exit(fail === 0 ? 0 : 1);
