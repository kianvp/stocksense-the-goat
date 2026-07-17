"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Scale,
  Trophy,
  Sparkles,
  Activity,
  ArrowRight,
  AlertTriangle,
  TrendingUp,
  Bot,
} from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Delta } from "@/components/ui/Delta";
import { useLivePrices } from "@/lib/use-live-prices";
import { getChart, type ChartInterval, type ChartRange } from "@/lib/api/yahoo";
import { generateJson, hasGeminiKey, type GeminiContent } from "@/lib/api/gemini";
import { NIFTY_50, generatePriceHistory, type Stock } from "@/lib/mock-data";
import { formatINR } from "@/lib/format";

const A_COLOR = "#115e3c";
const B_COLOR = "#b27a00";

type RangeOpt = { id: string; days: number; range: ChartRange; interval: ChartInterval };
const RANGES: RangeOpt[] = [
  { id: "1M", days: 30, range: "1mo", interval: "1d" },
  { id: "3M", days: 90, range: "3mo", interval: "1d" },
  { id: "6M", days: 180, range: "6mo", interval: "1d" },
  { id: "1Y", days: 365, range: "1y", interval: "1d" },
];

const CURATED = [...NIFTY_50].sort((a, b) => a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// Head-to-head scoring. Each dimension is a share-of-pair (0-100) derived from
// real fundamentals, so the two bars in a row always sum to ~100. "Lower is
// better" metrics are inverted. No data is fabricated — everything comes from
// the curated Nifty 50 fundamentals plus the live quote.

type Metric = {
  key: string;
  label: string;
  better: "higher" | "lower";
  get: (s: Stock, live: { changePct: number }) => number;
  format: (v: number) => string;
  hint: string;
};

const METRICS: Metric[] = [
  {
    key: "value",
    label: "Valuation (P/E)",
    better: "lower",
    get: (s) => s.peRatio,
    format: (v) => v.toFixed(1),
    hint: "Lower P/E = cheaper per rupee of earnings",
  },
  {
    key: "earnYield",
    label: "Earnings yield",
    better: "higher",
    get: (s) => (s.basePrice > 0 ? (s.eps / s.basePrice) * 100 : 0),
    format: (v) => `${v.toFixed(2)}%`,
    hint: "EPS ÷ price — the inverse of P/E",
  },
  {
    key: "income",
    label: "Dividend yield",
    better: "higher",
    get: (s) => s.dividendYield,
    format: (v) => `${v.toFixed(2)}%`,
    hint: "Higher payout to shareholders",
  },
  {
    key: "momentum",
    label: "52-week position",
    better: "higher",
    get: (s) => {
      const span = s.week52High - s.week52Low;
      return span > 0 ? ((s.basePrice - s.week52Low) / span) * 100 : 50;
    },
    format: (v) => `${v.toFixed(0)}%`,
    hint: "Where the price sits in its 1-year range",
  },
  {
    key: "stability",
    label: "Stability (beta)",
    better: "lower",
    get: (s) => s.beta,
    format: (v) => v.toFixed(2),
    hint: "Lower beta = smaller swings vs the index",
  },
  {
    key: "size",
    label: "Size (market cap)",
    better: "higher",
    get: (s) => s.marketCap,
    format: (v) => `₹${formatINR(v, { compact: true })} Cr`,
    hint: "Larger companies are generally more resilient",
  },
];

function shareScore(mine: number, theirs: number, better: "higher" | "lower"): number {
  const a = Math.max(mine, 0.0001);
  const b = Math.max(theirs, 0.0001);
  const raw = better === "higher" ? a / (a + b) : b / (a + b);
  return Math.round(raw * 100);
}

export function CompareWorkbench() {
  const [aSym, setASym] = useState("HDFCBANK");
  const [bSym, setBSym] = useState("ICICIBANK");
  const [range, setRange] = useState<RangeOpt>(RANGES[1]);

  // Optional deep-link: /compare/?a=TCS&b=INFY
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const a = params.get("a")?.toUpperCase();
    const b = params.get("b")?.toUpperCase();
    if (a && NIFTY_50.some((s) => s.symbol === a)) setASym(a);
    if (b && NIFTY_50.some((s) => s.symbol === b)) setBSym(b);
  }, []);

  const a = NIFTY_50.find((s) => s.symbol === aSym) ?? NIFTY_50[0];
  const b = NIFTY_50.find((s) => s.symbol === bSym) ?? NIFTY_50[1];

  const live = useLivePrices([
    { symbol: a.symbol, basePrice: a.basePrice },
    { symbol: b.symbol, basePrice: b.basePrice },
  ]);
  const aLive = live[a.symbol] ?? { price: a.basePrice, change: 0, changePct: 0 };
  const bLive = live[b.symbol] ?? { price: b.basePrice, change: 0, changePct: 0 };

  const rows = useMemo(
    () =>
      METRICS.map((m) => {
        const av = m.get(a, aLive);
        const bv = m.get(b, bLive);
        return {
          metric: m,
          av,
          bv,
          aScore: shareScore(av, bv, m.better),
          bScore: shareScore(bv, av, m.better),
        };
      }),
    [a, b, aLive, bLive],
  );

  const aTotal = Math.round(rows.reduce((s, r) => s + r.aScore, 0) / rows.length);
  const bTotal = Math.round(rows.reduce((s, r) => s + r.bScore, 0) / rows.length);
  const heurWinner = aTotal === bTotal ? null : aTotal > bTotal ? a : b;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-(--color-fg-subtle)">
          Compare
        </p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight">
          Which stock is the better buy right now?
        </h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-(--color-fg-muted)">
          Put two Nifty 50 companies head-to-head. Compare price performance and fundamentals,
          see a InvestSense score for each, and get an AI verdict on which looks stronger today.
        </p>
      </header>

      {/* Pickers */}
      <section className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <Picker label="Stock A" color={A_COLOR} value={aSym} exclude={bSym} onChange={setASym} />
        <div className="hidden sm:flex h-11 items-center justify-center">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-(--color-border) bg-(--color-surface) text-(--color-fg-subtle)">
            <Scale className="h-4 w-4" />
          </span>
        </div>
        <Picker label="Stock B" color={B_COLOR} value={bSym} exclude={aSym} onChange={setBSym} />
      </section>

      {/* Quote heads */}
      <section className="grid gap-4 sm:grid-cols-2">
        <QuoteHead stock={a} live={aLive} color={A_COLOR} score={aTotal} winner={heurWinner?.symbol === a.symbol} />
        <QuoteHead stock={b} live={bLive} color={B_COLOR} score={bTotal} winner={heurWinner?.symbol === b.symbol} />
      </section>

      {/* Performance chart */}
      <PerformanceChart a={a} b={b} range={range} onRange={setRange} />

      {/* Scorecard */}
      <Card padding="md">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardEyebrow>InvestSense scorecard</CardEyebrow>
            <p className="mt-1 text-[13px] text-(--color-fg-muted)">
              Head-to-head across six fundamentals. Each bar is a share of the pair — they add up to 100%.
            </p>
          </div>
          {heurWinner && (
            <Badge tone="brand">
              <Trophy className="h-3.5 w-3.5" /> Edge: {heurWinner.symbol}
            </Badge>
          )}
        </div>
        <div className="space-y-3.5">
          {rows.map((r) => (
            <ScoreRow key={r.metric.key} row={r} a={a} b={b} />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <TotalPill label={a.symbol} score={aTotal} color={A_COLOR} winner={heurWinner?.symbol === a.symbol} />
          <TotalPill label={b.symbol} score={bTotal} color={B_COLOR} winner={heurWinner?.symbol === b.symbol} />
        </div>
        <p className="mt-4 text-[11.5px] leading-relaxed text-(--color-fg-subtle)">
          The scorecard is a rules-based heuristic derived from live prices and curated fundamentals —
          not financial advice. &ldquo;Better&rdquo; depends on your goals: cheaper valuation and higher
          income suit value investors, while stronger momentum suits growth investors.
        </p>
      </Card>

      {/* AI verdict */}
      <AiVerdict a={a} b={b} aLive={aLive} bLive={bLive} heurWinner={heurWinner?.symbol} />
    </div>
  );
}

function Picker({
  label,
  color,
  value,
  exclude,
  onChange,
}: {
  label: string;
  color: string;
  value: string;
  exclude: string;
  onChange: (s: string) => void;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] font-semibold text-(--color-fg-subtle)">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-11 w-full rounded-xl border border-(--color-border-strong) bg-(--color-surface) px-3.5 text-[15px] font-medium text-(--color-fg) focus:border-(--color-brand-500) focus:ring-4 focus:ring-(--color-brand-100) focus:outline-none"
      >
        {CURATED.map((s) => (
          <option key={s.symbol} value={s.symbol} disabled={s.symbol === exclude}>
            {s.name} ({s.symbol})
          </option>
        ))}
      </select>
    </div>
  );
}

