"use client";

// Deep Research console: run the multi-agent pipeline and watch it execute.
//
// The pipeline visualization is driven entirely by orchestrator events — every
// chip's state change and millisecond count is a real emission from the DAG
// runner, not a scripted animation. After the run settles, the report renders
// from the assembled ResearchReport object.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Radar, Play, ShieldAlert, Scale as ScaleIcon, TrendingUp, TrendingDown,
  Gauge, Newspaper, User, Clock, CheckCircle2, XCircle, MinusCircle, Zap,
} from "lucide-react";
import { checkAiConfigured } from "@/lib/api/gemini";
import { searchUniverse, lookupInstrument } from "@/lib/universe";
import { fmt } from "@/lib/quant";
import { routeIntent } from "@/lib/research/agents";
import { runResearch } from "@/lib/research/pipeline";
import type {
  AgentStatus, AnalystOutput, AgentEnvelope, PipelineEvent, ResearchReport,
} from "@/lib/research/types";
import { cn } from "@/lib/cn";

const PRESETS = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "TMPV"];
const RANGES = [
  { id: "3M", range: "3mo" as const },
  { id: "6M", range: "6mo" as const },
  { id: "1Y", range: "1y" as const },
];

/* The visual map of the graph: layer rows → node chips. */
const LAYER_MAP: { label: string; nodes: { id: string; label: string }[] }[] = [
  { label: "L2 · Data acquisition", nodes: [
    { id: "data.price", label: "Price" },
    { id: "data.index", label: "Benchmark" },
    { id: "data.sector", label: "Sector peers" },
    { id: "data.news", label: "News" },
  ]},
  { label: "L3–4 · Quantitative core", nodes: [
    { id: "features", label: "Feature engine" },
    { id: "models", label: "Model layer" },
  ]},
  { label: "L5 · Specialist analysts", nodes: [
    { id: "analyst.technical", label: "Technical" },
    { id: "analyst.quant", label: "Quant models" },
    { id: "analyst.risk", label: "Risk" },
    { id: "analyst.news", label: "News" },
  ]},
  { label: "L6 · Debate", nodes: [
    { id: "debate.bull", label: "Bull thesis" },
    { id: "debate.bear", label: "Bear thesis" },
    { id: "debate.moderator", label: "Moderator" },
  ]},
];

type NodeState = { status: AgentStatus | "idle"; ms?: number; reason?: string };

const STATUS_STYLE: Record<string, string> = {
  idle: "border-(--color-border) text-(--color-fg-subtle)",
  pending: "border-(--color-border) text-(--color-fg-subtle)",
  running: "border-(--color-brand-400) bg-(--color-brand-50) text-(--color-brand-700) animate-pulse",
  done: "border-(--color-brand-300) bg-(--color-brand-50) text-(--color-brand-800)",
  cached: "border-(--color-info)/40 bg-(--color-info)/5 text-(--color-info)",
  degraded: "border-(--color-warn)/50 bg-(--color-warn)/5 text-(--color-warn)",
  skipped: "border-(--color-border) bg-(--color-surface-2) text-(--color-fg-subtle) opacity-70",
  failed: "border-(--color-down)/50 bg-(--color-down-soft) text-(--color-down)",
};

