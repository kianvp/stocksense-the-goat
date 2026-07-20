// Research Engine — Layer 9: personalization.
//
// Deterministic. Reads the user's local holdings and watchlist (the same
// storage the portfolio/watchlist pages use) and computes how this analysis
// touches them: position weight, watchlist membership, sector concentration.
// No LLM — these are arithmetic facts about the user's own data, and they
// never leave the browser.

import { localGet, storageKey } from "@/lib/storage";
import { lookupInstrument } from "@/lib/universe";
import type { PersonalContext, SectorData } from "./types";

type Holding = { symbol: string; shares: number; avgPrice: number };

function readHoldings(): Holding[] {
  try {
    const raw = localGet(storageKey("holdings"));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { holdings?: Holding[] };
    return Array.isArray(parsed.holdings) ? parsed.holdings : [];
  } catch {
    return [];
  }
}

function readWatchlist(): string[] {
  try {
    const raw = localGet(storageKey("watchlist"));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function personalContext(symbol: string, sector: SectorData | null): PersonalContext {
  const holdings = readHoldings();
  const watchlist = readWatchlist();

  const mine = holdings.find((h) => h.symbol === symbol);
  // Cost-basis weights: live pricing every holding here would burn quote
  // quota for a secondary statistic; cost basis is stable and honest as long
  // as it is labelled as such (see note below).
  const totalCost = holdings.reduce((a, h) => a + h.shares * h.avgPrice, 0);
  const positionWeightPct =
    mine && totalCost > 0 ? (100 * mine.shares * mine.avgPrice) / totalCost : null;

  let sectorExposurePct: number | null = null;
  const industry = sector?.industry ?? lookupInstrument(symbol)?.industry ?? null;
  if (industry && totalCost > 0) {
    const sectorCost = holdings.reduce((a, h) => {
      const inst = lookupInstrument(h.symbol);
      return inst?.industry === industry ? a + h.shares * h.avgPrice : a;
    }, 0);
    sectorExposurePct = (100 * sectorCost) / totalCost;
  }

  const notes: string[] = [];
  if (mine && positionWeightPct !== null) {
    notes.push(
      `You hold ${mine.shares} share${mine.shares === 1 ? "" : "s"} — ${positionWeightPct.toFixed(1)}% of your portfolio at cost.`,
    );
  }
  if (sectorExposurePct !== null && sectorExposurePct > 30) {
    notes.push(
      `Your ${industry} exposure is ${sectorExposurePct.toFixed(0)}% of the portfolio at cost — this analysis moves a concentrated position.`,
    );
  }
  if (!mine && watchlist.includes(symbol)) {
    notes.push("On your watchlist, not in your holdings.");
  }

  return {
    holdsSymbol: !!mine,
    positionWeightPct,
    onWatchlist: watchlist.includes(symbol),
    sectorExposurePct,
    note: notes.length ? notes.join(" ") : null,
  };
}
