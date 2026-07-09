// Yahoo Finance client. No key. Yahoo doesn't send CORS headers for browsers,
// so requests are routed through a proxy. On Cloudflare our own Worker proxies
// server-side (same-origin, reliable); off-Cloudflare (local dev, GitHub Pages)
// we fall back to public CORS proxies.

const PROXIES: Array<(u: string) => string> = [
  // Same-origin Worker proxy — first choice when present. 404s elsewhere,
  // which makes fetchProxied fall through to the public proxies below.
  (u: string) =>
    typeof window !== "undefined"
      ? `${window.location.origin}/__proxy?u=${encodeURIComponent(u)}`
      : `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

export type Quote = {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  currency: string;
  dayHigh?: number;
  dayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
};

export type Candle = {
  time: number;
  price: number; // close
  open?: number;
  high?: number;
  low?: number;
};

export type ChartRange = "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "2y";
export type ChartInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1wk";

const QUOTE_TTL_MS = 4_000;
const HISTORY_TTL_MS = 60_000;

type CacheEntry<T> = { at: number; value: T };
const quoteCache = new Map<string, CacheEntry<Quote>>();
const chartCache = new Map<string, CacheEntry<{ quote: Quote; candles: Candle[] }>>();
const inflight = new Map<string, Promise<unknown>>();

export function yahooSymbol(symbol: string): string {
  if (symbol.startsWith("^") || symbol.includes(".")) return symbol;
  const indexMap: Record<string, string> = {
    NIFTY50: "^NSEI",
    NIFTY: "^NSEI",
    SENSEX: "^BSESN",
    BANKNIFTY: "^NSEBANK",
    NIFTYBANK: "^NSEBANK",
    NIFTYIT: "^CNXIT",
    NIFTYAUTO: "^CNXAUTO",
    NIFTYPHARMA: "^CNXPHARMA",
    NIFTYFMCG: "^CNXFMCG",
    NIFTYMETAL: "^CNXMETAL",
  };
  if (indexMap[symbol]) return indexMap[symbol];
  // NSE stocks live under `.NS` on Yahoo.
  return `${symbol}.NS`;
}

async function fetchProxied(url: string): Promise<Response> {
  let lastErr: unknown;
  for (const wrap of PROXIES) {
    try {
      const r = await fetch(wrap(url), { cache: "no-store" });
      if (r.ok) return r;
      lastErr = new Error(`${r.status} ${r.statusText}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("All CORS proxies failed");
}

function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

type YahooChartResult = {
  meta: {
    symbol: string;
    currency: string;
    regularMarketPrice: number;
    chartPreviousClose?: number;
    previousClose?: number;
    regularMarketDayHigh?: number;
    regularMarketDayLow?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
  };
  timestamp?: number[];
  indicators: {
    quote: Array<{
      close?: (number | null)[];
      open?: (number | null)[];
      high?: (number | null)[];
      low?: (number | null)[];
    }>;
  };
};

function parseChart(symbol: string, result: YahooChartResult): { quote: Quote; candles: Candle[] } | null {
  const meta = result.meta;
  // A tampered/misbehaving CORS proxy can return malformed JSON that still
  // parses — guard against garbage prices propagating into the UI and P&L math.
  if (typeof meta?.regularMarketPrice !== "number" || !Number.isFinite(meta.regularMarketPrice)) {
    return null;
  }
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice;
  const price = meta.regularMarketPrice;
  const change = price - prev;
  const changePct = prev ? (change / prev) * 100 : 0;
  const quote: Quote = {
    symbol,
    price,
    previousClose: prev,
    change,
    changePct,
    currency: meta.currency,
    dayHigh: meta.regularMarketDayHigh,
    dayLow: meta.regularMarketDayLow,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
  };
  const ts = result.timestamp ?? [];
  const q0 = result.indicators.quote[0] ?? {};
  const closes = q0.close ?? [];
  const opens = q0.open ?? [];
  const highs = q0.high ?? [];
  const lows = q0.low ?? [];
  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    candles.push({
      time: ts[i] * 1000,
      price: c,
      open: opens[i] ?? undefined,
      high: highs[i] ?? undefined,
      low: lows[i] ?? undefined,
    });
  }
  return { quote, candles };
}

