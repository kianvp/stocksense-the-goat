// Research Engine — the pipeline graph and report assembly.
//
// This file is the wiring diagram: it declares every node, its dependencies,
// its cache policy and its guards, then hands the graph to the orchestrator.
// Layers 7–9 (confidence, QA aggregation, personalization) run as assembly
// steps after the graph settles because they are pure synchronous functions
// over the results — putting them in the DAG would add ceremony, not value.
//
// Two guards apply to every LLM node:
//   • no Gemini key   → skipped, with the reason surfaced in the UI;
//   • synthetic data  → skipped. The engine will not dress up demo numbers
//     as analysis under any circumstances.

import { hasGeminiKey } from "@/lib/api/gemini";
import { indexAgent, newsAgent, priceAgent, sectorAgent } from "./agents";
import { runAnalyst, runModerator, runThesis } from "./analysts";
import { computeConfidence } from "./confidence";
import { buildFeatures } from "./features";
import { runModelLayer } from "./models";
import { memoryCache, payloadOf, runPipeline, type NodeDef, type ResultMap } from "./orchestrator";
import { personalContext } from "./personalize";
import { consistencyFindings } from "./qa";
import type {
  AgentEnvelope, AnalystOutput, AnalystRole, FeatureVector, IndexData,
  ModelLayer, ModeratorOutput, NewsData, PipelineEvent, PriceData, QaFinding,
  ResearchReport, SectorData, TaskSpec, ThesisOutput,
} from "./types";

/** Session-scoped cache. TTLs are set per node where the graph is declared. */
const cache = memoryCache();

const LLM_ROLES: AnalystRole[] = ["technical", "quant", "risk", "news"];

/* ------------------------------------------------- context slice builders */
/* Each analyst sees only the slice its role needs — disjoint by design so
   no two Gemini calls reason over the same payload. */

function sliceGroups(fv: FeatureVector, names: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of names) {
    for (const f of fv.groups[g] ?? []) out[f] = round(fv.features[f]);
  }
  return out;
}

/** Trim float noise so prompts stay compact and grounding stays checkable. */
function round(v: number): number {
  return Math.abs(v) >= 100 ? Math.round(v * 100) / 100 : Math.round(v * 10000) / 10000;
}

function technicalInput(r: ResultMap) {
  const fv = payloadOf<FeatureVector>(r, "features")!;
  const m = payloadOf<ModelLayer>(r, "models")!;
  const price = payloadOf<PriceData>(r, "data.price")!;
  const sector = payloadOf<SectorData>(r, "data.sector");
  return {
    symbol: price.symbol,
    lastClose: round(price.lastClose),
    features: sliceGroups(fv, ["trend", "momentum", "oscillator", "bands", "levels", "structure", "volume", "volume_profile"]),
    patterns: m.patterns.filter((p) => p.detected).map((p) => ({ name: p.name, detail: p.detail })),
    regime: m.regime.regime,
    sector: sector
      ? { industry: sector.industry, breadthUp: round(sector.breadthUp), medianChangePct: round(sector.medianChangePct), relativeStrength: round(sector.relativeStrength) }
      : null,
  };
}

function quantInput(r: ResultMap) {
  const m = payloadOf<ModelLayer>(r, "models")!;
  const price = payloadOf<PriceData>(r, "data.price")!;
  const e = m.ensemble;
  const h = e.horizon - 1;
  return {
    symbol: price.symbol,
    lastClose: round(price.lastClose),
    ensembleTargetT7: round(e.ensemble[h]),
    ci95: { lower: round(e.lower[h]), upper: round(e.upper[h]) },
    models: e.models.map((mm) => ({
      name: mm.name,
      target: round(mm.target),
      weight: round(mm.weight ?? 0),
      rmse: mm.rmse != null ? round(mm.rmse) : null,
      mae: mm.mae != null ? round(mm.mae) : null,
      mapePct: mm.mape != null ? round(mm.mape * 100) : null,
      directionalAccuracyPct: mm.dirAcc != null ? round(mm.dirAcc * 100) : null,
    })),
    baseline: {
      rmse: round(m.baseline.rmse),
      mae: round(m.baseline.mae),
      mapePct: round(m.baseline.mape * 100),
      directionalAccuracyPct: round(m.baseline.directionalAccuracy * 100),
      note: "random-walk / majority-class baseline — a model without edge matches these numbers",
    },
    backtestOrigins: m.baseline.sampleSize,
  };
}

