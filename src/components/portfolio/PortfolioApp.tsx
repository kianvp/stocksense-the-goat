"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Plus, Wallet, TrendingUp, ChartPie, X } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Label } from "@/components/ui/Input";
import { Delta } from "@/components/ui/Delta";
import { useLivePrices } from "@/lib/use-live-prices";
import { NIFTY_50 } from "@/lib/mock-data";
import { formatINR } from "@/lib/format";

const STARTING_CASH = 500000;
const STORAGE_KEY = "stocksense.portfolio.v1";

type Position = { symbol: string; shares: number; avgPrice: number };
type State = { cash: number; positions: Position[]; valueTrend: { t: number; v: number }[] };

const SECTOR_COLORS: Record<string, string> = {
  Banking: "#115e3c",
  IT: "#1f7a4f",
  Energy: "#3d9a6b",
  Auto: "#b27a00",
  FMCG: "#6fb98e",
  Pharma: "#1d6fb8",
  Infra: "#c4361c",
  Telecom: "#a6d4b8",
  Power: "#0c4a30",
  Metals: "#8c5a00",
  Finance: "#093a26",
  Cement: "#7c8a82",
  Insurance: "#4a5a51",
  Healthcare: "#088a52",
  Paints: "#dc6c1c",
  Consumer: "#d2eadb",
};

function loadState(): State {
  if (typeof window === "undefined") return { cash: STARTING_CASH, positions: [], valueTrend: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { cash: STARTING_CASH, positions: [], valueTrend: [] };
    const parsed = JSON.parse(raw) as State;
    return {
      cash: typeof parsed.cash === "number" ? parsed.cash : STARTING_CASH,
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      valueTrend: Array.isArray(parsed.valueTrend) ? parsed.valueTrend : [],
    };
  } catch {
    return { cash: STARTING_CASH, positions: [], valueTrend: [] };
  }
}

