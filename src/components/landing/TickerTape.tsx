"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown } from "lucide-react";
import { getSparkQuotes, type SparkQuote } from "@/lib/api/yahoo";
import { instrumentHref } from "@/lib/universe";

const TAPE_SYMBOLS = [
  "NIFTY50", "SENSEX", "BANKNIFTY",
  "RELIANCE", "HDFCBANK", "TCS", "BHARTIARTL", "ICICIBANK", "SBIN", "INFY",
  "BAJFINANCE", "HINDUNILVR", "ITC", "LT", "MARUTI", "SUNPHARMA", "TITAN",
  "TATAMOTORS", "ADANIENT", "NTPC", "ULTRACEMCO", "AXISBANK", "WIPRO", "NIFTYBEES",
];

const INDEX_LABELS: Record<string, string> = {
  NIFTY50: "NIFTY 50",
  SENSEX: "SENSEX",
  BANKNIFTY: "BANK NIFTY",
};

export function TickerTape() {
  const [quotes, setQuotes] = useState<Record<string, SparkQuote>>({});

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      const q = await getSparkQuotes(TAPE_SYMBOLS);
      if (!cancelled && Object.keys(q).length > 0) setQuotes(q);
    }
    pull();
    const id = setInterval(pull, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const items = TAPE_SYMBOLS.map((sym) => ({ sym, q: quotes[sym] }));

  return (
    <div className="marquee-hover relative overflow-hidden border-y border-white/10 bg-white/[0.03] py-3 backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-(--color-brand-950) to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-(--color-brand-950) to-transparent" />
      <div className="animate-marquee flex w-max" style={{ "--marquee-duration": "64s" } as React.CSSProperties}>
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
            {items.map(({ sym, q }) => {
              const up = (q?.changePct ?? 0) >= 0;
              const isIndex = sym in INDEX_LABELS;
              const inner = (
                <span className="mx-6 inline-flex items-center gap-2.5 whitespace-nowrap">
                  <span className="text-[12px] font-semibold tracking-wide text-white/85">
                    {INDEX_LABELS[sym] ?? sym}
                  </span>
                  {q ? (
                    <>
                      <span className="text-[12.5px] tabular font-medium text-white/70">
                        {isIndex ? "" : "₹"}
                        {q.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11.5px] tabular font-semibold ${
                          up ? "text-[#4ade80]" : "text-[#f87171]"
                        }`}
                      >
                        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {up ? "+" : ""}
                        {q.changePct.toFixed(2)}%
                      </span>
                    </>
                  ) : (
                    <span className="inline-block h-3 w-16 rounded bg-white/10" />
                  )}
                  <span className="ml-4 h-1 w-1 rounded-full bg-white/15" />
                </span>
              );
              return isIndex ? (
                <span key={`${copy}-${sym}`}>{inner}</span>
              ) : (
                <Link key={`${copy}-${sym}`} href={instrumentHref(sym)} className="hover:opacity-80">
                  {inner}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
