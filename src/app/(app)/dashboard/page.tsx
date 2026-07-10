import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { IndexCard } from "@/components/market/IndexCard";
import { MoversTable } from "@/components/market/MoversTable";
import { SearchHero } from "@/components/market/SearchHero";
import { Greeting } from "@/components/layout/Greeting";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { INDICES, NIFTY_50 } from "@/lib/mock-data";

const SHORTCUTS = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "BHARTIARTL", "TATAMOTORS"];
const TRENDING = ["ADANIENT", "TATAMOTORS", "SBIN", "ICICIBANK", "RELIANCE", "BHARTIARTL"];
const RECENT = ["ADANIENT", "SUNPHARMA", "AXISBANK", "BAJFINANCE", "KOTAKBANK", "HCLTECH"];

export default function DashboardPage() {
  return (
    <div className="space-y-7">
      {/* Greeting / Search hero */}
      <section className="relative overflow-hidden rounded-3xl gradient-brand p-8 sm:p-10">
        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-(--color-brand-400)/15 blur-3xl" />
        <div className="absolute -left-20 -bottom-24 h-72 w-72 rounded-full bg-(--color-brand-300)/10 blur-3xl" />
        <div className="relative">
          <Badge tone="brand" className="bg-white/10 text-white border-white/15">
            <Sparkles className="h-3 w-3" />
            Smart stock discovery
          </Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-[40px] sm:leading-[1.1]">
            <Greeting fallbackName="there" />
          </h1>
          <p className="mt-2 max-w-xl text-[15px] text-white/70">
            Track live Nifty 50 prices, analyse trends, follow your portfolio and get AI insights — all in one place.
          </p>

          <div className="mt-7 max-w-3xl">
            <SearchHero />
          </div>

          <div className="mt-5 flex flex-wrap gap-1.5">
            {SHORTCUTS.map((s) => (
              <Link
                key={s}
                href={`/stocks/${s}`}
                className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium tracking-tight text-white/80 hover:bg-white/15 hover:text-white"
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Indices */}
      <section>
        <SectionHeader title="Markets at a glance" subtitle="Major Indian indices, updating live" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INDICES.slice(0, 4).map((i, idx) => (
            <IndexCard key={i.symbol} symbol={i.symbol} name={i.name} base={i.base} highlight={idx === 0} />
          ))}
        </div>
      </section>

      {/* Movers + Trending */}
      <section className="grid gap-5 lg:grid-cols-2">
        <MoversTable title="Top gainers today" variant="gainers" count={8} />
        <MoversTable title="Top losers today" variant="losers" count={8} />
      </section>

      {/* AI recs + Trending side-by-side */}
      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
            <div>
              <CardTitle>AI Recommendations</CardTitle>
              <p className="mt-1 text-sm text-(--color-fg)">Picks tailored to your watchlist signals</p>
            </div>
            <Button href="/ask-ai" variant="subtle" size="sm">
              <Sparkles className="h-3.5 w-3.5" /> Open AI
            </Button>
          </div>
          <ul className="divide-y divide-(--color-border)">
            {[
              {
                sym: "HDFCBANK",
                title: "Steady compounder, attractive valuation",
                tone: "up" as const,
                tag: "Buy on dips",
                note: "Trading near 1Y P/B of 2.4x — at the lower end of its 5Y band. Strong deposit growth.",
              },
              {
                sym: "INFY",
                title: "Q4 commentary improves visibility",
                tone: "up" as const,
                tag: "Accumulate",
                note: "Management's FY26 guidance suggests mid-single-digit growth. Pricing power intact.",
              },
              {
                sym: "ADANIENT",
                title: "Momentum strong, but valuations stretched",
                tone: "warn" as const,
                tag: "Watch",
                note: "Up 17% in a month. Wait for a pullback near ₹2,050 before adding.",
              },
              {
                sym: "TATASTEEL",
                title: "Global metals cycle weakening",
                tone: "down" as const,
                tag: "Avoid",
                note: "China demand soft. Iron ore prices off 14% from peak. Reduce exposure.",
              },
            ].map((r) => (
              <li key={r.sym}>
                <Link
                  href={`/stocks/${r.sym}`}
                  className="flex items-start gap-4 px-5 py-4 hover:bg-(--color-surface-2)"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-(--color-brand-50) text-[13px] font-semibold tracking-tight text-(--color-brand-700)">
                    {r.sym.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold tracking-tight text-(--color-fg)">{r.sym}</p>
                      <Badge tone={r.tone}>{r.tag}</Badge>
                    </div>
                    <p className="mt-0.5 text-[14px] text-(--color-fg)">{r.title}</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-(--color-fg-muted)">{r.note}</p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-(--color-fg-subtle)" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5">
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
              <CardTitle>Trending today</CardTitle>
              <Link href="/market" className="text-[12px] font-medium text-(--color-brand-700) hover:underline">
                Open market →
              </Link>
            </div>
            <ul>
              {TRENDING.map((sym, i) => {
                const stock = NIFTY_50.find((s) => s.symbol === sym)!;
                return (
                  <li key={sym}>
                    <Link
                      href={`/stocks/${sym}`}
                      className="flex items-center justify-between gap-3 border-b border-(--color-border) px-5 py-3 last:border-b-0 hover:bg-(--color-surface-2)"
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-(--color-surface-2) text-[11px] font-semibold text-(--color-fg-muted)">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-[13.5px] font-semibold tracking-tight text-(--color-fg)">{sym}</p>
                          <p className="text-[11.5px] text-(--color-fg-subtle)">{stock.name}</p>
                        </div>
                      </div>
                      <span className="text-[12.5px] tabular text-(--color-fg-muted)">₹{stock.basePrice.toFixed(2)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My portfolio</CardTitle>
            </CardHeader>
            <p className="text-[14.5px] leading-relaxed text-(--color-fg-muted)">
              Add the stocks you already own and track live value, P&amp;L and sector allocation.
            </p>
            <Button href="/portfolio" variant="outline" size="sm" className="mt-5 w-full">
              Open portfolio <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Card>
        </div>
      </section>

      {/* Recently viewed */}
      <section>
        <SectionHeader title="Recently viewed" subtitle="Stocks you opened in the last 7 days" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RECENT.map((sym) => {
            const s = NIFTY_50.find((x) => x.symbol === sym)!;
            return (
              <Link
                key={sym}
                href={`/stocks/${sym}`}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-(--color-border) bg-(--color-surface) p-4 transition-all hover:-translate-y-0.5 hover:border-(--color-brand-300) hover:shadow-[0_18px_38px_-22px_rgba(13,31,23,0.14)]"
              >
                <div>
                  <p className="text-[13.5px] font-semibold tracking-tight">{s.symbol}</p>
                  <p className="text-[11.5px] text-(--color-fg-subtle)">{s.name}</p>
                  <p className="mt-1 text-[10.5px] uppercase tracking-[0.1em] text-(--color-fg-subtle)">{s.sector}</p>
                </div>
                <div className="text-right">
                  <p className="text-[14px] font-semibold tabular">₹{s.basePrice.toFixed(2)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight text-(--color-fg)">{title}</h2>
        {subtitle && <p className="mt-1 text-[13.5px] text-(--color-fg-muted)">{subtitle}</p>}
      </div>
    </div>
  );
}
