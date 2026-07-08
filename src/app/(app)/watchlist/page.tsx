"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bookmark, Plus, X, Bell } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Delta } from "@/components/ui/Delta";
import { NIFTY_50 } from "@/lib/mock-data";
import { useLivePrices } from "@/lib/use-live-prices";
import { formatINR } from "@/lib/format";

const STORAGE_KEY = "stocksense.watchlist.v1";
const DEFAULT = ["RELIANCE", "INFY", "HDFCBANK", "TATAMOTORS", "ADANIENT"];

export default function WatchlistPage() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
        setSymbols(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
    } catch {}
  }, [symbols]);

  const list = symbols.map((sym) => NIFTY_50.find((s) => s.symbol === sym)).filter(Boolean) as typeof NIFTY_50;
  const prices = useLivePrices(list.map((s) => ({ symbol: s.symbol, basePrice: s.basePrice })));

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    const stock = NIFTY_50.find((s) => s.symbol === sym);
    if (!stock) return setError(`${sym} is not in our Nifty 50 universe.`);
    if (symbols.includes(sym)) return setError(`${sym} is already in your watchlist.`);
    setSymbols((arr) => [...arr, sym]);
    setInput("");
  }

  function remove(sym: string) {
    setSymbols((arr) => arr.filter((s) => s !== sym));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-(--color-fg-subtle)">
            Watchlist
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">Stocks worth watching</h1>
          <p className="mt-1 text-[13.5px] text-(--color-fg-muted)">
            Track the stocks you care about. Prices update every second during market hours.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-[12px] font-medium text-(--color-fg-muted)">
          <Bookmark className="h-3.5 w-3.5" /> {list.length} stocks
        </span>
      </header>

      <Card padding="md">
        <CardEyebrow className="mb-3">Add a stock</CardEyebrow>
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1.6fr_auto]">
          <div>
            <Label htmlFor="ticker">Ticker</Label>
            <Input
              id="ticker"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder="e.g. SBIN"
              className="mt-1.5"
              list="ss-watchlist-tickers"
            />
            <datalist id="ss-watchlist-tickers">
              {NIFTY_50.map((s) => (
                <option key={s.symbol} value={s.symbol}>{s.name}</option>
              ))}
            </datalist>
          </div>
          <div className="flex items-end">
            <Button type="submit" size="md" className="w-full sm:w-auto">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </form>
        {error && (
          <p className="mt-3 rounded-lg border border-(--color-down)/20 bg-(--color-down-soft) px-3 py-2 text-[13px] text-(--color-down)">
            {error}
          </p>
        )}
      </Card>

      <Card padding="none">
        <div className="border-b border-(--color-border) px-5 py-4">
          <CardEyebrow>Your watchlist</CardEyebrow>
        </div>
        {list.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Bookmark className="mx-auto h-7 w-7 text-(--color-fg-subtle)" />
            <p className="mt-3 text-[14.5px] font-semibold text-(--color-fg)">Your watchlist is empty</p>
            <p className="mt-1 text-[13px] text-(--color-fg-muted)">Add a stock above to start tracking it here.</p>
          </div>
        ) : (
          <ul>
            {list.map((s) => {
              const tick = prices[s.symbol];
              return (
                <li key={s.symbol} className="group flex items-center justify-between gap-4 border-b border-(--color-border) px-5 py-4 last:border-b-0 hover:bg-(--color-surface-2)">
                  <Link href={`/stocks/${s.symbol}`} className="flex flex-1 items-center gap-3 min-w-0">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-(--color-brand-50) text-[12.5px] font-semibold text-(--color-brand-700)">
                      {s.symbol.slice(0, 2)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold tracking-tight">{s.symbol}</p>
                      <p className="truncate text-[12px] text-(--color-fg-subtle)">{s.name} · {s.sector}</p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <p className="text-[15px] font-semibold tabular">₹{formatINR(tick?.price ?? s.basePrice, { decimals: 2 })}</p>
                      <Delta value={tick?.changePct ?? 0} size="xs" />
                    </div>
                    <button
                      type="button"
                      className="hidden sm:grid h-8 w-8 place-items-center rounded-lg border border-(--color-border) bg-(--color-surface) text-(--color-fg-subtle) hover:bg-(--color-brand-50) hover:text-(--color-brand-700)"
                      title="Alerts"
                      aria-label="Set alerts"
                    >
                      <Bell className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s.symbol)}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-(--color-border) bg-(--color-surface) text-(--color-fg-subtle) hover:bg-(--color-down-soft) hover:text-(--color-down)"
                      title="Remove"
                      aria-label={`Remove ${s.symbol}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
