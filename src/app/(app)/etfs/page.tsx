import { LiveDot } from "@/components/ui/Badge";
import { InstrumentBrowser } from "@/components/market/InstrumentBrowser";

export const metadata = { title: "ETFs — InvestSense" };

export default function EtfsPage() {
  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-(--color-fg-subtle)">
            ETFs
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">Exchange-traded funds</h1>
          <p className="mt-1 text-[13.5px] text-(--color-fg-muted)">
            All 325+ NSE-listed ETFs — index trackers, gold, silver, sector and debt funds — with live prices.
          </p>
        </div>
        <LiveDot />
      </header>
      <InstrumentBrowser kind="etf" />
    </div>
  );
}