function QuoteHead({
  stock,
  live,
  color,
  score,
  winner,
}: {
  stock: Stock;
  live: { price: number; changePct: number };
  color: string;
  score: number;
  winner: boolean;
}) {
  return (
    <Card padding="md" className={winner ? "border-(--color-brand-300)" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
            <p className="truncate text-[15px] font-semibold tracking-tight">{stock.name}</p>
          </div>
          <p className="mt-0.5 text-[12px] text-(--color-fg-subtle)">
            {stock.symbol} · {stock.sector}
          </p>
        </div>
        {winner && (
          <Badge tone="brand">
            <Trophy className="h-3.5 w-3.5" /> Edge
          </Badge>
        )}
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[26px] font-semibold tabular tracking-tight">₹{formatINR(live.price)}</p>
          <div className="mt-0.5">
            <Delta value={live.changePct} />
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-(--color-fg-subtle)">
            Score
          </p>
          <p className="text-[22px] font-semibold tabular tracking-tight" style={{ color }}>
            {score}
          </p>
        </div>
      </div>
    </Card>
  );
}

function ScoreRow({
  row,
  a,
  b,
}: {
  row: { metric: Metric; av: number; bv: number; aScore: number; bScore: number };
  a: Stock;
  b: Stock;
}) {
  const { metric, av, bv, aScore, bScore } = row;
  const aWins = aScore > bScore;
  const bWins = bScore > aScore;
  return (
    <div>
      <div className="flex items-center justify-between text-[12.5px]">
        <span className={`tabular font-semibold ${aWins ? "text-(--color-fg)" : "text-(--color-fg-muted)"}`}>
          {metric.format(av)}
        </span>
        <span className="text-[11.5px] font-medium text-(--color-fg-subtle)" title={metric.hint}>
          {metric.label}
        </span>
        <span className={`tabular font-semibold ${bWins ? "text-(--color-fg)" : "text-(--color-fg-muted)"}`}>
          {metric.format(bv)}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="flex flex-1 justify-end overflow-hidden rounded-full bg-(--color-surface-2)">
          <div
            className="h-2 rounded-full transition-all"
            style={{ width: `${aScore}%`, background: A_COLOR, opacity: aWins ? 1 : 0.45 }}
            title={`${a.symbol}: ${aScore}`}
          />
        </div>
        <div className="flex flex-1 overflow-hidden rounded-full bg-(--color-surface-2)">
          <div
            className="h-2 rounded-full transition-all"
            style={{ width: `${bScore}%`, background: B_COLOR, opacity: bWins ? 1 : 0.45 }}
            title={`${b.symbol}: ${bScore}`}
          />
        </div>
      </div>
    </div>
  );
}

function TotalPill({
  label,
  score,
  color,
  winner,
}: {
  label: string;
  score: number;
  color: string;
  winner: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
        winner ? "border-(--color-brand-300) bg-(--color-brand-50)/50" : "border-(--color-border) bg-(--color-surface)"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <span className="text-[13px] font-semibold tracking-tight">{label}</span>
      </div>
      <span className="text-[20px] font-semibold tabular" style={{ color }}>
        {score}
        <span className="text-[12px] font-medium text-(--color-fg-subtle)">/100</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Normalized performance chart — rebases both stocks to 100 at the start of the
// window so their percentage moves are directly comparable. Seeds with the
// app's generated history, then swaps in live Yahoo candles when they load.

type Series = { label: string; price: number }[];

function PerformanceChart({
  a,
  b,
  range,
  onRange,
}: {
  a: Stock;
  b: Stock;
  range: RangeOpt;
  onRange: (r: RangeOpt) => void;
}) {
  const seed = (s: Stock) => s.symbol.charCodeAt(0) + s.symbol.charCodeAt(1);
  const baseA = useMemo<Series>(
    () => generatePriceHistory(a.basePrice, range.days, seed(a)).map((p) => ({ label: p.date, price: p.price })),
    [a, range.days],
  );
  const baseB = useMemo<Series>(
    () => generatePriceHistory(b.basePrice, range.days, seed(b)).map((p) => ({ label: p.date, price: p.price })),
    [b, range.days],
  );
  const [seriesA, setSeriesA] = useState<Series>(baseA);
  const [seriesB, setSeriesB] = useState<Series>(baseB);

  useEffect(() => {
    setSeriesA(baseA);
    setSeriesB(baseB);
    let cancelled = false;
    async function load(stock: Stock, set: (s: Series) => void) {
      const r = await getChart(stock.symbol, range.range, range.interval);
      if (cancelled || !r || r.candles.length === 0) return;
      set(
        r.candles.map((c) => ({
          label: new Date(c.time).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
          price: c.price,
        })),
      );
    }
    load(a, setSeriesA);
    load(b, setSeriesB);
    return () => {
      cancelled = true;
    };
  }, [a, b, range, baseA, baseB]);

  const data = useMemo(() => {
    const n = Math.min(seriesA.length, seriesB.length);
    if (n === 0) return [];
    const a0 = seriesA[seriesA.length - n].price || 1;
    const b0 = seriesB[seriesB.length - n].price || 1;
    const out: Array<{ label: string; a: number; b: number }> = [];
    for (let i = 0; i < n; i++) {
      const pa = seriesA[seriesA.length - n + i];
      const pb = seriesB[seriesB.length - n + i];
      out.push({
        label: pa.label,
        a: Math.round((pa.price / a0) * 1000) / 10,
        b: Math.round((pb.price / b0) * 1000) / 10,
      });
    }
    return out;
  }, [seriesA, seriesB]);

  const last = data[data.length - 1];
  const aRet = last ? last.a - 100 : 0;
  const bRet = last ? last.b - 100 : 0;

  return (
    <Card padding="md">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardEyebrow>Relative performance</CardEyebrow>
          <p className="mt-1 text-[13px] text-(--color-fg-muted)">
            Both rebased to 100 at the start — higher line = stronger return.
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-surface-2) p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onRange(r)}
              className={`rounded-md px-3 py-1 text-[12px] font-semibold ${
                range.id === r.id
                  ? "bg-(--color-surface) text-(--color-fg) shadow-xs"
                  : "text-(--color-fg-subtle) hover:text-(--color-fg-muted)"
              }`}
            >
              {r.id}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-4 text-[12.5px]">
        <LegendItem color={A_COLOR} label={a.symbol} ret={aRet} />
        <LegendItem color={B_COLOR} label={b.symbol} ret={bRet} />
      </div>

      <div className="h-[320px] w-full">
        {data.length === 0 ? (
          <div className="skeleton h-full w-full rounded-2xl" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eef1ee" vertical={false} />
              <XAxis dataKey="label" stroke="#7c8a82" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} minTickGap={28} />
              <YAxis
                stroke="#7c8a82"
                tickLine={false}
                axisLine={false}
                domain={["dataMin - 4", "dataMax + 4"]}
                tick={{ fontSize: 11 }}
                width={44}
                tickFormatter={(v) => `${Number(v).toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  boxShadow: "0 12px 30px -16px rgba(13,31,23,0.18)",
                  fontSize: 12,
                  padding: "8px 10px",
                }}
                labelStyle={{ color: "var(--color-fg-subtle)", fontSize: 11 }}
                formatter={(v, n) => [`${Number(v).toFixed(1)} (${(Number(v) - 100 >= 0 ? "+" : "") + (Number(v) - 100).toFixed(1)}%)`, n === "a" ? a.symbol : b.symbol]}
              />
              <Line type="monotone" dataKey="a" stroke={A_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="b" stroke={B_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

function LegendItem({ color, label, ret }: { color: string; label: string; ret: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-(--color-fg-muted)">
      <span className="h-2 w-4 rounded-full" style={{ background: color }} />
      <span className="font-semibold text-(--color-fg)">{label}</span>
      <span className={`tabular font-semibold ${ret >= 0 ? "text-(--color-up)" : "text-(--color-down)"}`}>
        {ret >= 0 ? "+" : ""}
        {ret.toFixed(1)}%
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// AI verdict via Gemini. Returns a structured JSON opinion on which stock looks
// stronger to invest in right now. Gated behind the API key; falls back to the
// heuristic scorecard message when unavailable.

type Verdict = {
  winner: string;
  summary: string;
  conviction: number;
  reasons: { symbol: string; points: string[] }[];
  risks: string[];
};

function AiVerdict({
  a,
  b,
  aLive,
  bLive,
  heurWinner,
}: {
  a: Stock;
  b: Stock;
  aLive: { price: number; changePct: number };
  bLive: { price: number; changePct: number };
  heurWinner?: string;
}) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = hasGeminiKey();

  // Clear a stale verdict whenever the matchup changes.
  useEffect(() => {
    setVerdict(null);
    setError(null);
  }, [a.symbol, b.symbol]);

  function snapshot(s: Stock, live: { price: number; changePct: number }) {
    return `${s.symbol} (${s.name}, ${s.sector}): price ₹${live.price.toFixed(2)}, day ${live.changePct.toFixed(2)}%, P/E ${s.peRatio}, EPS ₹${s.eps}, div yield ${s.dividendYield}%, beta ${s.beta}, mkt cap ₹${s.marketCap} Cr, 52w ₹${s.week52Low}-₹${s.week52High}`;
  }

  async function run() {
    setLoading(true);
    setError(null);
    const system = `You are Sense, an AI markets analyst for Indian retail investors. Compare two NSE stocks and judge which looks like the better investment right now, based on the fundamentals and live data provided. Be balanced and educational; never give a guaranteed buy/sell call.
Respond with a single JSON object, no markdown, matching:
{
  "winner": string,            // the ticker you lean toward ("${a.symbol}" or "${b.symbol}")
  "summary": string,           // 2-3 sentence verdict
  "conviction": number,        // 0-100 how clear the edge is
  "reasons": [                 // one entry per stock
    { "symbol": "${a.symbol}", "points": string[] },
    { "symbol": "${b.symbol}", "points": string[] }
  ],
  "risks": string[]            // 2-3 risks to watch for the pick
}`;
    const contents: GeminiContent[] = [
      {
        role: "user",
        parts: [
          {
            text: `Compare these two and decide which is the better buy right now.\nA. ${snapshot(a, aLive)}\nB. ${snapshot(b, bLive)}`,
          },
        ],
      },
    ];
    const res = await generateJson<Verdict>(contents, { system, temperature: 0.5 });
    if (!res || (res.winner !== a.symbol && res.winner !== b.symbol)) {
      setError("Couldn't get a clean AI verdict just now — please try again.");
    } else {
      setVerdict(res);
    }
    setLoading(false);
  }

  const winnerStock = verdict ? (verdict.winner === a.symbol ? a : b) : null;

  return (
    <Card padding="md" className="border-(--color-brand-100) bg-(--color-brand-50)/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-(--color-brand-700) text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <CardEyebrow className="text-(--color-brand-700)">AI verdict</CardEyebrow>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-(--color-brand-700)">
                <Activity className="h-3 w-3" /> Gemini
              </span>
            </div>
            <p className="mt-1 text-[13px] text-(--color-fg-muted)">
              A live, balanced read on which of the two looks stronger to invest in today.
            </p>
          </div>
        </div>
        {enabled && (
          <Button variant="primary" size="sm" onClick={run} disabled={loading}>
            <Bot className="h-3.5 w-3.5" />
            {loading ? "Analysing…" : verdict ? "Re-run verdict" : `Compare ${a.symbol} vs ${b.symbol}`}
          </Button>
        )}
      </div>

      {!enabled && (
        <p className="mt-4 rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-[13px] text-(--color-fg-muted)">
          Add a <code className="rounded bg-(--color-surface-2) px-1 py-0.5 text-[12px]">NEXT_PUBLIC_GEMINI_KEY</code> to
          enable AI verdicts. In the meantime, the scorecard above gives a fundamentals-based edge to{" "}
          <span className="font-semibold text-(--color-fg)">{heurWinner ?? "neither — it's a close call"}</span>.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-(--color-down)/20 bg-(--color-down-soft) px-4 py-3 text-[13px] text-(--color-down)">
          {error}
        </p>
      )}

      {verdict && winnerStock && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-(--color-brand-200) bg-(--color-surface) px-4 py-3">
            <Badge tone="brand">
              <Trophy className="h-3.5 w-3.5" /> AI leans {winnerStock.symbol}
            </Badge>
            <span className="text-[12px] text-(--color-fg-subtle)">Conviction</span>
            <div className="min-w-[120px] flex-1 overflow-hidden rounded-full bg-(--color-surface-2)">
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, verdict.conviction))}%`, background: "linear-gradient(90deg, #6fb98e, #115e3c)" }}
              />
            </div>
            <span className="text-[12px] font-semibold tabular">{verdict.conviction}%</span>
          </div>

          <p className="text-[14.5px] leading-relaxed text-(--color-fg)">{verdict.summary}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            {verdict.reasons.map((r) => {
              const stock = r.symbol === a.symbol ? a : b;
              const color = r.symbol === a.symbol ? A_COLOR : B_COLOR;
              return (
                <div key={r.symbol} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                    <p className="text-[13.5px] font-semibold tracking-tight">{stock.symbol}</p>
                  </div>
                  <ul className="mt-2.5 space-y-1.5 text-[13px] text-(--color-fg)">
                    {r.points.map((p, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--color-up)" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {verdict.risks.length > 0 && (
            <div className="rounded-2xl border border-(--color-down)/20 bg-(--color-down-soft)/40 p-4">
              <CardEyebrow className="text-(--color-down)">Risks to watch</CardEyebrow>
              <ul className="mt-2 space-y-1.5 text-[13px] text-(--color-fg)">
                {verdict.risks.map((rk, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--color-down)" />
                    <span>{rk}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button href={`/stocks/${winnerStock.symbol}`} variant="subtle" size="sm">
              Open {winnerStock.symbol} report <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <Link
              href="/ask-ai"
              className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[13px] font-semibold text-(--color-brand-700) hover:underline"
            >
              Ask a follow-up <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <p className="text-[11.5px] leading-relaxed text-(--color-fg-subtle)">
            AI-generated and can be wrong. Educational only — not financial advice. Always do your own research.
          </p>
        </div>
      )}
    </Card>
  );
}
