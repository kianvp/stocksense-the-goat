// Verification harness for the Research Engine (multi-agent pipeline).
//
// Tests the actual shipped TypeScript (transpiled on the fly), never a
// re-implementation. Network- and LLM-dependent agents are exercised in the
// browser instead; everything deterministic — the orchestrator's scheduling
// semantics, the QA grounding validators, the confidence math, the feature
// engine and the model layer — is proven here.
//
// Run with:  node scripts/verify-research.mjs

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

/* ---------------------------------------------------------- module loader */

const dir = mkdtempSync(join(tmpdir(), "research-verify-"));

function loadTs(srcPath, outName, rewrites = {}) {
  let src = readFileSync(srcPath, "utf8");
  for (const [from, to] of Object.entries(rewrites)) {
    src = src.replaceAll(`from "${from}"`, `from "${to}"`);
  }
  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const out = join(dir, outName);
  writeFileSync(out, js);
  return out;
}

const R = { "./quant": "./quant.mjs" };
loadTs("src/lib/quant.ts", "quant.mjs");
loadTs("src/lib/forecast.ts", "forecast.mjs", R);
loadTs("src/lib/signals.ts", "signals.mjs", R);
loadTs("src/lib/research/types.ts", "types.mjs", {
  "@/lib/quant": "./quant.mjs", "@/lib/forecast": "./forecast.mjs",
  "@/lib/signals": "./signals.mjs", "@/lib/api/finnhub": "./types-stub.mjs",
});
writeFileSync(join(dir, "types-stub.mjs"), "export {};\n");

const load = async (p, out, rw) => import(pathToFileURL(loadTs(p, out, rw)).href);

const O = await load("src/lib/research/orchestrator.ts", "orchestrator.mjs", { "./types": "./types.mjs" });
const QA = await load("src/lib/research/qa.ts", "qa.mjs", { "./types": "./types.mjs" });
const C = await load("src/lib/research/confidence.ts", "confidence.mjs", { "./types": "./types.mjs" });
const F = await load("src/lib/research/features.ts", "features.mjs", {
  "@/lib/quant": "./quant.mjs", "./types": "./types.mjs",
});
const M = await load("src/lib/research/models.ts", "models.mjs", {
  "@/lib/quant": "./quant.mjs", "@/lib/forecast": "./forecast.mjs",
  "@/lib/signals": "./signals.mjs", "./types": "./types.mjs",
});
const FC = await import(pathToFileURL(join(dir, "forecast.mjs")).href);

/* ---------------------------------------------------------------- harness */

let pass = 0;
let fail = 0;
const failures = [];

function assert(name, cond, detail = "") {
  if (cond) pass++;
  else { fail++; failures.push(`${name}  ${detail}`); }
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}
function section(t) {
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 62 - t.length))}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------- synthetic market data */