export function ResearchConsole() {
  const [query, setQuery] = useState("RELIANCE");
  const [rangeId, setRangeId] = useState("6M");
  const [phase, setPhase] = useState<"idle" | "routing" | "running" | "done" | "error">("idle");
  const [nodes, setNodes] = useState<Record<string, NodeState>>({});
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = still probing; true/false = server AI key present. Quota-free check.
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    checkAiConfigured().then(setAiConfigured);
  }, []);

  const suggestions = useMemo(
    () => (query.trim() && !lookupInstrument(query.toUpperCase()) ? searchUniverse(query, 4) : []),
    [query],
  );

  const onEvent = useCallback((e: PipelineEvent) => {
    if (e.type === "node") {
      setNodes((s) => ({ ...s, [e.id]: { status: e.status, ms: e.ms, reason: e.reason } }));
    }
  }, []);

  const run = useCallback(async (q?: string) => {
    if (runningRef.current) return;
    const raw = (q ?? query).trim();
    if (!raw) return;
    runningRef.current = true;
    setPhase("routing");
    setReport(null);
    setError(null);
    setNodes({});
    try {
      const range = RANGES.find((r) => r.id === rangeId)?.range ?? "6mo";
      const task = await routeIntent(raw, range);
      if (!task) {
        setError(`Couldn't resolve "${raw}" to an NSE instrument.`);
        setPhase("error");
        return;
      }
      setQuery(task.symbol);
      setPhase("running");
      const rep = await runResearch(task, onEvent);
      setReport(rep);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pipeline failed");
      setPhase("error");
    } finally {
      runningRef.current = false;
    }
  }, [query, rangeId, onEvent]);

  return (
    <div className="mx-auto max-w-6xl px-1 py-2">
      {/* ------------------------------------------------ header + input */}
      <div className="mb-5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] font-semibold text-(--color-fg-subtle)">
          <Radar className="h-3.5 w-3.5" /> Deep research
        </div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-(--color-fg)">
          Multi-agent research engine
        </h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-(--color-fg-muted)">
          Deterministic data, features and models feed specialist AI analysts, an adversarial
          bull/bear debate, and a moderator — with every number validated against the math.
        </p>
      </div>

      {aiConfigured === false && (
        <div className="mb-4 rounded-xl border border-(--color-warn)/40 bg-(--color-warn)/5 px-4 py-3 text-[13px] text-(--color-fg-muted)">
          <span className="font-semibold text-(--color-warn)">AI key not configured on the server</span> — the
          quantitative layers will run; analyst, debate and moderator stages will be skipped.
        </div>
      )}

      <div className="relative mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Symbol or question — e.g. RELIANCE, 'risk of INFY'"
            className="h-11 w-full rounded-xl border border-(--color-border-strong) bg-(--color-surface) px-4 text-[14px] outline-none focus:border-(--color-brand-400)"
            aria-label="Research query"
          />
          {suggestions.length > 0 && phase !== "running" && (
            <div className="absolute inset-x-0 top-12 z-20 overflow-hidden rounded-xl border border-(--color-border) bg-(--color-surface) shadow-[var(--shadow-lg)]">
              {suggestions.map((s) => (
                <button
                  key={s.symbol}
                  type="button"
                  onClick={() => { setQuery(s.symbol); run(s.symbol); }}
                  className="flex w-full items-baseline justify-between px-4 py-2.5 text-left hover:bg-(--color-surface-2)"
                >
                  <span className="text-[13.5px] font-medium">{s.symbol}</span>
                  <span className="max-w-[60%] truncate text-[12px] text-(--color-fg-subtle)">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 rounded-xl border border-(--color-border) p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRangeId(r.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12.5px] font-medium",
                rangeId === r.id ? "bg-(--color-brand-700) text-white" : "text-(--color-fg-muted) hover:bg-(--color-surface-2)",
              )}
            >
              {r.id}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => run()}
          disabled={phase === "running" || phase === "routing"}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-(--color-brand-700) px-5 text-[14px] font-medium text-white hover:bg-(--color-brand-800) disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {phase === "running" || phase === "routing" ? "Running…" : "Run research"}
        </button>
      </div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { setQuery(p); run(p); }}
            className="rounded-lg border border-(--color-border) px-2.5 py-1 text-[12px] text-(--color-fg-muted) hover:bg-(--color-surface-2)"
          >
            {p}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-(--color-down)/40 bg-(--color-down-soft) px-4 py-3 text-[13px] text-(--color-down)">
          {error}
        </div>
      )}

      {/* ------------------------------------------- live pipeline board */}
      {phase !== "idle" && (
        <div className="glass mb-6 rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] font-semibold text-(--color-fg-subtle)">
              <Zap className="h-3.5 w-3.5" /> Pipeline execution
            </p>
            {report && (
              <p className="text-[12px] tabular text-(--color-fg-subtle)">
                total {report.totalMs.toLocaleString()} ms · {report.featureCount} features
              </p>
            )}
          </div>
          <div className="space-y-3">
            {LAYER_MAP.map((layer) => (
              <div key={layer.label} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <p className="w-44 shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-(--color-fg-subtle)">
                  {layer.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {layer.nodes.map((n) => {
                    const st = nodes[n.id] ?? { status: "idle" as const };
                    return (
                      <span
                        key={n.id}
                        title={st.reason ?? undefined}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                          STATUS_STYLE[st.status] ?? STATUS_STYLE.idle,
                        )}
                      >
                        <StatusIcon status={st.status} />
                        {n.label}
                        {typeof st.ms === "number" && st.status !== "running" && (
                          <span className="tabular opacity-70">
                            {st.status === "cached" ? "cache" : `${st.ms}ms`}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- report */}
      {report && <Report report={report} />}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  const cls = "h-3 w-3";
  switch (status) {
    case "done": return <CheckCircle2 className={cls} />;
    case "cached": return <Zap className={cls} />;
    case "failed": return <XCircle className={cls} />;
    case "skipped": return <MinusCircle className={cls} />;
    case "degraded": return <ShieldAlert className={cls} />;
    case "running": return <Clock className={cls} />;
    default: return <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />;
  }
}

/* ================================================================ report */

function Report({ report }: { report: ResearchReport }) {
  const m = report.models.payload;
  const price = report.price.payload;
  const mod = report.moderator.payload;
  const unit = price?.currency === "INR" ? "₹" : "";
  const synthetic = price?.synthetic;

  return (
    <div className="space-y-5">
      {synthetic && (
        <div className="rounded-xl border border-(--color-warn)/40 bg-(--color-warn)/5 px-4 py-3 text-[13px] text-(--color-warn)">
          Demo data — the market feed was unreachable, so quantitative layers ran on a synthetic
          series and all AI analysis was suppressed.
        </div>
      )}

      {/* executive summary + confidence */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="glass rounded-2xl p-5">
          <SectionTitle icon={<ScaleIcon className="h-3.5 w-3.5" />} title="Executive summary" />
          {mod ? (
            <>
              <div className="mb-2 flex items-center gap-2">
                <VerdictBadge verdict={mod.verdict} />
                <span className="text-[12px] text-(--color-fg-subtle)">
                  moderator confidence {(mod.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-[14px] leading-relaxed text-(--color-fg)">{mod.executiveSummary}</p>
              {report.personal.note && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-(--color-brand-50) px-3 py-2 text-[12.5px] text-(--color-brand-800)">
                  <User className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {report.personal.note}
                </p>
              )}
            </>
          ) : (
            <p className="text-[13.5px] text-(--color-fg-muted)">
              {report.moderator.status === "skipped"
                ? `AI synthesis skipped — ${report.moderator.reason}. The quantitative verdict below still stands on the deterministic pipeline.`
                : "The moderator stage did not complete; see QA findings."}
              {m && (
                <span className="mt-2 block font-medium text-(--color-fg)">
                  Indicator composite: {m.score.verdict} ({m.score.score}/100, Z = {fmt(m.score.compositeZ, 2)}).
                </span>
              )}
            </p>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <SectionTitle icon={<Gauge className="h-3.5 w-3.5" />} title="Confidence" />
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-3xl font-semibold tabular text-(--color-fg)">{report.confidence.overall}</span>
            <span className="text-[12px] text-(--color-fg-subtle)">/ 100</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-(--color-surface-3)">
            <div
              className="h-full rounded-full bg-gradient-to-r from-(--color-brand-600) to-(--color-brand-400)"
              style={{ width: `${report.confidence.overall}%` }}
            />
          </div>
          <dl className="mt-3 space-y-1.5 text-[12px]">
            <ConfRow k="Model agreement" v={`${(report.confidence.modelAgreement * 100).toFixed(0)}%`} />
            <ConfRow
              k="Indicators"
              v={`${report.confidence.indicatorAlignment.bullish} bull · ${report.confidence.indicatorAlignment.bearish} bear · ${report.confidence.indicatorAlignment.neutral} flat`}
            />
            <ConfRow k="Band tightness" v={`${(report.confidence.bandTightness * 100).toFixed(0)}%`} />
            <ConfRow k="Data age" v={`${report.confidence.dataFreshnessDays.toFixed(1)}d`} />
            <ConfRow
              k="Coverage"
              v={`${report.confidence.coverage.delivered.length}/${report.confidence.coverage.delivered.length + report.confidence.coverage.missing.length} agents`}
            />
            {report.confidence.analystConsensus && (
              <ConfRow
                k="Analyst consensus"
                v={`${(report.confidence.analystConsensus.mean * 100).toFixed(0)}% ± ${(report.confidence.analystConsensus.spread * 100).toFixed(0)}`}
              />
            )}
          </dl>
        </div>
      </div>

      {/* bull vs bear */}
      {(report.bull.payload || report.bear.payload) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ThesisCard
            tone="bull"
            title="Bull case"
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            thesis={report.bull.payload}
            won={mod?.winningArguments}
          />
          <ThesisCard
            tone="bear"
            title="Bear case"
            icon={<TrendingDown className="h-3.5 w-3.5" />}
            thesis={report.bear.payload}
            won={mod?.winningArguments}
          />
        </div>
      )}

      {/* risks & opportunities */}
      {mod && (mod.keyRisks.length > 0 || mod.keyOpportunities.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ListCard title="Key risks" items={mod.keyRisks} tone="down" />
          <ListCard title="Key opportunities" items={mod.keyOpportunities} tone="up" />
        </div>
      )}

      {/* forecast + diagnostics */}
      {m && price && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="glass rounded-2xl p-5">
            <SectionTitle icon={<TrendingUp className="h-3.5 w-3.5" />} title="7-day ensemble forecast" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[380px] text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-(--color-border) text-[11px] uppercase tracking-[0.08em] text-(--color-fg-subtle)">
                    <th className="py-1.5 pr-2 font-semibold">Step</th>
                    <th className="py-1.5 pr-2 font-semibold">Forecast</th>
                    <th className="py-1.5 pr-2 font-semibold">95% low</th>
                    <th className="py-1.5 font-semibold">95% high</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {m.ensemble.ensemble.map((v, i) => (
                    <tr key={i} className="border-b border-(--color-border)/60 last:border-0">
                      <td className="py-1.5 pr-2 text-(--color-fg-subtle)">t+{i + 1}</td>
                      <td className="py-1.5 pr-2 font-medium">{unit}{fmt(v)}</td>
                      <td className="py-1.5 pr-2 text-(--color-fg-muted)">{unit}{fmt(m.ensemble.lower[i])}</td>
                      <td className="py-1.5 text-(--color-fg-muted)">{unit}{fmt(m.ensemble.upper[i])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11.5px] text-(--color-fg-subtle)">
              Last close {unit}{fmt(price.lastClose)} · regime {m.regime.regime} · EWMA vol{" "}
              {(m.volForecast.sigmaAnnual * 100).toFixed(1)}%/yr
            </p>
          </div>

          <div className="glass rounded-2xl p-5">
            <SectionTitle icon={<Gauge className="h-3.5 w-3.5" />} title="Model diagnostics (walk-forward)" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-[12px]">
                <thead>
                  <tr className="border-b border-(--color-border) text-[11px] uppercase tracking-[0.08em] text-(--color-fg-subtle)">
                    <th className="py-1.5 pr-2 font-semibold">Model</th>
                    <th className="py-1.5 pr-2 font-semibold">Weight</th>
                    <th className="py-1.5 pr-2 font-semibold">RMSE</th>
                    <th className="py-1.5 pr-2 font-semibold">MAPE</th>
                    <th className="py-1.5 font-semibold">Dir. acc</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {m.perModel.map((pm, i) => (
                    <tr key={pm.id} className="border-b border-(--color-border)/60">
                      <td className="max-w-[150px] truncate py-1.5 pr-2">{pm.name}</td>
                      <td className="py-1.5 pr-2">{((m.ensemble.models[i].weight ?? 0) * 100).toFixed(0)}%</td>
                      <td className="py-1.5 pr-2">{pm.diagnostics ? fmt(pm.diagnostics.rmse) : "—"}</td>
                      <td className="py-1.5 pr-2">{pm.diagnostics ? `${(pm.diagnostics.mape * 100).toFixed(2)}%` : "—"}</td>
                      <td className="py-1.5">{pm.diagnostics ? `${(pm.diagnostics.directionalAccuracy * 100).toFixed(0)}%` : "—"}</td>
                    </tr>
                  ))}
                  <tr className="text-(--color-fg-subtle)">
                    <td className="py-1.5 pr-2">Random-walk baseline</td>
                    <td className="py-1.5 pr-2">—</td>
                    <td className="py-1.5 pr-2">{fmt(m.baseline.rmse)}</td>
                    <td className="py-1.5 pr-2">{(m.baseline.mape * 100).toFixed(2)}%</td>
                    <td className="py-1.5">{(m.baseline.directionalAccuracy * 100).toFixed(0)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11.5px] text-(--color-fg-subtle)">
              {m.baseline.sampleSize} out-of-sample origins. A model earns its ensemble weight only
              by beating this baseline.
            </p>
          </div>
        </div>
      )}

      {/* analyst panels */}
      <AnalystGrid analysts={report.analysts} />

      {/* news timeline */}
      {report.news.payload && report.news.payload.articles.length > 0 && (
        <div className="glass rounded-2xl p-5">
          <SectionTitle icon={<Newspaper className="h-3.5 w-3.5" />} title="Market headlines considered" />
          <ul className="space-y-2">
            {report.news.payload.articles.slice(0, 6).map((a, i) => (
              <li key={i} className="flex items-baseline gap-3 text-[13px]">
                <span className="shrink-0 tabular text-[11px] text-(--color-fg-subtle)">
                  {new Date(a.datetime * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </span>
                <span className="text-(--color-fg-muted)">{a.headline}</span>
                <span className="shrink-0 text-[11px] text-(--color-fg-subtle)">{a.source}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* QA + timeline diagnostics */}
      <div className="glass rounded-2xl p-5">
        <SectionTitle icon={<ShieldAlert className="h-3.5 w-3.5" />} title="Quality assurance & execution log" />
        {report.qa.findings.length === 0 && report.qa.suppressed.length === 0 ? (
          <p className="text-[13px] text-(--color-fg-muted)">
            All validations passed — every figure in the AI output was grounded in computed data
            {report.qa.retried.length > 0 && ` (${report.qa.retried.length} agent(s) needed a corrective retry)`}.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {report.qa.findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px]">
                <span className={cn(
                  "mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                  f.severity === "error" ? "bg-(--color-down-soft) text-(--color-down)" : "bg-(--color-warn)/10 text-(--color-warn)",
                )}>
                  {f.validator}
                </span>
                <span className="text-(--color-fg-muted)">
                  <span className="font-medium text-(--color-fg)">{f.agentId}</span> — {f.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-(--color-border)/60 pt-3 text-[11px] tabular text-(--color-fg-subtle)">
          {report.timeline.map((t) => (
            <span key={t.id}>{t.id} · {t.status}{t.ms ? ` · ${t.ms}ms` : ""}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ fragments */

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <p className="mb-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] font-semibold text-(--color-fg-subtle)">
      {icon} {title}
    </p>
  );
}

function ConfRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-(--color-fg-subtle)">{k}</dt>
      <dd className="tabular font-medium text-(--color-fg-muted)">{v}</dd>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: "bullish" | "bearish" | "neutral" }) {
  const style =
    verdict === "bullish" ? "bg-(--color-up-soft) text-(--color-up)"
    : verdict === "bearish" ? "bg-(--color-down-soft) text-(--color-down)"
    : "bg-(--color-surface-2) text-(--color-fg-muted)";
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]", style)}>
      {verdict}
    </span>
  );
}

function ThesisCard({ tone, title, icon, thesis, won }: {
  tone: "bull" | "bear";
  title: string;
  icon: React.ReactNode;
  thesis: { thesis: string; strongestPoints: string[]; rebuttalOfOpposingCase: string[]; confidence: number } | null;
  won?: string[];
}) {
  const accent = tone === "bull" ? "text-(--color-up)" : "text-(--color-down)";
  return (
    <div className="glass rounded-2xl p-5">
      <p className={cn("mb-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] font-semibold", accent)}>
        {icon} {title}
      </p>
      {thesis ? (
        <>
          <p className="text-[13.5px] leading-relaxed text-(--color-fg)">{thesis.thesis}</p>
          <ul className="mt-3 space-y-1.5">
            {thesis.strongestPoints.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] text-(--color-fg-muted)">
                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", tone === "bull" ? "bg-(--color-up)" : "bg-(--color-down)")} />
                {p}
                {won?.some((w) => similar(w, p)) && (
                  <span className="ml-1 shrink-0 rounded bg-(--color-brand-100) px-1 py-0.5 text-[9.5px] font-semibold uppercase text-(--color-brand-700)">
                    won
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[13px] text-(--color-fg-subtle)">Not available this run.</p>
      )}
    </div>
  );
}

/** Loose match to tag moderator-endorsed points inside a thesis list. */
function similar(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 60);
  const na = norm(a);
  const nb = norm(b);
  return na.includes(nb.slice(0, 30)) || nb.includes(na.slice(0, 30));
}

function ListCard({ title, items, tone }: { title: string; items: string[]; tone: "up" | "down" }) {
  return (
    <div className="glass rounded-2xl p-5">
      <SectionTitle
        icon={tone === "down" ? <ShieldAlert className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
        title={title}
      />
      <ul className="space-y-1.5">
        {items.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-(--color-fg-muted)">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", tone === "up" ? "bg-(--color-up)" : "bg-(--color-down)")} />
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnalystGrid({ analysts }: { analysts: ResearchReport["analysts"] }) {
  const entries = Object.entries(analysts) as [string, AgentEnvelope<AnalystOutput>][];
  const delivered = entries.filter(([, e]) => e.payload);
  if (delivered.length === 0) return null;
  return (
    <div className="glass rounded-2xl p-5">
      <SectionTitle icon={<Gauge className="h-3.5 w-3.5" />} title="Specialist analyst panel" />
      <div className="grid gap-4 md:grid-cols-2">
        {delivered.map(([role, env]) => (
          <div key={role} className="rounded-xl border border-(--color-border) p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-(--color-brand-700)">{role}</p>
              <span className="text-[11px] tabular text-(--color-fg-subtle)">
                conf {(env.payload!.confidence * 100).toFixed(0)}% · {env.status === "cached" ? "cache" : `${env.ms}ms`}
              </span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-(--color-fg-muted)">{env.payload!.summary}</p>
            {env.payload!.uncertainties.length > 0 && (
              <p className="mt-2 text-[11.5px] text-(--color-fg-subtle)">
                Uncertain: {env.payload!.uncertainties.join("; ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
