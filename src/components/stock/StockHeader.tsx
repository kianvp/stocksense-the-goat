"use client";

import { useLivePrice } from "@/lib/use-live-prices";
import { formatINR } from "@/lib/format";
import { DeltaValue } from "@/components/ui/Delta";
import { LiveDot } from "@/components/ui/Badge";

export function StockHeader({ symbol, name, sector, basePrice }: { symbol: string; name: string; sector: string; basePrice: number }) {
  const tick = useLivePrice(symbol, basePrice, 0.0028);
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 rounded-3xl bg-(--color-surface) border border-(--color-border) p-6 sm:p-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-(--color-fg-subtle)">
          {sector} · NSE
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <h1 className="text-[34px] font-semibold tracking-[-0.025em] text-(--color-fg) sm:text-[40px]">
            {name}
          </h1>
          <p className="text-[15px] font-medium text-(--color-fg-subtle)">{symbol}.NS</p>
        </div>
      </div>
      <div className="text-right">
        <LiveDot className="justify-end" />
        {tick.price > 0 ? (
          <>
            <p className="mt-2 text-[38px] font-semibold tracking-tight tabular text-(--color-fg) sm:text-[44px]">
              ₹{formatINR(tick.price, { decimals: 2 })}
            </p>
            <div className="mt-1">
              <DeltaValue value={tick.change} pct={tick.changePct} className="text-[14px]" />
            </div>
          </>
        ) : (
          <div className="mt-3 space-y-2">
            <span className="skeleton block h-10 w-44" />
            <span className="skeleton block h-4 w-28" />
          </div>
        )}
      </div>
    </header>
  );
}
