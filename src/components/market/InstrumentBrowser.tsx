"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, Filter, ChevronDown } from "lucide-react";
import {
  ALL_STOCKS,
  ALL_ETFS,
  INDUSTRIES,
  searchUniverse,
  instrumentHref,
  type Instrument,
} from "@/lib/universe";
import { useLivePrices } from "@/lib/use-live-prices";
import { Delta } from "@/components/ui/Delta";
import { cn } from "@/lib/cn";

const PAGE = 48;

const STOCK_SCOPES = [
  { id: "nifty50", label: "Nifty 50" },
  { id: "nifty500", label: "Nifty 500" },
  { id: "all", label: `All stocks` },
] as const;

const SORTS = [
  { id: "az", label: "A → Z" },
  { id: "gainers", label: "Top gainers" },
  { id: "losers", label: "Top losers" },
] as const;

export function InstrumentBrowser({ kind }: { kind: "stock" | "etf" }) {
  const [scope, setScope] = useState<(typeof STOCK_SCOPES)[number]["id"]>("nifty50");
  const [industry, setIndustry] = useState("All");
  const [underlying, setUnderlying] = useState("All");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("az");
  const [q, setQ] = useState("");
  const [visible, setVisible] = useState(PAGE);

  const underlyings = useMemo(() => {
    if (kind !== "etf") return [];
    const counts = new Map<string, number>();
    for (const e of ALL_ETFS) {
      const u = e.underlying ?? "Other";
      counts.set(u, (counts.get(u) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([u]) => u);
  }, [kind]);

  const base = useMemo<Instrument[]>(() => {
    if (kind === "etf") {
      return underlying === "All" ? ALL_ETFS : ALL_ETFS.filter((e) => e.underlying === underlying);
    }
    let list =
      scope === "nifty50"
        ? ALL_STOCKS.filter((s) => s.inNifty50)
        : scope === "nifty500"
          ? ALL_STOCKS.filter((s) => s.inNifty500)
          : ALL_STOCKS;
    if (industry !== "All") list = list.filter((s) => s.industry === industry);
    return list;
  }, [kind, scope, industry, underlying]);

  const filtered = useMemo(() => {
    const query = q.trim();
    if (!query) return base;
    const hits = searchUniverse(query, 200);
    const allowed = new Set(base.map((b) => b.symbol));
    return hits.filter((h) => allowed.has(h.symbol));
  }, [base, q]);

  const shown = filtered.slice(0, visible);
  const prices = useLivePrices(
    useMemo(() => shown.map((s) => ({ symbol: s.symbol, basePrice: 0 })), [shown]),
  );

  const ranked = useMemo(() => {
    if (sort === "az") return shown;
    const arr = [...shown];
    if (sort === "gainers") arr.sort((a, b) => (prices[b.symbol]?.changePct ?? -999) - (prices[a.symbol]?.changePct ?? -999));
    else arr.sort((a, b) => (prices[a.symbol]?.changePct ?? 999) - (prices[b.symbol]?.changePct ?? 999));
    return arr;
  }, [shown, sort, prices]);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-fg-subtle)" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setVisible(PAGE);
              }}
              placeholder={kind === "etf" ? "Search 325+ ETFs…" : "Search 2,350+ NSE stocks…"}
              className="h-11 w-full rounded-xl border border-(--color-border) bg-(--color-surface) pl-10 pr-3 text-sm placeholder:text-(--color-fg-subtle) focus:border-(--color-brand-300) focus:ring-4 focus:ring-(--color-brand-50) focus:outline-none"
            />
          </div>

          {kind === "stock" && (
            <div className="flex items-center gap-1 rounded-xl border border-(--color-border) bg-(--color-surface-2) p-1">
              {STOCK_SCOPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setScope(s.id);
                    setVisible(PAGE);
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-[12.5px] font-semibold",
                    scope === s.id
                      ? "bg-(--color-surface) text-(--color-fg) shadow-xs"
                      : "text-(--color-fg-subtle) hover:text-(--color-fg-muted)",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {kind === "stock" && scope !== "all" && (
            <SelectBox
              value={industry}
              onChange={(v) => {
                setIndustry(v);
                setVisible(PAGE);
              }}
              options={["All", ...INDUSTRIES]}
              icon={<Filter className="h-4 w-4 text-(--color-fg-subtle)" />}
            />
          )}

          {kind === "etf" && (
            <SelectBox
              value={underlying}
              onChange={(v) => {
                setUnderlying(v);
                setVisible(PAGE);
              }}
              options={["All", ...underlyings]}
              icon={<Filter className="h-4 w-4 text-(--color-fg-subtle)" />}
            />
          )}

          <SelectBox
            value={sort}
            onChange={(v) => setSort(v as typeof sort)}
            options={SORTS.map((s) => s.id)}
            labels={Object.fromEntries(SORTS.map((s) => [s.id, s.label]))}
          />
        </div>
        <p className="mt-3 text-[12px] text-(--color-fg-subtle)">
          {filtered.length.toLocaleString("en-IN")} {kind === "etf" ? "ETFs" : "stocks"}
          {q.trim() ? ` matching “${q.trim()}”` : ""} · live prices load as you browse
        </p>
      </div>

      {/* Rows */}
      <div className="overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-surface)">
        <div className="hidden grid-cols-[1.7fr_1fr_120px_110px] gap-3 border-b border-(--color-border) bg-(--color-surface-2)/60 px-5 py-2.5 text-[10.5px] uppercase tracking-[0.14em] font-semibold text-(--color-fg-subtle) sm:grid">
          <span>Instrument</span>
          <span>{kind === "etf" ? "Underlying" : "Industry"}</span>
          <span className="text-right">Price</span>
          <span className="text-right">Change</span>
        </div>
        <ul className="divide-y divide-(--color-border)">
          {ranked.map((s) => {
            const tick = prices[s.symbol];
            const hasPrice = tick && tick.price > 0;
            return (
              <li key={s.symbol}>
                <Link
                  href={instrumentHref(s.symbol)}
                  className="grid grid-cols-[1.5fr_110px] items-center gap-3 px-5 py-3 hover:bg-(--color-surface-2)/70 sm:grid-cols-[1.7fr_1fr_120px_110px]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold tracking-tight text-(--color-fg)">
                      {s.symbol}
                      {s.inNifty50 && (
                        <span className="ml-2 rounded bg-(--color-brand-50) px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide text-(--color-brand-700)">
                          N50
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11.5px] text-(--color-fg-subtle)">{s.name}</p>
                  </div>
                  <p className="hidden truncate text-[12px] text-(--color-fg-muted) sm:block">
                    {kind === "etf" ? (s.underlying ?? "—") : (s.industry ?? "—")}
                  </p>
                  <p className="hidden text-right text-[14px] font-semibold tabular tracking-tight sm:block">
                    {hasPrice ? `₹${tick.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="skeleton inline-block h-4 w-16" />}
                  </p>
                  <div className="text-right">
                    {hasPrice ? <Delta value={tick.changePct} /> : <span className="skeleton inline-block h-4 w-12" />}
                    <p className="mt-0.5 text-[13px] font-semibold tabular sm:hidden">
                      {hasPrice ? `₹${tick.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : ""}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        {ranked.length === 0 && (
          <div className="p-12 text-center text-sm text-(--color-fg-muted)">Nothing matches those filters.</div>
        )}
      </div>

      {filtered.length > visible && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE)}
          className="mx-auto flex items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-surface) px-5 py-2.5 text-[13.5px] font-semibold text-(--color-fg-muted) hover:border-(--color-brand-300) hover:text-(--color-brand-700)"
        >
          Load {Math.min(PAGE, filtered.length - visible)} more
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function SelectBox({
  value,
  onChange,
  options,
  labels,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string>;
  icon?: React.ReactNode;
}) {
  return (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">{icon}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-11 appearance-none rounded-xl border border-(--color-border) bg-(--color-surface) ${
          icon ? "pl-10" : "pl-3.5"
        } pr-9 text-sm focus:border-(--color-brand-300) focus:ring-4 focus:ring-(--color-brand-50) focus:outline-none`}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--color-fg-subtle)">▾</span>
    </div>
  );
}