export async function getChart(
  symbol: string,
  range: ChartRange = "1d",
  interval: ChartInterval = "1m",
): Promise<{ quote: Quote; candles: Candle[] } | null> {
  const ysym = yahooSymbol(symbol);
  const key = `${ysym}|${range}|${interval}`;
  const cached = chartCache.get(key);
  if (cached && Date.now() - cached.at < HISTORY_TTL_MS) return cached.value;

  return once(`chart:${key}`, async () => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        ysym,
      )}?range=${range}&interval=${interval}&includePrePost=false`;
      const r = await fetchProxied(url);
      const json: { chart: { result?: YahooChartResult[]; error?: { description?: string } } } =
        await r.json();
      const result = json.chart.result?.[0];
      if (!result) return null;
      const parsed = parseChart(symbol, result);
      if (!parsed) return null;
      chartCache.set(key, { at: Date.now(), value: parsed });
      return parsed;
    } catch {
      return null;
    }
  });
}

export async function getQuote(symbol: string): Promise<Quote | null> {
  const ysym = yahooSymbol(symbol);
  const cached = quoteCache.get(ysym);
  if (cached && Date.now() - cached.at < QUOTE_TTL_MS) return cached.value;

  return once(`quote:${ysym}`, async () => {
    const chart = await getChart(symbol, "1d", "1m");
    if (!chart) return null;
    quoteCache.set(ysym, { at: Date.now(), value: chart.quote });
    return chart.quote;
  });
}

export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const results = await Promise.all(symbols.map((s) => getQuote(s).then((q) => [s, q] as const)));
  const out: Record<string, Quote> = {};
  for (const [s, q] of results) if (q) out[s] = q;
  return out;
}

// ---------------------------------------------------------------------------
// Batched quotes via the spark endpoint (up to ~20 symbols per request, no
// crumb/auth needed). Preferred for ticker bars and long lists.

export type SparkQuote = Quote & {
  name?: string;
  volume?: number;
  /** Intraday close series for sparklines. */
  spark: number[];
};

type SparkResponse = {
  spark: {
    result?: Array<{
      symbol: string;
      response?: YahooChartResult[];
    }>;
  };
};

const SPARK_CHUNK = 20;
const SPARK_TTL_MS = 20_000;
const sparkCache = new Map<string, CacheEntry<SparkQuote>>();

type SparkMetaExtra = {
  shortName?: string;
  longName?: string;
  regularMarketVolume?: number;
};

function parseSparkResult(inputSymbol: string, result: YahooChartResult): SparkQuote | null {
  const parsed = parseChart(inputSymbol, result);
  if (!parsed) return null;
  const { quote, candles } = parsed;
  const meta = result.meta as YahooChartResult["meta"] & SparkMetaExtra;
  return {
    ...quote,
    name: meta.longName ?? meta.shortName,
    volume: meta.regularMarketVolume,
    spark: candles.map((c) => c.price),
  };
}

async function fetchSparkChunk(symbols: string[]): Promise<Record<string, SparkQuote>> {
  const bySym = new Map(symbols.map((s) => [yahooSymbol(s), s]));
  const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(
    Array.from(bySym.keys()).join(","),
  )}&range=1d&interval=15m&includePrePost=false`;
  const out: Record<string, SparkQuote> = {};
  try {
    const r = await fetchProxied(url);
    const json: SparkResponse = await r.json();
    for (const item of json.spark.result ?? []) {
      const original = bySym.get(item.symbol);
      const result = item.response?.[0];
      if (!original || !result) continue;
      const parsed = parseSparkResult(original, result);
      if (!parsed) continue;
      sparkCache.set(item.symbol, { at: Date.now(), value: parsed });
      out[original] = parsed;
    }
  } catch {
    // swallow — callers fall back to whatever they have
  }
  return out;
}

/**
 * Live quotes for many symbols at once. Chunks of 20 per request, cached for
 * ~20s. Missing symbols (delisted/unavailable on Yahoo) are simply absent.
 */
export async function getSparkQuotes(symbols: string[]): Promise<Record<string, SparkQuote>> {
  const out: Record<string, SparkQuote> = {};
  const misses: string[] = [];
  for (const s of symbols) {
    const cached = sparkCache.get(yahooSymbol(s));
    if (cached && Date.now() - cached.at < SPARK_TTL_MS) out[s] = cached.value;
    else misses.push(s);
  }
  if (misses.length === 0) return out;

  const chunks: string[][] = [];
  for (let i = 0; i < misses.length; i += SPARK_CHUNK) chunks.push(misses.slice(i, i + SPARK_CHUNK));

  // Cap concurrency so a 200-symbol page doesn't slam the proxy.
  const MAX_PARALLEL = 4;
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL) {
    const batch = chunks.slice(i, i + MAX_PARALLEL);
    const results = await Promise.all(batch.map((c) => once(`spark:${c.join(",")}`, () => fetchSparkChunk(c))));
    for (const r of results) Object.assign(out, r);
  }
  return out;
}
