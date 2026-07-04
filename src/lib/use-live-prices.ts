"use client";

import { useEffect, useRef, useState } from "react";
import { getQuote, getSparkQuotes, type SparkQuote } from "@/lib/api/yahoo";

export type Tick = { price: number; change: number; changePct: number };

const SINGLE_REFRESH_MS = 10_000;
const BATCH_REFRESH_MS = 30_000;
const JITTER_MS = 1_500;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function jitter(price: number, prevClose: number, volatility: number): Tick {
  const drift = (Math.random() - 0.5) * 2 * volatility * price;
  const next = Math.max(price * 0.998, Math.min(price * 1.002, price + drift));
  const change = next - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;
  return { price: round2(next), change: round2(change), changePct: round2(changePct) };
}

/**
 * Live quote for a single symbol. Pulls from Yahoo every ~10s and jitters
 * around the anchor in between so the value feels live. Falls back silently
 * to the basePrice anchor if the API is unreachable.
 */
export function useLivePrice(symbol: string, basePrice: number, volatility = 0.0025) {
  const [tick, setTick] = useState<Tick>({ price: basePrice, change: 0, changePct: 0 });
  const anchorRef = useRef({ price: basePrice, prevClose: basePrice });

  useEffect(() => {
    anchorRef.current = { price: basePrice, prevClose: basePrice };
    setTick({ price: basePrice, change: 0, changePct: 0 });
  }, [basePrice, symbol]);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      const q = await getQuote(symbol);
      if (cancelled || !q) return;
      anchorRef.current = { price: q.price, prevClose: q.previousClose };
      setTick({
        price: round2(q.price),
        change: round2(q.change),
        changePct: round2(q.changePct),
      });
    }
    pull();
    const id = setInterval(pull, SINGLE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  useEffect(() => {
    const id = setInterval(() => {
      const { price, prevClose } = anchorRef.current;
      if (price <= 0) return; // no anchor yet (unknown symbol) — wait for a real quote
      setTick(jitter(price, prevClose, volatility));
    }, JITTER_MS);
    return () => clearInterval(id);
  }, [volatility]);

  return tick;
}

/**
 * Live quotes for a list of symbols. Fetches the full batch every ~30s and
 * jitters each price between refreshes. Symbols missing from the API
 * response keep their basePrice anchor.
 */
export function useLivePrices(stocks: Array<{ symbol: string; basePrice: number }>) {
  const [prices, setPrices] = useState<Record<string, Tick>>(() => {
    const init: Record<string, Tick> = {};
    for (const s of stocks) init[s.symbol] = { price: s.basePrice, change: 0, changePct: 0 };
    return init;
  });

  const anchorsRef = useRef<Record<string, { price: number; prevClose: number }>>({});
  const stocksRef = useRef(stocks);

  useEffect(() => {
    stocksRef.current = stocks;
    // Seed anchors for new symbols using basePrice.
    for (const s of stocks) {
      if (!anchorsRef.current[s.symbol]) {
        anchorsRef.current[s.symbol] = { price: s.basePrice, prevClose: s.basePrice };
      }
    }
  }, [stocks]);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      const syms = stocksRef.current.map((s) => s.symbol);
      if (syms.length === 0) return;
      const quotes: Record<string, SparkQuote> = await getSparkQuotes(syms);
      if (cancelled) return;
      setPrices((prev) => {
        const next: Record<string, Tick> = { ...prev };
        for (const s of stocksRef.current) {
          const q = quotes[s.symbol];
          if (q) {
            anchorsRef.current[s.symbol] = { price: q.price, prevClose: q.previousClose };
            next[s.symbol] = {
              price: round2(q.price),
              change: round2(q.change),
              changePct: round2(q.changePct),
            };
          }
        }
        return next;
      });
    }
    pull();
    const id = setInterval(pull, BATCH_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setPrices((prev) => {
        const next: Record<string, Tick> = { ...prev };
        for (const s of stocksRef.current) {
          const anchor = anchorsRef.current[s.symbol] ?? { price: s.basePrice, prevClose: s.basePrice };
          if (anchor.price <= 0) continue; // keep waiting for a real quote
          next[s.symbol] = jitter(anchor.price, anchor.prevClose, 0.0025);
        }
        return next;
      });
    }, JITTER_MS);
    return () => clearInterval(id);
  }, []);

  return prices;
}
