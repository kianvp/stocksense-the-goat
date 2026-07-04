"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getChart, type ChartInterval, type ChartRange } from "@/lib/api/yahoo";
import { generateForecast, generatePriceHistory } from "@/lib/mock-data";

type Range = { id: string; days: number; range: ChartRange; interval: ChartInterval };

const RANGES: Range[] = [
  { id: "1W", days: 7, range: "5d", interval: "30m" },
  { id: "1M", days: 30, range: "1mo", interval: "1d" },
  { id: "3M", days: 90, range: "3mo", interval: "1d" },
  { id: "1Y", days: 365, range: "1y", interval: "1d" },
];

type HistoryPoint = { date: string; price: number };

function formatLabel(time: number, interval: ChartInterval): string {
  const d = new Date(time);
  if (interval === "30m" || interval === "1h" || interval === "5m" || interval === "15m") {
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function PriceChart({ symbol, basePrice }: { symbol: string; basePrice: number }) {
  const [range, setRange] = useState<Range>(RANGES[1]);
  const seed = symbol.charCodeAt(0) + symbol.charCodeAt(1);

  const mockHistory = useMemo<HistoryPoint[]>(
    () => (basePrice > 0 ? generatePriceHistory(basePrice, range.days, seed) : []),
    [basePrice, range.days, seed],
  );
  const [history, setHistory] = useState<HistoryPoint[]>(mockHistory);

  useEffect(() => {
    setHistory(mockHistory);
    let cancelled = false;
    async function load() {
      const r = await getChart(symbol, range.range, range.interval);
      if (cancelled || !r || r.candles.length === 0) return;
      setHistory(
        r.candles.map((c) => ({
          date: formatLabel(c.time, range.interval),
          price: Math.round(c.price * 100) / 100,
        })),
      );
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [symbol, range, mockHistory]);

  const forecast = useMemo(() => {
    const last = history[history.length - 1];
    return last ? generateForecast(last.price, 7, seed) : [];
  }, [history, seed]);

  const data = useMemo(() => {
    if (history.length === 0) return [];
    const merged: Array<{ date: string; price?: number; forecast?: number }> = history.map((h) => ({
      date: h.date,
      price: h.price,
    }));
    const last = history[history.length - 1];
    merged.push({ date: last.date, price: last.price, forecast: last.price });
    forecast.forEach((f) => merged.push({ date: f.date, forecast: f.price }));
    return merged;
  }, [history, forecast]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-surface-2) p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-[12px] font-semibold ${
                range.id === r.id
                  ? "bg-(--color-surface) text-(--color-fg) shadow-xs"
                  : "text-(--color-fg-subtle) hover:text-(--color-fg-muted)"
              }`}
            >
              {r.id}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-[12px]">
          <span className="inline-flex items-center gap-1.5 text-(--color-fg-muted)">
            <span className="h-2 w-4 rounded-full bg-(--color-brand-700)" />
            Historical price
          </span>
          <span className="inline-flex items-center gap-1.5 text-(--color-fg-muted)">
            <span className="inline-block h-2 w-4 rounded-full" style={{ background: "repeating-linear-gradient(90deg, #b27a00 0 4px, transparent 4px 8px)" }} />
            AI forecast (7 days)
          </span>
        </div>
      </div>

      <div className="h-[360px] w-full">
        {data.length === 0 ? (
          <div className="skeleton h-full w-full rounded-2xl" />
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 20, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="#eef1ee" vertical={false} />
            <XAxis dataKey="date" stroke="#7c8a82" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis
              stroke="#7c8a82"
              tickLine={false}
              axisLine={false}
              domain={["dataMin - 10", "dataMax + 10"]}
              tick={{ fontSize: 11 }}
              width={64}
              tickFormatter={(v) => `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
            />
            <Tooltip
              contentStyle={{
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                boxShadow: "0 12px 30px -16px rgba(13,31,23,0.18)",
                fontSize: 12,
                padding: "8px 10px",
              }}
              labelStyle={{ color: "var(--color-fg-subtle)", fontSize: 11 }}
              formatter={(v, n) => [`₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, n === "price" ? "Historical" : "AI forecast"]}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#115e3c"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="#b27a00"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 2, fill: "#b27a00" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-(--color-surface-2) p-3 text-[12.5px] text-(--color-fg-muted)">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-warn)_18%,white)] text-(--color-warn)">⚠</span>
        <p>
          <span className="font-semibold text-(--color-fg)">AI Forecast:</span> the orange dashed line is a simulated
          7-day price projection generated by an AI based on current momentum and historical patterns. This is for
          educational purposes only and is not financial advice.
        </p>
      </div>
    </div>
  );
}
