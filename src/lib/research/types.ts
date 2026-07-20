// Research Engine — the contract layer.
//
// Every agent in the pipeline communicates through the types in this file and
// nothing else: structured JSON in, structured JSON out, wrapped in an
// AgentEnvelope that carries status, timing, provenance and failure detail.
// Free-form text exists only *inside* analyst payloads as terminal output for
// humans — it is never parsed by another agent as an input format.

import type { Level, Pattern } from "@/lib/quant";
import type { EnsembleForecast } from "@/lib/forecast";
import type { BullBearScore } from "@/lib/signals";
import type { FinnhubArticle } from "@/lib/api/finnhub";

/* ------------------------------------------------------------- envelopes */

export type AgentStatus =
  | "pending"
  | "running"
  | "done"
  | "cached"
  | "skipped"
  | "degraded"
  | "failed";

export type AgentEnvelope<T> = {
  /** Node id in the pipeline graph, e.g. "data.price". */
  id: string;
  status: AgentStatus;
  /** Wall-clock execution time in ms (0 for cache hits). */
  ms: number;
  /** Set when status is "failed", "skipped" or "degraded". */
  reason?: string;
  /** Attempt count (1 = first try; 2 = succeeded after retry). */
  attempts: number;
  payload: T | null;
};

/* ------------------------------------------------------- Layer 1: intent */

export type ResearchIntent =
  | "stock_research"
  | "technical_analysis"
  | "risk_analysis"
  | "compare"
  | "portfolio_analysis"
  | "news_analysis"
  | "learning";

export type TaskSpec = {
  intent: ResearchIntent;
  symbol: string;
  /** Secondary symbol for compare intents. */
  symbolB?: string;
  range: "3mo" | "6mo" | "1y";
  /** How the router decided: deterministic parse vs LLM fallback. */
  routedBy: "deterministic" | "llm";
  rawQuery: string;
};

/* ------------------------------------------------- Layer 2: data agents */

export type PriceData = {
  symbol: string;
  currency: string;
  bars: { time: number; close: number; open?: number; high?: number; low?: number; volume?: number }[];
  lastClose: number;
  previousClose: number;
  /** True when the network failed and a synthetic demo series was used.
   *  LLM layers refuse to run on synthetic data — see pipeline guards. */
  synthetic: boolean;
  asOf: number; // ms epoch of the final bar
};

export type IndexData = {
  symbol: string; // benchmark, e.g. NIFTY50
  closes: number[];
  times: number[];
};

export type SectorPeer = {
  symbol: string;
  name: string;
  changePct: number;
  price: number;
};

export type SectorData = {
  industry: string | null;
  peers: SectorPeer[];
  /** Share of peers trading up today: breadth of the industry move. */
  breadthUp: number;
  medianChangePct: number;
  /** Subject's daily change minus the peer median — relative strength today. */
  relativeStrength: number;
};

export type NewsData = {
  /** General market headlines (Finnhub free tier; NSE company news is paid). */
  articles: Pick<FinnhubArticle, "headline" | "source" | "datetime" | "summary">[];
  scope: "market" | "company";
};

/* --------------------------------------------- Layer 3: feature engineering */

export type FeatureVector = {
  /** Flat name → value map. Every value is finite and deterministically derived. */
  features: Record<string, number>;
  /** Grouping for display: group name → feature names. */
  groups: Record<string, string[]>;
  count: number;
};

/* ------------------------------------------------- Layer 4: model layer */

export type ModelDiagnostics = {
  /** Walk-forward, out-of-sample, one-step-ahead. */
  rmse: number;
  mae: number;
  /** Mean absolute percentage error, as a fraction (0.012 = 1.2%). */
  mape: number;
  /** Share of origins where the predicted direction matched the actual. */
  directionalAccuracy: number;
  sampleSize: number;
};

export type RegimeClass =
  | "trending-bull"
  | "trending-bear"
  | "ranging-quiet"
  | "ranging-volatile";

export type Regime = {
  regime: RegimeClass;
  /** OLS trend t-statistic that drove the classification. */
  trendT: number;
  /** Current 20-bar volatility's percentile within its own history (0–1). */
  volPercentile: number;
};

