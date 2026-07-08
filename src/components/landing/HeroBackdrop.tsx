"use client";

// Premium, real-data hero backdrop: faint live sparklines of the day's index
// and large-cap action, layered at low opacity with a slow horizontal drift.
// No WebGL, no gimmick — just the market, quietly moving behind the copy.

import { useEffect, useState } from "react";
import { getSparkQuotes, type SparkQuote } from "@/lib/api/yahoo";

const SYMBOLS = ["NIFTY50", "BANKNIFTY", "RELIANCE", "TCS", "HDFCBANK", "INFY"];

function toPath(values: number[], w: number, h: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - 8 - ((v - min) / span) * (h - 16);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function HeroBackdrop() {
  const [quotes, setQuotes] = useState<SparkQuote[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      const q = await getSparkQuotes(SYMBOLS);
      if (cancelled) return;
      const list = SYMBOLS.map((s) => q[s]).filter((x): x is SparkQuote => !!x && x.spark.length > 3);
      if (list.length) setQuotes(list);
    }
    pull();
    const id = setInterval(pull, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const W = 1440;
  const H = 900;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* soft vignette so copy stays legible */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-(--color-brand-950)/60" />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full opacity-[0.5]"
      >
        <defs>
          <linearGradient id="hb-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3d9a6b" stopOpacity="0" />
            <stop offset="35%" stopColor="#6fb98e" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#3d9a6b" stopOpacity="0" />
          </linearGradient>
        </defs>
        {quotes.map((q, i) => {
          const band = H * (0.2 + i * 0.11);
          const height = 150;
          const up = q.changePct >= 0;
          return (
            <g
              key={q.symbol}
              transform={`translate(0 ${band - height})`}
              style={{
                animation: `hero-drift ${44 + i * 7}s linear infinite`,
                opacity: 0.35 + (i === 0 ? 0.35 : 0.12),
              }}
            >
              <path
                d={toPath(q.spark, W * 1.4, height)}
                fill="none"
                stroke={i === 0 ? "url(#hb-fade)" : up ? "#2f7d55" : "#8a5a3f"}
                strokeWidth={i === 0 ? 2.2 : 1.3}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
