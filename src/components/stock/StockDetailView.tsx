"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles, TrendingUp, AlertTriangle, Activity, Bookmark, Bot } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StockHeader } from "@/components/stock/StockHeader";
import { PriceChart } from "@/components/stock/PriceChart";
import { getChart, type Quote } from "@/lib/api/yahoo";
import { industryPeers, instrumentHref } from "@/lib/universe";
import { getStock, NIFTY_50 } from "@/lib/mock-data";
import { formatINR } from "@/lib/format";

type Props = {
  symbol: string;
  name: string;
  industry?: string;
  kind: "stock" | "etf";
};

export function StockDetailView({ symbol, name, industry, kind }: Props) {
  const curated = getStock(symbol);
  const [meta, setMeta] = useState<Quote | null>(null);

  useEffect(() => {
    let cancelled = false;
    getChart(symbol, "1d", "5m").then((r) => {
      if (!cancelled && r) setMeta(r.quote);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const peers = curated
    ? []
    : industryPeers(symbol, 4);

  const sectorLabel = industry ?? curated?.sector ?? (kind === "etf" ? "Exchange-traded fund" : "NSE Equity");

  return (
    <div className="space-y-6">
      <StockHeader
        symbol={symbol}
        name={name}
        sector={sectorLabel}
        basePrice={curated?.basePrice ?? 0}
      />

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card padding="md">
            <div className="mb-4 flex items-center justify-between">
              <CardEyebrow>Price chart</CardEyebrow>
              <Button variant="outline" size="sm">
                <Bookmark className="h-3.5 w-3.5" /> Add to watchlist
              </Button>
            </div>
            <PriceChart symbol={symbol} basePrice={curated?.basePrice ?? 0} />
          </Card>

          <Card padding="md">
            <div className="mb-4 flex items-center justify-between">
              <CardEyebrow>Key metrics</CardEyebrow>
              <Badge tone="brand">Live</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              <Metric label="Prev close" value={meta ? `₹${formatINR(meta.previousClose, { decimals: 2 })}` : "—"} />
              <Metric label="Day low" value={meta?.dayLow ? `₹${formatINR(meta.dayLow, { decimals: 2 })}` : "—"} />
              <Metric label="Day high" value={meta?.dayHigh ? `₹${formatINR(meta.dayHigh, { decimals: 2 })}` : "—"} />
              <Metric
                label="52W range"
                value={
                  meta?.fiftyTwoWeekLow && meta?.fiftyTwoWeekHigh
                    ? `₹${formatINR(meta.fiftyTwoWeekLow, { decimals: 0 })}–${formatINR(meta.fiftyTwoWeekHigh, { decimals: 0 })}`
                    : "—"
                }
              />
              {curated && (
                <>
                  <Metric label="Market cap" value={`₹${formatINR(curated.marketCap, { decimals: 0 })} Cr`} />
                  <Metric label="P/E ratio" value={curated.peRatio.toFixed(2)} />
                  <Metric label="EPS" value={`₹${curated.eps.toFixed(2)}`} />
                  <Metric label="Dividend yield" value={`${curated.dividendYield.toFixed(2)}%`} />
                </>
              )}
            </div>
          </Card>

          <Card padding="md">
            <CardEyebrow>About</CardEyebrow>
            <p className="mt-3 text-[15px] leading-relaxed text-(--color-fg)">
              {curated?.about ??
                (kind === "etf"
                  ? `${name} is an exchange-traded fund listed on the NSE. ETFs trade like stocks but track an underlying index or asset, offering low-cost diversified exposure.`
                  : `${name} is listed on the National Stock Exchange of India${industry ? ` in the ${industry} industry` : ""}. Live pricing and charts above are streamed from the exchange.`)}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge tone="outline">{sectorLabel}</Badge>
              <Badge tone="outline">NSE</Badge>
              <Badge tone="outline">{kind === "etf" ? "ETF" : "Equity"}</Badge>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card padding="md" className="border-(--color-brand-100) bg-(--color-brand-50)/40">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-(--color-brand-700) text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <CardEyebrow className="text-(--color-brand-700)">AI research</CardEyebrow>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-(--color-brand-700)">
                    <Activity className="h-3 w-3" /> Gemini
                  </span>
                </div>
                <p className="mt-2 text-[14.5px] leading-relaxed text-(--color-fg)">
                  Ask Sense for a live read on {name} — recent momentum, peer comparison, and the
                  risks worth knowing before you dig deeper.
                </p>
                <Button href="/ask-ai" variant="subtle" size="sm" className="mt-4">
                  <Bot className="h-3.5 w-3.5" /> Ask AI about {symbol}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>

          {curated && (
            <>
              <Card padding="md">
                <CardEyebrow>Opportunities</CardEyebrow>
                <ul className="mt-3 space-y-3">
                  {[
                    "Stable earnings growth with low debt-to-equity",
                    "Sector tailwinds expected through FY27",
                    "Trading at a discount to its 5-year mean P/E",
                  ].map((p) => (
                    <li key={p} className="flex items-start gap-2 text-[14px] text-(--color-fg)">
                      <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-(--color-up)" />
                      {p}
                    </li>
                  ))}
                </ul>
              </Card>

              <Card padding="md">
                <CardEyebrow>Risks</CardEyebrow>
                <ul className="mt-3 space-y-3">
                  {[
                    "Higher beta — expect amplified moves vs the index",
                    "Margin pressure from input-cost inflation",
                    "Macro headwinds in export-oriented segments",
                  ].map((p) => (
                    <li key={p} className="flex items-start gap-2 text-[14px] text-(--color-fg)">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-(--color-down)" />
                      {p}
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}

          <Card padding="md">
            <CardEyebrow>Trading snapshot</CardEyebrow>
            <div className="mt-3 space-y-2.5 text-[13.5px]">
              <Row label="Exchange" value="NSE" />
              <Row label="Currency" value="INR" />
              <Row label="Type" value={kind === "etf" ? "ETF" : "Equity"} />
              {industry && <Row label="Industry" value={industry} />}
            </div>
          </Card>
        </div>
      </div>

      {(curated || peers.length > 0) && (
        <Card padding="md">
          <div className="mb-4 flex items-center justify-between">
            <CardEyebrow>Peers{industry ? ` in ${industry}` : curated ? ` in ${curated.sector}` : ""}</CardEyebrow>
            <Link href="/stocks" className="text-[12px] font-semibold text-(--color-brand-700) hover:underline">
              See all →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(curated ? curatedPeers(symbol) : peers).map((p) => (
              <Link
                key={p.symbol}
                href={instrumentHref(p.symbol)}
                className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4 transition-all hover:-translate-y-0.5 hover:border-(--color-brand-300) hover:shadow-[0_18px_38px_-22px_rgba(13,31,23,0.14)]"
              >
                <p className="text-[13.5px] font-semibold tracking-tight">{p.symbol}</p>
                <p className="mt-0.5 truncate text-[11.5px] text-(--color-fg-subtle)">{p.name}</p>
                <p className="mt-2 text-[11px] uppercase tracking-[0.1em] text-(--color-fg-subtle)">
                  {"industry" in p ? (p.industry ?? "NSE") : "NSE"}
                </p>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function curatedPeers(symbol: string) {
  const me = getStock(symbol);
  if (!me) return [];
  return NIFTY_50.filter((s) => s.sector === me.sector && s.symbol !== me.symbol).slice(0, 4);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-(--color-fg-subtle)">{label}</p>
      <p className="mt-1.5 text-[17px] font-semibold tabular tracking-tight text-(--color-fg)">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-(--color-border) pb-2 last:border-b-0 last:pb-0">
      <span className="text-(--color-fg-muted)">{label}</span>
      <span className="font-semibold text-(--color-fg)">{value}</span>
    </div>
  );
}