export type Anomaly = {
  time: number;
  logReturn: number;
  /** How many trailing σ the move represents. */
  sigmas: number;
  volumeRatio: number | null;
};

export type VolForecast = {
  /** EWMA (RiskMetrics λ=0.94) one-day-ahead σ of log returns. */
  sigmaDaily: number;
  sigmaAnnual: number;
  lambda: number;
};

export type ModelLayer = {
  ensemble: EnsembleForecast;
  perModel: { id: string; name: string; diagnostics: ModelDiagnostics | null }[];
  /** Random-walk baseline diagnostics — the bar every model must beat. */
  baseline: ModelDiagnostics;
  regime: Regime;
  volForecast: VolForecast;
  anomalies: Anomaly[];
  score: BullBearScore;
  levels: { supports: Level[]; resistances: Level[] } | null;
  patterns: Pattern[];
};

/* --------------------------------------------- Layer 5/6: LLM reasoning */

/** The one schema every specialist must return. Validated before acceptance. */
export type AnalystOutput = {
  summary: string;
  bullishEvidence: string[];
  bearishEvidence: string[];
  confidence: number; // 0–1
  assumptions: string[];
  uncertainties: string[];
};

export type AnalystRole = "technical" | "quant" | "risk" | "news";

export type ThesisOutput = {
  thesis: string;
  strongestPoints: string[];
  rebuttalOfOpposingCase: string[];
  confidence: number; // 0–1
};

export type ModeratorOutput = {
  verdict: "bullish" | "bearish" | "neutral";
  executiveSummary: string;
  winningArguments: string[];
  rejectedArguments: string[];
  keyRisks: string[];
  keyOpportunities: string[];
  confidence: number; // 0–1
};

/* --------------------------------------------- Layer 7: confidence engine */

export type ConfidenceReport = {
  /** 0–100 blended score. Formula documented in confidence.ts. */
  overall: number;
  modelAgreement: number; // 0–1: directional consensus across model paths
  indicatorAlignment: { bullish: number; bearish: number; neutral: number };
  dataFreshnessDays: number;
  coverage: { delivered: string[]; missing: string[] };
  analystConsensus: { mean: number; spread: number } | null;
  bandTightness: number; // 0–1: forecast CI width relative to price (inverted)
};

/* ------------------------------------------------------- Layer 8: QA */

export type QaFinding = {
  validator: "schema" | "numeric-grounding" | "consistency";
  agentId: string;
  severity: "error" | "warning";
  detail: string;
};

export type QaReport = {
  findings: QaFinding[];
  /** Agents that failed hard validation and were retried. */
  retried: string[];
  /** Agents whose output was suppressed after a failed retry. */
  suppressed: string[];
};

/* --------------------------------------- Layer 9: personalization */

export type PersonalContext = {
  holdsSymbol: boolean;
  positionWeightPct: number | null;
  onWatchlist: boolean;
  sectorExposurePct: number | null;
  note: string | null;
};

/* --------------------------------------------- Layer 10: final report */

export type ResearchReport = {
  task: TaskSpec;
  generatedAt: number;
  price: AgentEnvelope<PriceData>;
  sector: AgentEnvelope<SectorData>;
  news: AgentEnvelope<NewsData>;
  featureCount: number;
  models: AgentEnvelope<ModelLayer>;
  analysts: Partial<Record<AnalystRole, AgentEnvelope<AnalystOutput>>>;
  bull: AgentEnvelope<ThesisOutput>;
  bear: AgentEnvelope<ThesisOutput>;
  moderator: AgentEnvelope<ModeratorOutput>;
  confidence: ConfidenceReport;
  qa: QaReport;
  personal: PersonalContext;
  /** Per-node timings for the diagnostics panel. */
  timeline: { id: string; status: AgentStatus; ms: number }[];
  totalMs: number;
};

/* ------------------------------------------------- orchestrator events */

export type PipelineEvent =
  | { type: "node"; id: string; status: AgentStatus; ms?: number; reason?: string }
  | { type: "phase"; label: string }
  | { type: "done"; totalMs: number };
