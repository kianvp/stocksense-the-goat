// Research Engine — Layer 1 (intent) and Layer 2 (data acquisition).
//
// The router is deterministic-first: symbol resolution against the real NSE
// universe plus a keyword intent map covers the overwhelming majority of
// queries at zero cost and zero latency; the LLM is a *fallback* for genuinely
// ambiguous free text, and its answer is still forced through the same
// validation as a deterministic parse.
//
// Data agents fetch from the sources this platform actually has: Yahoo OHLCV
// (via the same-origin Worker proxy), batch peer quotes, and Finnhub general
// market news. Agents for data with no source on this stack (institutional
// ownership, filings, statement-level fundamentals for NSE) deliberately do
// not exist — an agent that can only fail or fabricate is not an agent.

import { getChart, getSparkQuotes } from "@/lib/api/yahoo";
import { getMarketNews } from "@/lib/api/finnhub";
import { generateJson } from "@/lib/api/gemini";
import { searchUniverse, lookupInstrument, industryPeers } from "@/lib/universe";
import { fallbackSeries } from "@/lib/quant-steps";
import type { IndexData, NewsData, PriceData, ResearchIntent, SectorData, TaskSpec } from "./types";

/* --------------------------------------------------- Layer 1: intent */

const INTENT_KEYWORDS: [ResearchIntent, RegExp][] = [
  ["compare", /\b(compare|versus|vs\.?|against|better than)\b/i],
  ["risk_analysis", /\b(risk|drawdown|volatil|downside|safe|exposure)\b/i],
  ["technical_analysis", /\b(technical|rsi|macd|chart|support|resistance|breakout|trend)\b/i],
  ["portfolio_analysis", /\b(portfolio|holding|my (stocks|shares)|allocation|diversif)\b/i],
  ["news_analysis", /\b(news|headline|announce|sentiment)\b/i],
  ["learning", /\b(what is|explain|how does|meaning of|teach)\b/i],
];

/**
 * Deterministic parse: extract symbols by scoring tokens against the
 * universe, classify intent by keyword. Falls back to the LLM only when no
 * symbol can be resolved from a non-empty query.
 */
export async function routeIntent(rawQuery: string, defaultRange: TaskSpec["range"] = "6mo"): Promise<TaskSpec | null> {
  const q = rawQuery.trim();
  if (!q) return null;

  // Direct symbol / name resolution.
  const direct = lookupInstrument(q.toUpperCase());
  const matches = direct
    ? [{ symbol: direct.symbol }]
    : searchUniverse(q, 3).map((m) => ({ symbol: m.symbol }));

  let intent: ResearchIntent = "stock_research";
  for (const [name, re] of INTENT_KEYWORDS) {
    if (re.test(q)) { intent = name; break; }
  }

  if (matches.length > 0) {
    return {
      intent,
      symbol: matches[0].symbol,
      symbolB: intent === "compare" ? matches[1]?.symbol : undefined,
      range: defaultRange,
      routedBy: "deterministic",
      rawQuery: q,
    };
  }

  // LLM fallback — asked ONLY to name a ticker + intent, and its ticker is
  // re-validated against the universe before being trusted.
  const guess = await generateJson<{ symbol?: string; intent?: string }>(
    [{ role: "user", parts: [{ text:
      `Query about Indian stock markets: "${q}".\n` +
      `Return JSON {"symbol": "<NSE ticker most relevant, or empty>", "intent": "<one of stock_research|technical_analysis|risk_analysis|news_analysis|learning>"}` } ] }],
    { temperature: 0 },
  );
  const validated = guess?.symbol ? lookupInstrument(guess.symbol.toUpperCase()) : undefined;
  if (!validated) return null;
  const llmIntent = INTENT_KEYWORDS.some(([name]) => name === guess?.intent)
    ? (guess!.intent as ResearchIntent)
    : "stock_research";
  return {
    intent: llmIntent,
    symbol: validated.symbol,
    range: defaultRange,
    routedBy: "llm",
    rawQuery: q,
  };
}

/* ----------------------------------------------- Layer 2: data agents */

/** Price agent: OHLCV history. Falls back to a labelled synthetic series so
 *  deterministic layers can still demo offline — LLM layers refuse it. */
export async function priceAgent(symbol: string, range: TaskSpec["range"]): Promise<PriceData> {
  const res = await getChart(symbol, range, "1d");
  const bars = res?.candles.filter((c) => c.price > 0) ?? [];
  if (bars.length > 30) {
    const lastBar = bars[bars.length - 1];
    return {
      symbol,
      currency: res!.quote.currency || "INR",
      // Candle names its close "price"; the research contract calls it close.
      bars: bars.map((c) => ({
        time: c.time, close: c.price, open: c.open, high: c.high, low: c.low, volume: c.volume,
      })),
      lastClose: lastBar.price,
      previousClose: bars[bars.length - 2]?.price ?? lastBar.price,
      synthetic: false,
      asOf: lastBar.time,
    };
  }
  const prices = fallbackSeries(symbol.length, 1500);
  const dayMs = 86_400_000;
  const t0 = Date.now() - (prices.length - 1) * dayMs;
  return {
    symbol,
    currency: "INR",
    bars: prices.map((p, i) => ({ time: t0 + i * dayMs, close: p })),
    lastClose: prices[prices.length - 1],
    previousClose: prices[prices.length - 2],
    synthetic: true,
    asOf: Date.now(),
  };
}

/** Benchmark agent: NIFTY 50 series for beta / correlation features. */
export async function indexAgent(range: TaskSpec["range"]): Promise<IndexData | null> {
  const res = await getChart("NIFTY50", range, "1d");
  const candles = res?.candles.filter((c) => c.price > 0) ?? [];
  if (candles.length < 30) return null;
  return {
    symbol: "NIFTY50",
    closes: candles.map((c) => c.price),
    times: candles.map((c) => c.time),
  };
}

/** Sector agent: real industry peers (Nifty 500 metadata) + one batch quote
 *  call → breadth, median move, relative strength. Deterministic. */
export async function sectorAgent(symbol: string, ownChangePct: number | null): Promise<SectorData> {
  const me = lookupInstrument(symbol);
  const peers = industryPeers(symbol, 10);
  if (!me?.industry || peers.length < 2) {
    return { industry: me?.industry ?? null, peers: [], breadthUp: 0, medianChangePct: 0, relativeStrength: 0 };
  }
  const quotes = await getSparkQuotes(peers.map((p) => p.symbol));
  const rows = peers
    .map((p) => {
      const q = quotes[p.symbol];
      return q ? { symbol: p.symbol, name: p.name, changePct: q.changePct, price: q.price } : null;
    })
    .filter((x): x is SectorData["peers"][number] => x !== null);
  if (rows.length === 0) {
    return { industry: me.industry, peers: [], breadthUp: 0, medianChangePct: 0, relativeStrength: 0 };
  }
  const sorted = rows.map((r) => r.changePct).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    industry: me.industry,
    peers: rows,
    breadthUp: rows.filter((r) => r.changePct > 0).length / rows.length,
    medianChangePct: median,
    relativeStrength: ownChangePct !== null ? ownChangePct - median : 0,
  };
}

/** News agent: Finnhub general market headlines (free tier's honest scope —
 *  NSE company-level news requires a paid plan and is not faked here). */
export async function newsAgent(): Promise<NewsData> {
  const articles = await getMarketNews("general");
  return {
    scope: "market",
    articles: articles.slice(0, 10).map((a) => ({
      headline: a.headline,
      source: a.source,
      datetime: a.datetime,
      summary: (a.summary || "").slice(0, 240),
    })),
  };
}