export function PortfolioApp() {
  const [state, setState] = useState<State>(() => ({
    cash: STARTING_CASH,
    positions: [],
    valueTrend: [{ t: Date.now(), v: STARTING_CASH }],
  }));
  const [tickerInput, setTickerInput] = useState("");
  const [sharesInput, setSharesInput] = useState("10");
  const [error, setError] = useState<string | null>(null);

  // Hydrate from localStorage after mount
  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const livePrices = useLivePrices(state.positions.flatMap((p) => {
    const s = NIFTY_50.find((x) => x.symbol === p.symbol);
    return s ? [{ symbol: p.symbol, basePrice: s.basePrice }] : [];
  }));

  const enrichedPositions = useMemo(() => {
    return state.positions.flatMap((p) => {
      const stock = NIFTY_50.find((x) => x.symbol === p.symbol);
      if (!stock) return [];
      const current = livePrices[p.symbol]?.price ?? stock.basePrice;
      const invested = p.avgPrice * p.shares;
      const value = current * p.shares;
      const pl = value - invested;
      const plPct = invested ? (pl / invested) * 100 : 0;
      return [{ ...p, stock, current, invested, value, pl, plPct }];
    });
  }, [state.positions, livePrices]);

  const invested = enrichedPositions.reduce((sum, p) => sum + p.invested, 0);
  const value = enrichedPositions.reduce((sum, p) => sum + p.value, 0);
  const pl = value - invested;
  const plPct = invested ? (pl / invested) * 100 : 0;
  const totalEquity = state.cash + value;

  // Update the value trend every 5 seconds
  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => {
        const newPoint = { t: Date.now(), v: prev.cash + value };
        const trend = [...prev.valueTrend, newPoint].slice(-60);
        return { ...prev, valueTrend: trend };
      });
    }, 5000);
    return () => clearInterval(id);
  }, [value]);

  const allocation = useMemo(() => {
    const bySector: Record<string, number> = {};
    for (const p of enrichedPositions) {
      bySector[p.stock.sector] = (bySector[p.stock.sector] ?? 0) + p.value;
    }
    return Object.entries(bySector).map(([sector, v]) => ({ name: sector, value: v }));
  }, [enrichedPositions]);

  function addPosition(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const sym = tickerInput.trim().toUpperCase();
    const shares = parseInt(sharesInput, 10);
    if (!sym) return setError("Enter a ticker symbol.");
    if (!shares || shares <= 0) return setError("Enter a positive number of shares.");
    const stock = NIFTY_50.find((s) => s.symbol === sym);
    if (!stock) return setError(`${sym} is not in our Nifty 50 universe.`);
    const live = livePrices[sym]?.price ?? stock.basePrice;
    const cost = live * shares;
    if (cost > state.cash) return setError(`Need ₹${formatINR(cost)}. You only have ₹${formatINR(state.cash)}.`);

    setState((prev) => {
      const existing = prev.positions.find((p) => p.symbol === sym);
      let positions: Position[];
      if (existing) {
        const totalShares = existing.shares + shares;
        const avg = (existing.avgPrice * existing.shares + live * shares) / totalShares;
        positions = prev.positions.map((p) =>
          p.symbol === sym ? { symbol: sym, shares: totalShares, avgPrice: avg } : p,
        );
      } else {
        positions = [...prev.positions, { symbol: sym, shares, avgPrice: live }];
      }
      return { ...prev, cash: prev.cash - cost, positions };
    });
    setTickerInput("");
    setSharesInput("10");
  }

  function sellAll(symbol: string) {
    setState((prev) => {
      const pos = prev.positions.find((p) => p.symbol === symbol);
      if (!pos) return prev;
      const live =
        livePrices[symbol]?.price ?? NIFTY_50.find((s) => s.symbol === symbol)?.basePrice ?? pos.avgPrice;
      const proceeds = pos.shares * live;
      return {
        ...prev,
        cash: prev.cash + proceeds,
        positions: prev.positions.filter((p) => p.symbol !== symbol),
      };
    });
  }

  function resetPortfolio() {
    if (!confirm("Reset to ₹5,00,000 virtual cash? Your positions will be cleared.")) return;
    setState({ cash: STARTING_CASH, positions: [], valueTrend: [{ t: Date.now(), v: STARTING_CASH }] });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-(--color-fg-subtle)">
            Portfolio simulator
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">Practice investing — risk-free.</h1>
          <p className="mt-1 max-w-2xl text-[13.5px] text-(--color-fg-muted)">
            Start with ₹5,00,000 in virtual cash. Buy and sell at live prices. Track your P&amp;L, allocation
            and performance versus the index.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetPortfolio}>
          Reset portfolio
        </Button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total equity" value={`₹${formatINR(totalEquity)}`} eyebrow={<Wallet className="h-3.5 w-3.5" />} accent />
        <StatCard label="Cash available" value={`₹${formatINR(state.cash)}`} />
        <StatCard label="Invested" value={`₹${formatINR(invested)}`} />
        <StatCard
          label="Total P&L"
          value={`${pl >= 0 ? "+" : ""}₹${formatINR(Math.abs(pl))}`}
          delta={plPct}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card padding="md">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardEyebrow>Add a position</CardEyebrow>
              <p className="mt-1 text-[13.5px] text-(--color-fg-muted)">Buys execute at the current live price.</p>
            </div>
            <Badge tone="brand">Virtual money</Badge>
          </div>
          <form onSubmit={addPosition} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
            <div>
              <Label htmlFor="ticker">Ticker</Label>
              <Input
                id="ticker"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                placeholder="e.g. INFY"
                className="mt-1.5"
                list="ss-tickers"
              />
              <datalist id="ss-tickers">
                {NIFTY_50.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.name}
                  </option>
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="shares">Shares</Label>
              <Input
                id="shares"
                type="number"
                min={1}
                value={sharesInput}
                onChange={(e) => setSharesInput(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" size="md" className="w-full sm:w-auto">
                <Plus className="h-4 w-4" /> Buy
              </Button>
            </div>
          </form>
          {error && (
            <p className="mt-3 rounded-lg border border-(--color-down)/20 bg-(--color-down-soft) px-3 py-2 text-[13px] text-(--color-down)">
              {error}
            </p>
          )}
        </Card>

        <Card padding="md">
          <CardEyebrow className="mb-3">Portfolio value trend</CardEyebrow>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={state.valueTrend} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="pvtFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#115e3c" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#115e3c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#eef1ee" vertical={false} />
                <XAxis dataKey="t" tickFormatter={() => ""} tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#7c8a82" }} domain={["auto", "auto"]} width={62} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    boxShadow: "0 12px 30px -16px rgba(13,31,23,0.18)",
                    fontSize: 12,
                  }}
                  labelFormatter={(t) => new Date(t).toLocaleTimeString()}
                  formatter={(v) => [`₹${formatINR(Number(v))}`, "Equity"]}
                />
                <Area type="monotone" dataKey="v" stroke="#115e3c" strokeWidth={2} fill="url(#pvtFill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card padding="none">
          <div className="border-b border-(--color-border) px-5 py-4">
            <CardEyebrow>Open positions</CardEyebrow>
          </div>
          {enrichedPositions.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <ChartPie className="mx-auto h-7 w-7 text-(--color-fg-subtle)" />
              <p className="mt-3 text-[14.5px] font-semibold text-(--color-fg)">No positions yet</p>
              <p className="mt-1 text-[13px] text-(--color-fg-muted)">Add your first stock above to start tracking gains.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-[0.12em] text-(--color-fg-subtle)">
                    <th className="px-5 py-2 font-semibold">Ticker</th>
                    <th className="px-3 py-2 font-semibold">Shares</th>
                    <th className="px-3 py-2 text-right font-semibold">Avg</th>
                    <th className="px-3 py-2 text-right font-semibold">Live</th>
                    <th className="px-3 py-2 text-right font-semibold">Value</th>
                    <th className="px-3 py-2 text-right font-semibold">P&amp;L</th>
                    <th className="px-5 py-2 text-right font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {enrichedPositions.map((p) => (
                    <tr key={p.symbol} className="border-t border-(--color-border) text-[13.5px] tabular">
                      <td className="px-5 py-3">
                        <p className="font-semibold tracking-tight text-(--color-fg)">{p.symbol}</p>
                        <p className="text-[11.5px] text-(--color-fg-subtle)">{p.stock.name}</p>
                      </td>
                      <td className="px-3 py-3 text-(--color-fg-muted)">{p.shares}</td>
                      <td className="px-3 py-3 text-right text-(--color-fg-muted)">₹{formatINR(p.avgPrice)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-(--color-fg)">₹{formatINR(p.current)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-(--color-fg)">₹{formatINR(p.value)}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex flex-col items-end leading-tight">
                          <span className={`font-semibold ${p.pl >= 0 ? "text-(--color-up)" : "text-(--color-down)"}`}>
                            {p.pl >= 0 ? "+" : ""}₹{formatINR(Math.abs(p.pl))}
                          </span>
                          <Delta value={p.plPct} size="xs" showIcon={false} />
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => sellAll(p.symbol)}
                          className="rounded-md border border-(--color-border) px-2 py-1 text-[11.5px] font-semibold text-(--color-fg-muted) hover:border-(--color-down)/30 hover:bg-(--color-down-soft) hover:text-(--color-down)"
                        >
                          <X className="mr-1 inline h-3 w-3" /> Sell all
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card padding="md">
          <CardEyebrow className="mb-3">Allocation by sector</CardEyebrow>
          {allocation.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-(--color-fg-muted)">Add positions to see allocation.</p>
          ) : (
            <>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocation}
                      dataKey="value"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={2}
                      stroke="white"
                      strokeWidth={2}
                    >
                      {allocation.map((entry, i) => (
                        <Cell key={i} fill={SECTOR_COLORS[entry.name] ?? "#115e3c"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        border: "1px solid var(--color-border)",
                        borderRadius: 12,
                        boxShadow: "0 12px 30px -16px rgba(13,31,23,0.18)",
                        fontSize: 12,
                      }}
                      formatter={(v, n) => [`₹${formatINR(Number(v))}`, n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1.5">
                {allocation.map((a) => {
                  const total = allocation.reduce((s, x) => s + x.value, 0);
                  const pct = total ? (a.value / total) * 100 : 0;
                  return (
                    <li key={a.name} className="flex items-center justify-between text-[12.5px]">
                      <span className="flex items-center gap-2 text-(--color-fg-muted)">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: SECTOR_COLORS[a.name] ?? "#115e3c" }} />
                        {a.name}
                      </span>
                      <span className="font-semibold tabular text-(--color-fg)">{pct.toFixed(1)}%</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  delta,
  eyebrow,
  accent,
}: {
  label: string;
  value: string;
  delta?: number;
  eyebrow?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-(--color-surface) p-5 ${
        accent ? "border-(--color-brand-300) shadow-[0_18px_38px_-22px_rgba(13,31,23,0.16)]" : "border-(--color-border)"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-(--color-fg-subtle)">{label}</p>
        {eyebrow && <span className="text-(--color-fg-subtle)">{eyebrow}</span>}
      </div>
      <p className="mt-2 text-[26px] font-semibold tracking-tight tabular text-(--color-fg)">{value}</p>
      {typeof delta === "number" && (
        <div className="mt-1">
          <Delta value={delta} />
        </div>
      )}
    </div>
  );
}