function riskInput(r: ResultMap) {
  const fv = payloadOf<FeatureVector>(r, "features")!;
  const m = payloadOf<ModelLayer>(r, "models")!;
  const price = payloadOf<PriceData>(r, "data.price")!;
  const h = m.ensemble.horizon - 1;
  return {
    symbol: price.symbol,
    lastClose: round(price.lastClose),
    features: sliceGroups(fv, ["risk", "volatility", "distribution", "benchmark"]),
    ewmaVol: { dailyPct: round(m.volForecast.sigmaDaily * 100), annualPct: round(m.volForecast.sigmaAnnual * 100) },
    regime: m.regime,
    forecastBandPct: round(((m.ensemble.upper[h] - m.ensemble.lower[h]) / price.lastClose) * 100),
    anomalies: m.anomalies.map((x) => ({
      date: new Date(x.time).toISOString().slice(0, 10),
      movePct: round((Math.exp(x.logReturn) - 1) * 100),
      sigmas: round(x.sigmas),
      volumeRatio: x.volumeRatio != null ? round(x.volumeRatio) : null,
    })),
  };
}

function newsInput(r: ResultMap) {
  const news = payloadOf<NewsData>(r, "data.news")!;
  return {
    scope: news.scope,
    note: "General market headlines only — no company-specific feed on this data plan.",
    headlines: news.articles.map((a) => ({
      headline: a.headline,
      source: a.source,
      date: new Date(a.datetime * 1000).toISOString().slice(0, 10),
    })),
  };
}

/* -------------------------------------------------- debate evidence pools */

function gatherEvidence(r: ResultMap) {
  const m = payloadOf<ModelLayer>(r, "models")!;
  const bullish: string[] = [];
  const bearish: string[] = [];
  for (const role of LLM_ROLES) {
    const a = payloadOf<AnalystOutput>(r, `analyst.${role}`);
    if (!a) continue;
    bullish.push(...a.bullishEvidence.map((e) => `[${role}] ${e}`));
    bearish.push(...a.bearishEvidence.map((e) => `[${role}] ${e}`));
  }
  // The indicator panel testifies too — with its arithmetic attached.
  for (const c of m.score.components) {
    if (c.z > 0.15) bullish.push(`[indicators] ${c.label}: ${c.why}`);
    else if (c.z < -0.15) bearish.push(`[indicators] ${c.label}: ${c.why}`);
  }
  return { bullish, bearish };
}

function debateContext(r: ResultMap) {
  const m = payloadOf<ModelLayer>(r, "models")!;
  const price = payloadOf<PriceData>(r, "data.price")!;
  const h = m.ensemble.horizon - 1;
  return {
    lastClose: round(price.lastClose),
    forecastT7: round(m.ensemble.ensemble[h]),
    ci95: { lower: round(m.ensemble.lower[h]), upper: round(m.ensemble.upper[h]) },
    compositeZ: round(m.score.compositeZ),
    scoreOutOf100: m.score.score,
    regime: m.regime.regime,
    annualVolPct: round(m.volForecast.sigmaAnnual * 100),
  };
}

