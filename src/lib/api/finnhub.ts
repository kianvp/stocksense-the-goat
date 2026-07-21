// Finnhub REST client. Free tier covers US stocks and general market news.
// Used here primarily for `/news?category=general` since Indian price data
// requires a paid plan — live INR prices come from Yahoo instead.

// Local-dev fallback ONLY. Gated on NODE_ENV so the NEXT_PUBLIC_* read is
// dead-code-eliminated from any production build — the token can never be
// inlined into the shipped bundle. In production the Worker's /__proxy injects
// it from a server-side Secret.
const LOCAL_KEY =
  process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_FINNHUB_KEY : undefined;
const BASE = "https://finnhub.io/api/v1";

export type FinnhubArticle = {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image?: string;
  datetime: number; // unix seconds
  category: string;
  related?: string;
};

export type FinnhubQuote = {
  c: number; // current
  d: number; // change
  dp: number; // change percent
  h: number; // high
  l: number; // low
  o: number; // open
  pc: number; // previous close
  t: number;
};

const newsCache = new Map<string, { at: number; value: FinnhubArticle[] }>();
const NEWS_TTL_MS = 5 * 60_000;

async function call<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const qs = new URLSearchParams(params).toString();
  const target = `${BASE}${path}${qs ? `?${qs}` : ""}`; // no token — added server-side

  // Preferred: same-origin Worker proxy injects the token from a Secret.
  if (typeof window !== "undefined") {
    try {
      const r = await fetch(
        `${window.location.origin}/__proxy?u=${encodeURIComponent(target)}`,
        { cache: "no-store" },
      );
      if (r.ok) return (await r.json()) as T;
      // 404 → no Worker (local dev): fall through to the direct call.
    } catch {
      /* fall through to direct */
    }
  }

  // Local-dev fallback with the public key from .env.local, if present.
  if (!LOCAL_KEY) return null;
  try {
    const r = await fetch(`${target}${qs ? "&" : "?"}token=${LOCAL_KEY}`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function getMarketNews(category: "general" | "forex" | "crypto" | "merger" = "general"): Promise<FinnhubArticle[]> {
  const cached = newsCache.get(category);
  if (cached && Date.now() - cached.at < NEWS_TTL_MS) return cached.value;
  const data = (await call<FinnhubArticle[]>("/news", { category })) ?? [];
  newsCache.set(category, { at: Date.now(), value: data });
  return data;
}

export async function getCompanyNews(
  symbol: string,
  fromDays = 14,
): Promise<FinnhubArticle[]> {
  const to = new Date();
  const from = new Date(to.getTime() - fromDays * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return (await call<FinnhubArticle[]>("/company-news", {
    symbol,
    from: fmt(from),
    to: fmt(to),
  })) ?? [];
}

export async function getUsQuote(symbol: string): Promise<FinnhubQuote | null> {
  return call<FinnhubQuote>("/quote", { symbol });
}

export function hasFinnhubKey() {
  // Optimistic in the browser: the Worker proxy may hold the key even when the
  // client bundle has none (the production shape). A failed call degrades to an
  // empty news list, which the News page already handles.
  return !!LOCAL_KEY || typeof window !== "undefined";
}
