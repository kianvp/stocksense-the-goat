// Chat persistence + helpers for AskAi. Pure logic, no React — mirrors the
// stocksense.<feature>.v1 localStorage convention used by watchlist/portfolio.

import { getQuote, type Quote } from "@/lib/api/yahoo";
import { hasGeminiKey } from "@/lib/api/gemini";
import { lookupInstrument, searchUniverse } from "@/lib/universe";
import { NIFTY_50 } from "@/lib/mock-data";

export type RichStock = { symbol: string; name: string; price: number; changePct: number };

export type Rich = {
  confidence?: number;
  stock?: RichStock;
  metrics?: { label: string; value: string }[];
  bullets?: string[];
  risks?: string[];
  opportunities?: string[];
  related?: string[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "ai";
  text: string;
  rich?: Rich;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "stocksense.chats.v1";

const SEED_MESSAGE: ChatMessage = {
  id: "seed-1",
  role: "ai",
  text:
    "Hi, I'm Sense — your AI markets companion. I can help you research stocks, compare peers, and understand earnings. What would you like to look at?",
};

export function newConversation(): Conversation {
  const now = Date.now();
  return {
    id: `c-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: "New chat",
    messages: [SEED_MESSAGE],
    createdAt: now,
    updatedAt: now,
  };
}

export function loadConversations(): Conversation[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[]) {
  try {
    // Only persist chats that have at least one user message — keeps
    // localStorage free of empty drafts from clicking "New chat".
    const worthy = list.filter((c) => c.messages.some((m) => m.role === "user"));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(worthy));
  } catch {
    /* noop */
  }
}

export function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 46 ? clean.slice(0, 46).trimEnd() + "…" : clean;
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// Rendered straight into `/stocks/[symbol]` links, so only accept strings
// that actually look like a ticker before trusting them.
const SAFE_TICKER = /^[A-Z0-9]{1,15}$/;

export function isSafeTicker(s: string): boolean {
  return SAFE_TICKER.test(s);
}

// Common words that would otherwise accidentally substring-match into an
// unrelated company name (e.g. "how" → "Munjal SHOWa", "invest" → "BF
// INVESTments") before the real ticker-bearing word gets evaluated.
const STOPWORDS = new Set([
  "how", "why", "who", "what", "when", "where", "this", "that", "the", "and", "for",
  "are", "was", "will", "should", "doing", "today", "now", "its", "did", "does",
  "invest", "investing", "overvalued", "undervalued", "falling", "rising", "stock",
  "stocks", "share", "shares", "market", "price", "prices", "compare", "explain",
  "about", "with", "from", "have", "has", "not", "you", "your",
]);

/**
 * Best-effort ticker guess from free text: an exact whole-word ticker
 * (e.g. "RELIANCE", "TCS") returns immediately; otherwise every remaining
 * token is fuzzy-matched and the single best-scoring candidate wins (a
 * name/symbol *prefix* match, not just a loose substring) — e.g. "Infosys"
 * → INFY, "Tata Steel" → TATASTEEL.
 */
export function guessSymbol(prompt: string): string | undefined {
  const tokens = prompt
    .split(/[^A-Za-z0-9&-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

  let best: { symbol: string; score: number } | null = null;
  for (const raw of tokens) {
    if (STOPWORDS.has(raw.toLowerCase())) continue;
    const exact = lookupInstrument(raw);
    if (exact) return exact.symbol; // whole-word exact ticker is unambiguous

    const hit = searchUniverse(raw, 1)[0];
    if (!hit) continue;
    const q = raw.toUpperCase();
    const sym = hit.symbol.toUpperCase();
    const name = hit.name.toUpperCase();
    const score = sym === q ? 100 : sym.startsWith(q) ? 80 : sym.includes(q) ? 60 : name.startsWith(q) ? 50 : 30;
    if (!best || score > best.score) best = { symbol: hit.symbol, score };
  }
  // Require at least a prefix match — a loose mid-string "includes" hit
  // (score 30) is too weak to trust for auto-attaching a stock card.
  return best && best.score >= 50 ? best.symbol : undefined;
}

/** Live stock card for a symbol, reusing an already-fetched quote when it matches. */
export async function hydrateStock(
  symbol: string,
  preloaded?: { symbol: string; quote: Quote | null },
): Promise<RichStock | undefined> {
  const sym = symbol.toUpperCase();
  if (!isSafeTicker(sym)) return undefined;
  const known = NIFTY_50.find((s) => s.symbol === sym);
  const name = known?.name ?? lookupInstrument(sym)?.name ?? sym;
  const quote = preloaded && preloaded.symbol.toUpperCase() === sym ? preloaded.quote : await getQuote(sym);
  if (quote) return { symbol: sym, name, price: quote.price, changePct: quote.changePct };
  if (known) return { symbol: sym, name: known.name, price: known.basePrice, changePct: 0 };
  return undefined;
}

export function fallbackMessage(prompt: string): ChatMessage {
  return {
    id: `a-${Date.now()}`,
    role: "ai",
    text: hasGeminiKey()
      ? "I couldn't reach Gemini just now — please try again in a moment."
      : "Add a NEXT_PUBLIC_GEMINI_KEY to enable real AI responses. In the meantime, " +
        `for a question like "${prompt}" I'd start with last earnings, peer multiples, and recent news.`,
    rich: {
      confidence: 30,
      bullets: [
        "Check the latest quarterly results and management commentary",
        "Compare valuation multiples (P/E, P/B) to sector peers",
        "Look at recent news, analyst revisions and insider activity",
      ],
    },
  };
}