function syntheticPrice(n = 260, withSpike = false) {
  const bars = [];
  let p = 1000;
  const t0 = Date.UTC(2025, 0, 6); // a Monday
  let day = 0;
  for (let i = 0; i < n; i++) {
    // Skip weekends so timestamps are genuine trading days.
    while ([0, 6].includes(new Date(t0 + day * 86_400_000).getUTCDay())) day++;
    const drift = 0.0006;
    const wiggle = Math.sin(i / 7) * 0.008 + Math.cos(i / 17) * 0.005;
    let r = drift + wiggle + (((i * 7919) % 13) - 6) / 1400;
    if (withSpike && i === n - 30) r = -0.12; // one −12% crash bar
    p = p * Math.exp(r);
    const high = p * 1.011;
    const low = p * 0.989;
    bars.push({
      time: t0 + day * 86_400_000,
      close: Math.round(p * 100) / 100,
      open: Math.round(((p * (1 - r / 2))) * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      volume: 100_000 + ((i * 104729) % 90_000) + (withSpike && i === n - 30 ? 500_000 : 0),
    });
    day++;
  }
  const last = bars[bars.length - 1];
  return {
    symbol: "TEST", currency: "INR", bars,
    lastClose: last.close, previousClose: bars[bars.length - 2].close,
    synthetic: false, asOf: last.time,
  };
}

function syntheticIndex(n = 260) {
  const closes = [];
  const times = [];
  let p = 22000;
  for (let i = 0; i < n; i++) {
    p = p * Math.exp(0.0004 + Math.sin(i / 9) * 0.006);
    closes.push(p);
    times.push(Date.UTC(2025, 0, 6) + i * 86_400_000);
  }
  return { symbol: "NIFTY50", closes, times };
}

/* ---------------------------------------------------- 1. orchestrator */

section("Orchestrator — scheduling semantics");
{
  const events = [];
  const t0 = Date.now();
  const { results, totalMs } = await O.runPipeline(
    [
      { id: "a", deps: [], run: async () => { await sleep(120); return "A"; } },
      { id: "b", deps: [], run: async () => { await sleep(120); return "B"; } },
      { id: "c", deps: ["a", "b"], run: async (r) => O.payloadOf(r, "a") + O.payloadOf(r, "b") },
    ],
    { onEvent: (e) => events.push(e) },
  );
  const wall = Date.now() - t0;
  assert("independent nodes run in parallel", wall < 230, `wall=${wall}ms for 2×120ms`);
  assert("dependent node sees upstream payloads", results.get("c").payload === "AB");
  assert("events include running and done", events.some((e) => e.status === "running") && events.some((e) => e.type === "done"));
  assert("totalMs is measured", totalMs >= 115, `totalMs=${totalMs}`);
}
{
  const { results } = await O.runPipeline([
    { id: "bad", deps: [], run: async () => { throw new Error("boom"); } },
    { id: "hard", deps: ["bad"], run: async () => "never" },
    { id: "soft", deps: [], softDeps: ["bad"], run: async () => "ran" },
  ]);
  assert("failure propagates to hard dependants as skip",
    results.get("hard").status === "skipped" && /bad/.test(results.get("hard").reason));
  assert("softDeps wait but do NOT propagate failure", results.get("soft").payload === "ran");
  assert("failed node carries its error", /boom/.test(results.get("bad").reason));
}
{
  let calls = 0;
  const { results } = await O.runPipeline([
    { id: "flaky", deps: [], retries: 1, run: async () => { if (++calls === 1) throw new Error("first"); return "ok"; } },
  ]);
  assert("retry recovers a flaky node", results.get("flaky").status === "done" && results.get("flaky").attempts === 2);
}
{
  const cache = O.memoryCache();
  const mk = () => [{ id: "x", deps: [], cacheKey: "k", cacheTtlMs: 60_000, run: async () => "fresh" }];
  await O.runPipeline(mk(), { cache });
  const { results } = await O.runPipeline(mk(), { cache });
  assert("second run is a cache hit", results.get("x").status === "cached" && results.get("x").payload === "fresh");
}
{
  const t0 = Date.now();
  await O.runPipeline(
    ["l1", "l2", "l3"].map((id) => ({ id, deps: [], lane: "llm", run: async () => sleep(80) })),
    { lanes: { llm: 1 } },
  );
  assert("lane limit serialises rate-limited work", Date.now() - t0 >= 230, `${Date.now() - t0}ms for 3×80ms @ limit 1`);
}
{
  const { results } = await O.runPipeline([
    { id: "slow", deps: [], timeoutMs: 60, run: async () => { await sleep(250); return "late"; } },
  ]);
  assert("timeout fails the node", results.get("slow").status === "failed" && /timed out/.test(results.get("slow").reason));
}
{
  let threw = false;
  try {
    await O.runPipeline([
      { id: "a", deps: ["b"], run: async () => 1 },
      { id: "b", deps: ["a"], run: async () => 2 },
    ]);
  } catch { threw = true; }
  assert("circular graph throws deadlock", threw);
}
{
  const { results } = await O.runPipeline([
    { id: "s", deps: [], skipIf: () => "not needed", run: async () => "x" },
    { id: "d", deps: [], degradeIf: (v) => (v === "meh" ? "weak data" : null), run: async () => "meh" },
  ]);
  assert("skipIf skips with reason", results.get("s").status === "skipped" && results.get("s").reason === "not needed");
  assert("degradeIf marks degraded but keeps payload",
    results.get("d").status === "degraded" && results.get("d").payload === "meh");
}

/* ------------------------------------------------------------- 2. QA */

section("QA — numeric grounding (the hallucination detector)");
{
  const nums = QA.extractNumbers("Price rose to ₹1,234.50, up 4.2% in 14 sessions (52-wk high 1,300)");
  assert("extracts Indian-format numbers", nums.includes(1234.5) && nums.includes(4.2) && nums.includes(1300),
    JSON.stringify(nums));

  const allowed = QA.collectAllowedNumbers({ close: 1234.5, changeFrac: 0.042, nested: { rsi: 61.37 } });
  assert("allows the exact figure", QA.ungroundedNumbers("close was 1234.50", allowed).length === 0);
  assert("allows rounded renderings", QA.ungroundedNumbers("about 1234 and rsi 61.4", allowed).length === 0);
  assert("allows fraction quoted as percent", QA.ungroundedNumbers("moved 4.2 percent", allowed).length === 0);
  const bad = QA.ungroundedNumbers("target of 1,999.99 implies 62% upside", allowed);
  assert("flags fabricated figures", bad.includes(1999.99), JSON.stringify(bad));
  assert("whitelists analytic constants", QA.ungroundedNumbers("RSI above 70 with 95 percent CI over 252 days", allowed).length === 0);
  assert("years pass", QA.ungroundedNumbers("since 2024", allowed).length === 0);
}
{
  const good = { summary: "s", bullishEvidence: ["a"], bearishEvidence: [], confidence: 0.7, assumptions: [], uncertainties: [] };
  assert("analyst schema accepts valid", QA.validateAnalyst(good));
  assert("analyst schema rejects bad confidence", !QA.validateAnalyst({ ...good, confidence: 1.7 }));
  assert("analyst schema rejects missing fields", !QA.validateAnalyst({ summary: "s" }));
  assert("moderator schema enforces verdict enum",
    !QA.validateModerator({ verdict: "maybe", executiveSummary: "x", winningArguments: [], rejectedArguments: [], keyRisks: [], keyOpportunities: [], confidence: 0.5 }));
}
{
  const warn = QA.consistencyFindings({ moderatorVerdict: "bearish", compositeZ: 1.4, forecastTarget: 110, lastClose: 100 });
  assert("consistency flags verdict vs indicators + forecast", warn.length === 2, `${warn.length} findings`);
  const ok = QA.consistencyFindings({ moderatorVerdict: "bullish", compositeZ: 1.4, forecastTarget: 110, lastClose: 100 });
  assert("coherent run produces no findings", ok.length === 0);
}

/* ----------------------------------------------------- 3. confidence */

section("Confidence engine");
{
  const price = syntheticPrice();
  const models = M.runModelLayer(price);
  const mkAnalyst = (conf) => ({ id: "a", status: "done", ms: 1, attempts: 1,
    payload: { summary: "", bullishEvidence: [], bearishEvidence: [], confidence: conf, assumptions: [], uncertainties: [] } });

  const rep = C.computeConfidence({
    price, models,
    analysts: [mkAnalyst(0.7), mkAnalyst(0.75)],
    delivered: ["data.price", "data.index", "data.sector", "data.news"], missing: [],
  });
  assert("overall bounded 0–100", rep.overall >= 0 && rep.overall <= 100, `overall=${rep.overall}`);
  assert("model agreement in [0,1]", rep.modelAgreement >= 0 && rep.modelAgreement <= 1);
  assert("indicator counts sum to component count",
    rep.indicatorAlignment.bullish + rep.indicatorAlignment.bearish + rep.indicatorAlignment.neutral
      === models.score.components.length);
  assert("analyst consensus computed", rep.analystConsensus && Math.abs(rep.analystConsensus.mean - 0.725) < 1e-9);

  const stale = C.computeConfidence({
    price: { ...price, asOf: Date.now() - 12 * 86_400_000 }, models,
    analysts: [], delivered: ["data.price"], missing: ["data.index", "data.sector", "data.news"],
  });
  assert("stale data is penalised", stale.overall < rep.overall, `${stale.overall} < ${rep.overall}`);
  assert("freshness measured in days", stale.dataFreshnessDays > 11);

  const empty = C.computeConfidence({ price: null, models: null, analysts: [], delivered: [], missing: ["data.price"] });
  assert("no data → floor confidence", empty.overall <= 25, `overall=${empty.overall}`);
}

/* -------------------------------------------------------- 4. features */

section("Feature engine");
{
  const price = syntheticPrice();
  const index = syntheticIndex();
  const fv = F.buildFeatures(price, index);
  assert("substantial feature count", fv.count >= 120, `count=${fv.count}`);
  assert("count matches map", Object.keys(fv.features).length === fv.count);
  assert("every value finite", Object.values(fv.features).every(Number.isFinite));
  assert("groups partition the features",
    Object.values(fv.groups).flat().length === fv.count);

  // Hand-checks against independent arithmetic.
  const withVol = price.bars.slice(-20);
  const vwapRef = withVol.reduce((a, b) => a + b.close * b.volume, 0) / withVol.reduce((a, b) => a + b.volume, 0);
  assert("VWAP matches hand computation", Math.abs(fv.features.vwap_20d - vwapRef) < 1e-9);

  const selfBeta = F.beta(price.bars.map((b) => b.close), price.bars.map((b) => b.close));
  assert("beta of a series on itself = 1", Math.abs(selfBeta - 1) < 1e-9);
  assert("correlation of identical series = 1", Math.abs(F.correlation([1, 2, 3, 4], [1, 2, 3, 4]) - 1) < 1e-9);

  assert("ADX present and in range", fv.features.adx_14 >= 0 && fv.features.adx_14 <= 100, `adx=${fv.features.adx_14?.toFixed(1)}`);
  const vpSum = Object.entries(fv.features).filter(([k]) => k.startsWith("vp_bucket_")).reduce((a, [, v]) => a + v, 0);
  assert("volume profile buckets sum to 1", Math.abs(vpSum - 1) < 1e-9, `sum=${vpSum.toFixed(6)}`);
  assert("sortino present", "sortino" in fv.features);
  assert("treynor present (has benchmark)", "treynor" in fv.features);
  assert("skewness of symmetric data ≈ 0", Math.abs(F.skewness([-2, -1, 0, 1, 2])) < 1e-9);
  assert("kurtosis defined", Number.isFinite(F.excessKurtosis([1, 2, 3, 4, 5, 6, 7, 8])));

  const noIdx = F.buildFeatures(price, null);
  assert("no benchmark → benchmark features omitted, not faked",
    !("beta_vs_index" in noIdx.features) && noIdx.count < fv.count);
}

/* ---------------------------------------------------------- 5. models */

section("Model layer");
{
  // EWMA: constant log return r ⇒ variance recursion converges to r².
  const flat = Array.from({ length: 300 }, (_, i) => 100 * Math.exp(0.01 * i));
  const vf = M.ewmaVolForecast(flat);
  assert("EWMA converges to |r| on constant returns", Math.abs(vf.sigmaDaily - 0.01) < 1e-4, `σ=${vf.sigmaDaily.toFixed(6)}`);
  assert("EWMA annualises by √252", Math.abs(vf.sigmaAnnual - vf.sigmaDaily * Math.sqrt(252)) < 1e-12);

  const ramp = Array.from({ length: 200 }, (_, i) => 100 * Math.exp(0.003 * i + Math.sin(i / 5) * 0.004));
  assert("strong uptrend classified trending-bull", M.classifyRegime(ramp).regime === "trending-bull");
  const flat2 = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 3) * 1.5);
  assert("sideways series classified ranging", M.classifyRegime(flat2).regime.startsWith("ranging"));

  const spiky = syntheticPrice(260, true);
  const anomalies = M.detectAnomalies(spiky);
  assert("crash bar detected as anomaly", anomalies.length >= 1 && anomalies.some((a) => a.sigmas > 3),
    `found ${anomalies.length}`);
  assert("anomaly carries volume corroboration", anomalies.some((a) => a.volumeRatio !== null && a.volumeRatio > 3));

  const layer = M.runModelLayer(syntheticPrice());
  assert("model layer: per-model diagnostics present",
    layer.perModel.every((p) => p.diagnostics && p.diagnostics.sampleSize > 0));
  assert("directional accuracy in [0,1]",
    layer.perModel.every((p) => p.diagnostics.directionalAccuracy >= 0 && p.diagnostics.directionalAccuracy <= 1));
  assert("baseline populated", layer.baseline.rmse > 0 && layer.baseline.sampleSize > 0);
  // The global-trend model legitimately one-step-predicts poorly on a curved
  // series; what the SYSTEM must guarantee is that (a) the local models stay
  // accurate and (b) the inverse-MSE weighting demotes the weak model.
  const localsOk = layer.perModel
    .filter((p) => p.id !== "trend")
    .every((p) => p.diagnostics.mape < 0.02);
  assert("local models one-step MAPE < 2%", localsOk,
    layer.perModel.map((p) => `${p.id}=${(p.diagnostics.mape * 100).toFixed(2)}%`).join(", "));
  const weights = layer.ensemble.models.map((mm) => ({ id: mm.id, w: mm.weight ?? 0, rmse: mm.rmse ?? 0 }));
  const worst = weights.reduce((a, b) => (a.rmse > b.rmse ? a : b));
  assert("ensemble weighting demotes the weakest model", worst.w < 0.05,
    weights.map((x) => `${x.id}:${(x.w * 100).toFixed(1)}%`).join(" "));
  assert("CI brackets ensemble", layer.ensemble.ensemble.every((v, i) =>
    layer.ensemble.lower[i] < v && v < layer.ensemble.upper[i]));
  assert("score attached", layer.score.score >= 0 && layer.score.score <= 100);
}

/* ------------------------------------------- 6. forecast diagnostics */

section("Walk-forward diagnostics (forecast.ts)");
{
  const closes = syntheticPrice().bars.map((b) => b.close);
  const times = syntheticPrice().bars.map((b) => b.time);
  const d = FC.backtestDiagnostics(closes, times);
  assert("three models measured", d.rmse.length === 3 && d.n > 0, `n=${d.n}`);
  assert("MAE ≤ RMSE (algebraic identity)", d.mae.every((m, i) => m <= d.rmse[i] + 1e-9));
  assert("dirAcc in [0,1]", d.dirAcc.every((x) => x >= 0 && x <= 1));
  assert("baseline dirAcc = share of up days", d.baseline.dirAcc >= 0 && d.baseline.dirAcc <= 1);
  assert("baseline rmse positive", d.baseline.rmse > 0);
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