/* ------------------------------------------------------------- the graph */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildGraph(task: TaskSpec): NodeDef<any>[] {
  const llmGuard = (r: ResultMap): string | null => {
    if (!hasGeminiKey()) return "Gemini key not configured";
    const price = payloadOf<PriceData>(r, "data.price");
    if (price?.synthetic) return "synthetic demo data — LLM analysis suppressed";
    return null;
  };

  const day = new Date().toISOString().slice(0, 10);
  const llmKey = (id: string) => `${id}:${task.symbol}:${task.range}:${day}`;

  const analystNode = (role: AnalystRole, deps: string[], softDeps: string[], input: (r: ResultMap) => unknown): NodeDef<AnalystOutput> => ({
    id: `analyst.${role}`,
    deps,
    softDeps,
    lane: "llm",
    timeoutMs: 90_000,
    retries: 1,
    cacheKey: llmKey(`analyst.${role}`),
    cacheTtlMs: 6 * 3_600_000,
    skipIf: llmGuard,
    run: (r) => runAnalyst(role, input(r)),
  });

  return [
    {
      id: "data.price",
      deps: [],
      cacheKey: `price:${task.symbol}:${task.range}`,
      cacheTtlMs: 60_000,
      timeoutMs: 15_000,
      retries: 1,
      run: () => priceAgent(task.symbol, task.range),
      degradeIf: (v) => ((v as PriceData).synthetic ? "network unavailable — synthetic demo series" : null),
    } satisfies NodeDef<PriceData>,
    {
      id: "data.index",
      deps: [],
      cacheKey: `index:${task.range}`,
      cacheTtlMs: 5 * 60_000,
      timeoutMs: 15_000,
      run: () => indexAgent(task.range),
      degradeIf: (v) => (v === null ? "benchmark series unavailable" : null),
    } satisfies NodeDef<IndexData | null>,
    {
      id: "data.sector",
      deps: ["data.price"],
      cacheKey: `sector:${task.symbol}`,
      cacheTtlMs: 60_000,
      timeoutMs: 15_000,
      run: (r) => {
        const p = payloadOf<PriceData>(r, "data.price")!;
        const chg = p.previousClose > 0 ? ((p.lastClose / p.previousClose) - 1) * 100 : null;
        return sectorAgent(task.symbol, chg);
      },
      degradeIf: (v) => ((v as SectorData).peers.length === 0 ? "no peer data (not in Nifty 500, or quotes unavailable)" : null),
    } satisfies NodeDef<SectorData>,
    {
      id: "data.news",
      deps: [],
      cacheKey: "news:market",
      cacheTtlMs: 5 * 60_000,
      timeoutMs: 15_000,
      run: () => newsAgent(),
      degradeIf: (v) => ((v as NewsData).articles.length === 0 ? "no headlines (Finnhub key missing?)" : null),
    } satisfies NodeDef<NewsData>,

    {
      id: "features",
      deps: ["data.price"],
      softDeps: ["data.index"],
      run: async (r) => buildFeatures(
        payloadOf<PriceData>(r, "data.price")!,
        payloadOf<IndexData>(r, "data.index"),
      ),
    } satisfies NodeDef<FeatureVector>,
    {
      id: "models",
      deps: ["data.price"],
      run: async (r) => runModelLayer(payloadOf<PriceData>(r, "data.price")!),
    } satisfies NodeDef<ModelLayer>,

    analystNode("technical", ["features", "models"], ["data.sector"], technicalInput),
    analystNode("quant", ["models"], [], quantInput),
    analystNode("risk", ["features", "models"], [], riskInput),
    {
      ...analystNode("news", ["data.news"], [], newsInput),
      // News is market-scope, not symbol-scope: cache it globally for the day.
      cacheKey: `analyst.news:${day}`,
      skipIf: (r) => {
        const base = llmGuard(r);
        if (base) return base;
        return r.get("data.news")?.status === "degraded" ? "no news data to analyse" : null;
      },
    },

    {
      id: "debate.bull",
      deps: ["models"],
      softDeps: LLM_ROLES.map((x) => `analyst.${x}`),
      lane: "llm",
      timeoutMs: 90_000,
      retries: 1,
      cacheKey: llmKey("debate.bull"),
      cacheTtlMs: 6 * 3_600_000,
      skipIf: llmGuard,
      run: (r) => {
        const ev = gatherEvidence(r);
        return runThesis("bull", { supporting: ev.bullish, opposing: ev.bearish, context: debateContext(r) });
      },
    } satisfies NodeDef<ThesisOutput>,
    {
      id: "debate.bear",
      deps: ["models"],
      softDeps: LLM_ROLES.map((x) => `analyst.${x}`),
      lane: "llm",
      timeoutMs: 90_000,
      retries: 1,
      cacheKey: llmKey("debate.bear"),
      cacheTtlMs: 6 * 3_600_000,
      skipIf: llmGuard,
      run: (r) => {
        const ev = gatherEvidence(r);
        return runThesis("bear", { supporting: ev.bearish, opposing: ev.bullish, context: debateContext(r) });
      },
    } satisfies NodeDef<ThesisOutput>,
    {
      id: "debate.moderator",
      deps: ["debate.bull", "debate.bear"],
      lane: "llm",
      timeoutMs: 90_000,
      retries: 1,
      cacheKey: llmKey("debate.moderator"),
      cacheTtlMs: 6 * 3_600_000,
      skipIf: llmGuard,
      run: (r) => runModerator({
        bull: payloadOf<ThesisOutput>(r, "debate.bull")!,
        bear: payloadOf<ThesisOutput>(r, "debate.bear")!,
        quantContext: debateContext(r),
      }),
    } satisfies NodeDef<ModeratorOutput>,
  ];
}

