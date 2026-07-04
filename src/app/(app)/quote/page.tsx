"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { StockDetailView } from "@/components/stock/StockDetailView";
import { lookupInstrument } from "@/lib/universe";

export default function QuotePage() {
  return (
    <Suspense fallback={<div className="skeleton h-40 w-full rounded-3xl" />}>
      <QuoteInner />
    </Suspense>
  );
}

function QuoteInner() {
  const params = useSearchParams();
  const symbol = (params.get("s") ?? "").toUpperCase().trim();
  const inst = symbol ? lookupInstrument(symbol) : undefined;

  if (!symbol || !inst) {
    return (
      <div className="rounded-3xl border border-dashed border-(--color-border) bg-(--color-surface) p-16 text-center">
        <p className="text-[17px] font-semibold tracking-tight">
          {symbol ? `“${symbol}” isn't in the NSE universe.` : "No instrument selected."}
        </p>
        <p className="mt-2 text-[13.5px] text-(--color-fg-muted)">
          Browse the full list of stocks and ETFs instead.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/stocks" className="rounded-xl bg-(--color-brand-700) px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-(--color-brand-800)">
            All stocks
          </Link>
          <Link href="/etfs" className="rounded-xl border border-(--color-border) px-4 py-2 text-[13.5px] font-semibold text-(--color-fg-muted) hover:border-(--color-brand-300)">
            All ETFs
          </Link>
        </div>
      </div>
    );
  }

  return <StockDetailView symbol={inst.symbol} name={inst.name} industry={inst.industry} kind={inst.kind} />;
}
