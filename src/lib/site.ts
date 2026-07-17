// Canonical site origin, used for metadataBase, robots and the sitemap.
//
// Defaults to the live Workers URL. To move the canonical domain (e.g. to
// https://ask-market.ai), set NEXT_PUBLIC_SITE_URL as a Cloudflare *build*
// variable — it's inlined at build time, so nothing else needs to change.

const FALLBACK = "https://stocksense-the-goat.kianparuchuri.workers.dev";

function normalise(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(trimmed)) return FALLBACK;
  return trimmed;
}

export const SITE_URL = normalise(process.env.NEXT_PUBLIC_SITE_URL || FALLBACK);

export const SITE_NAME = "InvestSense";
export const SITE_TAGLINE = "Smarter Stock Decisions, Powered by AI";
export const SITE_DESCRIPTION =
  "Your intelligent companion for the Indian stock market. Analyse companies, track your portfolio, and get AI-powered insights — all in one place.";

/**
 * App routes behind the Worker's sign-in gate. Kept in step with
 * GATED_PREFIXES in worker/index.ts — crawlers shouldn't chase pages that
 * only ever answer 401.
 */
export const GATED_ROUTES = [
  "/dashboard",
  "/market",
  "/stocks",
  "/etfs",
  "/portfolio",
  "/watchlist",
  "/ask-ai",
  "/news",
  "/glossary",
  "/buy-stocks",
  "/recently-viewed",
  "/quote",
  "/quant",
];
