// AI analysis layer, part 1: a deterministic bull/bear score whose arithmetic
// is fully visible — each component contributes points with a stated reason,
// and the total is scaled to 0–100. No black box.

import { fmt, pct, sma, smaLine, type Macd, type Atr } from "./quant";

export type ScoreComponent = {
  label: string;
  points: number;
  max: number;
  why: string;
};

export type BullBearScore = {
  score: number; // 0–100
  verdict: "Bullish" | "Leaning bullish" | "Neutral" | "Leaning bearish" | "Bearish";
  components: ScoreComponent[];
  totalPoints: number;
  maxPoints: number;
};

export type ScoreInput = {
  prices: number[];
  rsi: number;
  macd: Macd;
  slope: number;
  bollPos: number; // 0 = lower band, 1 = upper band
  atr: Atr | null;
  ensembleTarget: number;
};

export function bullBearScore(input: ScoreInput): BullBearScore {
  const { prices, rsi, macd, slope, bollPos, ensembleTarget } = input;
  const last = prices[prices.length - 1];
  const s20 = sma(prices, 20);
  const s50line = smaLine(prices, 50);
  const s50 = s50line[s50line.length - 1];
  const c: ScoreComponent[] = [];

  c.push({
    label: "Price vs SMA₂₀",
    points: last > s20 ? 2 : 0,
    max: 2,
    why: `close ${fmt(last)} ${last > s20 ? ">" : "≤"} SMA₂₀ ${fmt(s20)}`,
  });

  if (!isNaN(s50)) {
    c.push({
      label: "SMA₂₀ vs SMA₅₀",
      points: s20 > s50 ? 2 : 0,
      max: 2,
      why: `SMA₂₀ ${fmt(s20)} ${s20 > s50 ? ">" : "≤"} SMA₅₀ ${fmt(s50)}`,
    });
  }

  c.push({
    label: "MACD histogram",
    points: macd.lastHist > 0 ? 2 : 0,
    max: 2,
    why: `MACD ${fmt(macd.lastMacd, 2)} − signal ${fmt(macd.lastSignal, 2)} = ${fmt(macd.lastHist, 2)} (${macd.lastHist > 0 ? "positive" : "negative"})`,
  });

  let rsiPts = 0;
  let rsiWhy = "";
  if (rsi > 70) {
    rsiPts = 0.5;
    rsiWhy = `RSI ${fmt(rsi, 1)} > 70 — strong but overbought`;
  } else if (rsi >= 50) {
    rsiPts = 2;
    rsiWhy = `RSI ${fmt(rsi, 1)} in the bullish 50–70 band`;
  } else if (rsi >= 30) {
    rsiPts = 1;
    rsiWhy = `RSI ${fmt(rsi, 1)} below 50 — momentum soft`;
  } else {
    rsiPts = 0.5;
    rsiWhy = `RSI ${fmt(rsi, 1)} < 30 — weak, possibly washed out`;
  }
  c.push({ label: "RSI(14) regime", points: rsiPts, max: 2, why: rsiWhy });

  c.push({
    label: "Trend slope (OLS β)",
    points: slope > 0 ? 2 : 0,
    max: 2,
    why: `β = ${fmt(slope, 3)}/bar (${slope > 0 ? "rising" : "falling"})`,
  });

  c.push({
    label: "Bollinger position",
    points: bollPos >= 0.5 && bollPos <= 0.95 ? 1 : 0,
    max: 1,
    why: `price at ${pct(bollPos, 0)} of the band ${bollPos > 0.95 ? "(pressing the upper band)" : bollPos < 0.5 ? "(lower half)" : "(upper half)"}`,
  });

  c.push({
    label: "Ensemble forecast",
    points: ensembleTarget > last ? 1 : 0,
    max: 1,
    why: `t+7 ensemble ${fmt(ensembleTarget)} ${ensembleTarget > last ? ">" : "≤"} close ${fmt(last)}`,
  });

  const totalPoints = c.reduce((a, b) => a + b.points, 0);
  const maxPoints = c.reduce((a, b) => a + b.max, 0);
  const score = Math.round((totalPoints / maxPoints) * 100);

  const verdict =
    score >= 72 ? "Bullish" : score >= 58 ? "Leaning bullish" : score >= 42 ? "Neutral" : score >= 28 ? "Leaning bearish" : "Bearish";

  return { score, verdict, components: c, totalPoints, maxPoints };
}