/* --------------------------------------------------------------- assembly */

function envOf<T>(r: ResultMap, id: string): AgentEnvelope<T> {
  return (r.get(id) as AgentEnvelope<T>) ?? {
    id, status: "skipped", ms: 0, attempts: 0, reason: "not executed", payload: null,
  };
}

export async function runResearch(
  task: TaskSpec,
  onEvent?: (e: PipelineEvent) => void,
): Promise<ResearchReport> {
  const { results, totalMs } = await runPipeline(buildGraph(task), { cache, onEvent, lanes: { llm: 2 } });

  const price = envOf<PriceData>(results, "data.price");
  const models = envOf<ModelLayer>(results, "models");
  const analysts: ResearchReport["analysts"] = {};
  for (const role of LLM_ROLES) analysts[role] = envOf<AnalystOutput>(results, `analyst.${role}`);

  // Layer 7 — confidence.
  const dataIds = ["data.price", "data.index", "data.sector", "data.news"];
  const delivered = dataIds.filter((id) => ["done", "cached", "degraded"].includes(results.get(id)?.status ?? ""));
  const missing = dataIds.filter((id) => !delivered.includes(id));
  const confidence = computeConfidence({
    price: price.payload,
    models: models.payload,
    analysts: LLM_ROLES.map((x) => analysts[x]!),
    delivered,
    missing,
  });

  // Layer 8 — QA aggregation. Grounding/schema enforcement already ran inside
  // each LLM node (fail → retry → reject); here we collect the evidence trail
  // plus cross-agent consistency checks.
  const moderator = envOf<ModeratorOutput>(results, "debate.moderator");
  const findings: QaFinding[] = [];
  const retried: string[] = [];
  const suppressed: string[] = [];
  for (const [id, env] of results) {
    if (env.attempts > 1 && (env.status === "done" || env.status === "degraded")) retried.push(id);
    if (env.status === "failed") {
      suppressed.push(id);
      findings.push({
        validator: env.reason?.includes("ungrounded") ? "numeric-grounding" : "schema",
        agentId: id,
        severity: "error",
        detail: env.reason ?? "failed",
      });
    }
  }
  const h = models.payload ? models.payload.ensemble.horizon - 1 : 0;
  findings.push(...consistencyFindings({
    moderatorVerdict: moderator.payload?.verdict ?? null,
    compositeZ: models.payload?.score.compositeZ ?? null,
    forecastTarget: models.payload?.ensemble.ensemble[h] ?? null,
    lastClose: price.payload?.lastClose ?? null,
  }));

  // Layer 9 — personalization (deterministic, local-only).
  const sector = envOf<SectorData>(results, "data.sector");
  const personal = personalContext(task.symbol, sector.payload);

  return {
    task,
    generatedAt: Date.now(),
    price,
    sector,
    news: envOf<NewsData>(results, "data.news"),
    featureCount: envOf<FeatureVector>(results, "features").payload?.count ?? 0,
    models,
    analysts,
    bull: envOf<ThesisOutput>(results, "debate.bull"),
    bear: envOf<ThesisOutput>(results, "debate.bear"),
    moderator,
    confidence,
    qa: { findings, retried, suppressed },
    personal,
    timeline: [...results.values()].map((e) => ({ id: e.id, status: e.status, ms: e.ms })),
    totalMs,
  };
}
