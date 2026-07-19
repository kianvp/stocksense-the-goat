"use client";

// Professional analysis chart.
//
// Rendering model: the SVG viewBox is kept in a 1:1 relationship with the
// measured pixel size of its container (via ResizeObserver), so one SVG user
// unit is exactly one CSS pixel. The previous chart used
// `preserveAspectRatio="none"` on a fixed 980×400 viewBox, which stretched the
// drawing non-uniformly — that is what made strokes different weights
// horizontally vs vertically, distorted the type, and pushed the right-hand
// labels out of the plot. Nothing here is stretched; vector output stays crisp
// at any DPR.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmt, type Level } from "@/lib/quant";
import { chartMetrics } from "@/lib/chart-metrics";
import type { EnsembleForecast } from "@/lib/forecast";

/* ------------------------------------------------------------------ types */

export type ChartBar = {
  time: number; // epoch MILLISECONDS
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
};

export type Overlays = {
  sma20?: number[];
  sma50?: number[];
  ema20?: number[];
  ema50?: number[];
  bandUpper?: number[];
  bandLower?: number[];
  regression?: number[];
  rsi?: number[];
  macdHist?: number[];
  atrPct?: number;
};

export type ToggleKey =
  | "sma20" | "sma50" | "ema20" | "ema50"
  | "bollinger" | "levels" | "forecast" | "regression" | "volume";

export type ChartProps = {
  bars: ChartBar[];
  overlays: Overlays;
  levels: { supports: Level[]; resistances: Level[] } | null;
  forecast: EnsembleForecast | null;
  unit: string;
  enabled: Record<ToggleKey, boolean>;
};

/* -------------------------------------------------------------- helpers */

/** "Nice" axis ticks — 1/2/5×10ⁿ steps, the standard axis algorithm. */
function niceTicks(min: number, max: number, target = 5): number[] {
  if (!isFinite(min) || !isFinite(max) || min === max) return [min];
  const span = max - min;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const first = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = first; v <= max + step * 1e-6; v += step) out.push(v);
  return out;
}

/**
 * Greedy label de-collision: walks a set of desired y positions in order and
 * pushes each one down until it clears the previous by `gap`, then, if the
 * stack has overflowed the plot, shifts the whole run back up. This is what
 * stops support/resistance tags stacking on top of one another when two
 * levels sit close together.
 */
function deCollide(desired: { y: number; key: string }[], gap: number, minY: number, maxY: number) {
  const sorted = [...desired].sort((a, b) => a.y - b.y);
  let prev = -Infinity;
  for (const d of sorted) {
    d.y = Math.max(d.y, prev + gap);
    prev = d.y;
  }
  const overflow = sorted.length ? sorted[sorted.length - 1].y - maxY : 0;
  if (overflow > 0) for (const d of sorted) d.y -= overflow;
  for (const d of sorted) d.y = Math.max(minY, d.y);
  return new Map(sorted.map((d) => [d.key, d.y]));
}

/** Catmull-Rom → cubic Bézier: smooth interpolation that passes through every
 *  point (unlike a plain quadratic smoothing, which would misrepresent price). */
function smoothPath(pts: { x: number; y: number }[], tension = 0.5): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = tension / 3;
    d += ` C${(p1.x + (p2.x - p0.x) * t).toFixed(2)},${(p1.y + (p2.y - p0.y) * t).toFixed(2)}` +
         ` ${(p2.x - (p3.x - p1.x) * t).toFixed(2)},${(p2.y - (p3.y - p1.y) * t).toFixed(2)}` +
         ` ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

/** Straight polyline that breaks at NaN gaps (for indicator warm-up periods). */
function gappedPath(vals: number[], xAt: (i: number) => number, yAt: (v: number) => number): string {
  let d = "";
  let pen = false;
  for (let i = 0; i < vals.length; i++) {
    if (!isFinite(vals[i])) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${xAt(i).toFixed(2)},${yAt(vals[i]).toFixed(2)} `;
    pen = true;
  }
  return d.trim();
}

const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
const fmtVol = (v: number) =>
  v >= 1e7 ? `${(v / 1e7).toFixed(2)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(2)}L` : v.toLocaleString("en-IN");

/* ---------------------------------------------------------------- chart */

function PriceChartProInner({ bars, overlays, levels, forecast, unit, enabled }: ChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 420 });
  const [hover, setHover] = useState<number | null>(null);

  // Measure the container so the viewBox matches real pixels 1:1.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const m = chartMetrics(entry.contentRect.width);
      setSize({ w: m.w, h: m.h });
    });
    // Measure immediately too — ResizeObserver's first callback can lag paint.
    const m0 = chartMetrics(el.getBoundingClientRect().width);
    setSize({ w: m0.w, h: m0.h });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const showVolume = enabled.volume && bars.some((b) => typeof b.volume === "number");
  const showForecast = enabled.forecast && !!forecast;

  const geom = useMemo(() => {
    const { w, h } = size;
    // Generous right gutter for the price axis + pinned last-price tag, so
    // nothing clips (the old chart reserved 10px and overlapped).
    const pad = { l: 8, r: chartMetrics(w).rightGutter, t: 16, b: 30 };
    const volH = showVolume ? Math.round(h * 0.18) : 0;
    const plotTop = pad.t;
    const plotBottom = h - pad.b - volH - (showVolume ? 8 : 0);
    const plotH = Math.max(40, plotBottom - plotTop);
    const plotW = Math.max(40, w - pad.l - pad.r);

    const horizon = showForecast ? forecast!.horizon : 0;
    const total = bars.length + horizon;

    const closes = bars.map((b) => b.close);
    const candidates: number[] = [...closes];
    if (enabled.bollinger) {
      overlays.bandUpper?.forEach((v) => isFinite(v) && candidates.push(v));
      overlays.bandLower?.forEach((v) => isFinite(v) && candidates.push(v));
    }
    if (showForecast) candidates.push(...forecast!.upper, ...forecast!.lower);
    if (enabled.levels && levels) {
      levels.supports.forEach((l) => candidates.push(l.price));
      levels.resistances.forEach((l) => candidates.push(l.price));
    }
    if (enabled.regression) overlays.regression?.forEach((v) => isFinite(v) && candidates.push(v));

    let min = Math.min(...candidates);
    let max = Math.max(...candidates);
    // 6% headroom so peaks and labels never touch the frame.
    const padding = (max - min || max || 1) * 0.06;
    min -= padding;
    max += padding;

    const xAt = (i: number) => pad.l + (total <= 1 ? 0 : (i / (total - 1)) * plotW);
    const yAt = (v: number) => plotTop + (1 - (v - min) / (max - min || 1)) * plotH;

    const maxVol = showVolume ? Math.max(...bars.map((b) => b.volume ?? 0), 1) : 1;
    const volAt = (v: number) => (v / maxVol) * volH;

    return { w, h, pad, plotTop, plotBottom, plotH, plotW, total, min, max, xAt, yAt, volH, volAt, horizon };
  }, [size, bars, overlays, levels, forecast, enabled, showVolume, showForecast]);

  const { xAt, yAt } = geom;
  const lastIdx = bars.length - 1;
  const last = bars[lastIdx];

  // ---- paths (memoised: these are the expensive part of a re-render) ----
  const paths = useMemo(() => {
    const closePts = bars.map((b, i) => ({ x: xAt(i), y: yAt(b.close) }));
    const price = smoothPath(closePts, 0.5);
    const area =
      price +
      ` L${xAt(lastIdx).toFixed(2)},${geom.plotBottom.toFixed(2)}` +
      ` L${xAt(0).toFixed(2)},${geom.plotBottom.toFixed(2)} Z`;

    const line = (v?: number[]) => (v ? gappedPath(v, xAt, yAt) : "");

    // Bollinger envelope as a single closed band.
    let band = "";
    if (enabled.bollinger && overlays.bandUpper && overlays.bandLower) {
      const up: string[] = [];
      const dn: string[] = [];
      for (let i = 0; i < bars.length; i++) {
        if (isFinite(overlays.bandUpper[i])) up.push(`${xAt(i).toFixed(2)},${yAt(overlays.bandUpper[i]).toFixed(2)}`);
      }
      for (let i = bars.length - 1; i >= 0; i--) {
        if (isFinite(overlays.bandLower[i])) dn.push(`${xAt(i).toFixed(2)},${yAt(overlays.bandLower[i]).toFixed(2)}`);
      }
      if (up.length && dn.length) band = `M${up.join(" L")} L${dn.join(" L")} Z`;
    }

    // Forecast: the cone and centre line both start at the last actual close,
    // so the projection grows out of the price series instead of appearing as
    // a detached segment floating to the right.
    let cone = "";
    let centre = "";
    const ribs: { x: number; y1: number; y2: number; o: number }[] = [];
    if (showForecast && forecast) {
      const x0 = xAt(lastIdx);
      const y0 = yAt(last.close);
      const upPts = [{ x: x0, y: y0 }, ...forecast.upper.map((v, h) => ({ x: xAt(lastIdx + 1 + h), y: yAt(v) }))];
      const dnPts = [{ x: x0, y: y0 }, ...forecast.lower.map((v, h) => ({ x: xAt(lastIdx + 1 + h), y: yAt(v) }))];
      cone =
        smoothPath(upPts, 0.5) +
        " " +
        smoothPath([...dnPts].reverse(), 0.5).replace(/^M/, "L") +
        " Z";
      centre = smoothPath([{ x: x0, y: y0 }, ...forecast.ensemble.map((v, h) => ({ x: xAt(lastIdx + 1 + h), y: yAt(v) }))], 0.5);
      // Nested ribs give the fan its graded look: inner bands are darker.
      for (let h = 0; h < forecast.horizon; h++) {
        ribs.push({
          x: xAt(lastIdx + 1 + h),
          y1: yAt(forecast.upper[h]),
          y2: yAt(forecast.lower[h]),
          o: 0.05 + 0.03 * (1 - h / Math.max(1, forecast.horizon - 1)),
        });
      }
    }

    return {
      price, area, band, cone, centre, ribs,
      sma20: enabled.sma20 ? line(overlays.sma20) : "",
      sma50: enabled.sma50 ? line(overlays.sma50) : "",
      ema20: enabled.ema20 ? line(overlays.ema20) : "",
      ema50: enabled.ema50 ? line(overlays.ema50) : "",
      regression: enabled.regression ? line(overlays.regression) : "",
    };
  }, [bars, overlays, enabled, forecast, showForecast, xAt, yAt, lastIdx, last, geom.plotBottom]);

  // ---- axis ticks ----
  const yTicks = useMemo(() => niceTicks(geom.min, geom.max, 5), [geom.min, geom.max]);
  const xTicks = useMemo(() => {
    const count = chartMetrics(geom.w).xTickCount;
    const step = Math.max(1, Math.floor((bars.length - 1) / (count - 1)));
    const out: number[] = [];
    for (let i = 0; i < bars.length; i += step) out.push(i);
    if (out[out.length - 1] !== bars.length - 1) out.push(bars.length - 1);
    return out;
  }, [bars.length, geom.w]);

  // ---- S/R label positions, de-collided ----
  const levelLabels = useMemo(() => {
    if (!enabled.levels || !levels) return null;
    const items = [
      ...levels.resistances.map((l, i) => ({ key: `R${i + 1}`, level: l, kind: "r" as const })),
      ...levels.supports.map((l, i) => ({ key: `S${i + 1}`, level: l, kind: "s" as const })),
    ];
    const placed = deCollide(
      items.map((it) => ({ key: it.key, y: yAt(it.level.price) })),
      13,
      geom.plotTop + 6,
      geom.plotBottom - 4,
    );
    return items.map((it) => ({ ...it, labelY: placed.get(it.key) ?? yAt(it.level.price) }));
  }, [enabled.levels, levels, yAt, geom.plotTop, geom.plotBottom]);

  // ---- crosshair ----
  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const i = Math.round(((x - geom.pad.l) / geom.plotW) * (geom.total - 1));
      setHover(i >= 0 && i <= lastIdx ? i : null);
    },
    [geom.pad.l, geom.plotW, geom.total, lastIdx],
  );

  /**
   * Keyboard equivalent of the crosshair. Without this the entire chart is
   * mouse-only: ~120 data points reachable by no other means. Arrows step one
   * bar, PageUp/Down jump a week, Home/End go to the ends, Escape dismisses.
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
      const step = (delta: number) => {
        e.preventDefault();
        setHover((h) => {
          const base = h ?? lastIdx;
          return Math.max(0, Math.min(lastIdx, base + delta));
        });
      };
      switch (e.key) {
        case "ArrowRight": return step(1);
        case "ArrowLeft": return step(-1);
        case "PageUp": return step(5);
        case "PageDown": return step(-5);
        case "Home": e.preventDefault(); return setHover(0);
        case "End": e.preventDefault(); return setHover(lastIdx);
        case "Escape": return setHover(null);
      }
    },
    [lastIdx],
  );

  const hb = hover !== null ? bars[hover] : null;
  const prevClose = hover !== null && hover > 0 ? bars[hover - 1].close : null;

  return (
    <div className="w-full">
      <div ref={wrapRef} className="relative w-full">
        <svg
          width={geom.w}
          height={geom.h}
          viewBox={`0 0 ${geom.w} ${geom.h}`}
          // Deliberately NOT `w-full`: the element is sized to the measured
          // width so one viewBox unit maps to exactly one CSS pixel. Letting
          // CSS stretch it would reintroduce non-uniform scaling.
          className="block touch-pan-y select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand-400)"
          style={{ width: geom.w, height: geom.h }}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKeyDown}
          onFocus={() => setHover((h) => h ?? lastIdx)}
          onBlur={() => setHover(null)}
          tabIndex={0}
          role="application"
          aria-label={
            `Price chart, ${bars.length} daily bars from ${fmtDate(bars[0].time)} to ${fmtDate(last.time)}. ` +
            `Use arrow keys to read individual bars.`
          }
          aria-describedby="chart-kbd-help"
        >
          <defs>
            <linearGradient id="pc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-600)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--color-brand-600)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="pc-cone" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--color-warn)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-warn)" stopOpacity="0.06" />
            </linearGradient>
          </defs>

          {/* horizontal grid — subtle, behind everything */}
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line
                x1={geom.pad.l} x2={geom.w - geom.pad.r}
                y1={yAt(t)} y2={yAt(t)}
                stroke="var(--color-border)" strokeWidth="1" opacity="0.55" shapeRendering="crispEdges"
              />
              <text
                x={geom.w - geom.pad.r + 8} y={yAt(t) + 3.5}
                fontSize="10.5" fill="var(--color-fg-subtle)" className="tabular"
              >
                {fmt(t, 0)}
              </text>
            </g>
          ))}

          {/* x axis */}
          {xTicks.map((i) => (
            <text
              key={`x${i}`} x={xAt(i)} y={geom.h - 10}
              fontSize="10.5" fill="var(--color-fg-subtle)" textAnchor={i === 0 ? "start" : i === lastIdx ? "end" : "middle"}
            >
              {fmtDate(bars[i].time)}
            </text>
          ))}

          {/* Bollinger */}
          {paths.band && (
            <path d={paths.band} fill="var(--color-brand-300)" fillOpacity="0.10"
              stroke="var(--color-brand-400)" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="4 4" />
          )}

          {/* forecast cone + graded ribs, drawn under the price line */}
          {showForecast && paths.cone && (
            <>
              <path d={paths.cone} fill="url(#pc-cone)" />
              {paths.ribs.map((r, i) => (
                <line key={i} x1={r.x} x2={r.x} y1={r.y1} y2={r.y2}
                  stroke="var(--color-warn)" strokeOpacity={r.o} strokeWidth="6" />
              ))}
            </>
          )}

          {/* S/R zones */}
          {levelLabels?.map((it) => {
            const y = yAt(it.level.price);
            const colour = it.kind === "r" ? "var(--color-down)" : "var(--color-up)";
            return (
              <g key={it.key}>
                <line x1={geom.pad.l} x2={geom.w - geom.pad.r} y1={y} y2={y}
                  stroke={colour} strokeWidth="1" strokeDasharray="5 5"
                  opacity={0.28 + 0.32 * it.level.strength} />
                {/* leader line when the label had to be nudged off its level */}
                {Math.abs(it.labelY - y) > 1.5 && (
                  <line x1={geom.w - geom.pad.r - 44} x2={geom.w - geom.pad.r - 6}
                    y1={y} y2={it.labelY - 3} stroke={colour} strokeWidth="0.75" opacity="0.4" />
                )}
                <text x={geom.w - geom.pad.r - 6} y={it.labelY} textAnchor="end"
                  fontSize="10" fontWeight="600" fill={colour} className="tabular">
                  {it.key} {unit}{fmt(it.level.price, 0)}
                  <tspan fontWeight="400" fillOpacity="0.7"> ·{it.level.touches}</tspan>
                </text>
              </g>
            );
          })}

          {/* price */}
          <path d={paths.area} fill="url(#pc-fill)" />
          <path d={paths.price} fill="none" stroke="var(--color-brand-700)" strokeWidth="1.75"
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

          {/* moving averages */}
          {paths.sma20 && <path d={paths.sma20} fill="none" stroke="var(--color-brand-400)" strokeWidth="1.25" strokeLinejoin="round" />}
          {paths.sma50 && <path d={paths.sma50} fill="none" stroke="#8a63d2" strokeWidth="1.25" strokeLinejoin="round" />}
          {paths.ema20 && <path d={paths.ema20} fill="none" stroke="var(--color-info)" strokeWidth="1.1" strokeDasharray="3 3" />}
          {paths.ema50 && <path d={paths.ema50} fill="none" stroke="#b27a00" strokeWidth="1.1" strokeDasharray="3 3" />}
          {paths.regression && <path d={paths.regression} fill="none" stroke="var(--color-fg-subtle)" strokeWidth="1" strokeDasharray="6 4" opacity="0.75" />}

          {/* forecast centre line */}
          {showForecast && paths.centre && (
            <path d={paths.centre} fill="none" stroke="var(--color-warn)" strokeWidth="1.75"
              strokeDasharray="5 4" strokeLinecap="round" />
          )}

          {/* volume pane */}
          {showVolume && bars.map((b, i) => {
            const v = b.volume ?? 0;
            const bh = geom.volAt(v);
            const up = i === 0 || b.close >= bars[i - 1].close;
            const bw = Math.max(1, geom.plotW / bars.length - 1);
            return (
              <rect key={i} x={xAt(i) - bw / 2} y={geom.h - geom.pad.b - bh} width={bw} height={bh}
                fill={up ? "var(--color-up)" : "var(--color-down)"} opacity="0.28" />
            );
          })}

          {/* last price: emphasised marker + pinned axis tag */}
          <circle cx={xAt(lastIdx)} cy={yAt(last.close)} r="7" fill="var(--color-brand-500)" opacity="0.18" />
          <circle cx={xAt(lastIdx)} cy={yAt(last.close)} r="3.5" fill="var(--color-brand-700)"
            stroke="var(--color-surface)" strokeWidth="1.5" />
          <line x1={xAt(lastIdx)} x2={geom.w - geom.pad.r} y1={yAt(last.close)} y2={yAt(last.close)}
            stroke="var(--color-brand-700)" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
          <g>
            <rect x={geom.w - geom.pad.r + 2} y={yAt(last.close) - 9} width={geom.pad.r - 6} height="18"
              rx="4" fill="var(--color-brand-700)" />
            <text x={geom.w - geom.pad.r + 6} y={yAt(last.close) + 4} fontSize="10.5" fontWeight="700"
              fill="#fff" className="tabular">
              {unit}{fmt(last.close, 0)}
            </text>
          </g>

          {/* crosshair */}
          {hb && hover !== null && (
            <g pointerEvents="none">
              <line x1={xAt(hover)} x2={xAt(hover)} y1={geom.plotTop} y2={geom.h - geom.pad.b}
                stroke="var(--color-fg-subtle)" strokeWidth="1" strokeDasharray="3 3" opacity="0.8" />
              <line x1={geom.pad.l} x2={geom.w - geom.pad.r} y1={yAt(hb.close)} y2={yAt(hb.close)}
                stroke="var(--color-fg-subtle)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
              <circle cx={xAt(hover)} cy={yAt(hb.close)} r="4.5" fill="var(--color-surface)"
                stroke="var(--color-brand-700)" strokeWidth="2" />
            </g>
          )}
        </svg>

        {/* tooltip — HTML, so it gets real typography and wrapping */}
        {hb && hover !== null && (
          <div
            className="pointer-events-none absolute z-10 w-[190px] rounded-xl border border-(--color-border) bg-(--color-surface) p-2.5 shadow-[var(--shadow-lg)]"
            style={{
              left: Math.min(Math.max(4, xAt(hover) + 14), Math.max(4, geom.w - 200)),
              top: Math.max(4, Math.min(yAt(hb.close) - 10, geom.h - 190)),
            }}
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-(--color-fg-subtle)">
              {fmtDate(hb.time)}
            </p>
            <div className="mt-1.5 space-y-0.5 font-mono text-[11px]">
              {hb.open != null && <Row k="O" v={`${unit}${fmt(hb.open)}`} />}
              {hb.high != null && <Row k="H" v={`${unit}${fmt(hb.high)}`} />}
              {hb.low != null && <Row k="L" v={`${unit}${fmt(hb.low)}`} />}
              <Row k="C" v={`${unit}${fmt(hb.close)}`} strong />
              {prevClose != null && (
                <Row
                  k="Δ"
                  v={`${hb.close >= prevClose ? "+" : ""}${fmt(hb.close - prevClose)} (${((hb.close / prevClose - 1) * 100).toFixed(2)}%)`}
                  tone={hb.close >= prevClose ? "up" : "down"}
                />
              )}
              {hb.volume != null && <Row k="Vol" v={fmtVol(hb.volume)} />}
              <div className="my-1 border-t border-(--color-border)" />
              {overlays.sma20 && isFinite(overlays.sma20[hover]) && <Row k="SMA20" v={fmt(overlays.sma20[hover])} />}
              {overlays.sma50 && isFinite(overlays.sma50[hover]) && <Row k="SMA50" v={fmt(overlays.sma50[hover])} />}
              {overlays.rsi && isFinite(overlays.rsi[hover]) && <Row k="RSI" v={fmt(overlays.rsi[hover], 1)} />}
              {overlays.macdHist && isFinite(overlays.macdHist[hover]) && <Row k="MACD h" v={fmt(overlays.macdHist[hover], 2)} />}
            </div>
          </div>
        )}
      </div>

      {/* ---------------------- assistive-technology layer ---------------------- */}

      <p id="chart-kbd-help" className="sr-only">
        Arrow keys move one bar, Page Up and Page Down move five bars, Home and End
        jump to the first and last bar, Escape clears the selection.
      </p>

      {/* Announces the focused bar. Polite so it never interrupts, and atomic so
          the whole reading is spoken as one phrase rather than field by field. */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {hb
          ? `${fmtDate(hb.time)}: close ${unit}${fmt(hb.close)}` +
            (hb.open != null ? `, open ${unit}${fmt(hb.open)}` : "") +
            (hb.high != null ? `, high ${unit}${fmt(hb.high)}` : "") +
            (hb.low != null ? `, low ${unit}${fmt(hb.low)}` : "") +
            (prevClose != null
              ? `, ${hb.close >= prevClose ? "up" : "down"} ${Math.abs((hb.close / prevClose - 1) * 100).toFixed(2)} percent`
              : "") +
            (hb.volume != null ? `, volume ${fmtVol(hb.volume)}` : "")
          : ""}
      </p>

      {/* The full series as a real table. This is the part that actually makes
          the data available to a screen reader — a canvas/SVG drawing is opaque
          to assistive tech no matter how it is labelled. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-(--color-fg-subtle) hover:text-(--color-fg-muted)">
          View chart data as a table
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-(--color-border)">
          <table className="w-full text-left text-[11px]">
            <caption className="sr-only">
              Daily price data: date, open, high, low, close and volume for each bar.
            </caption>
            <thead className="sticky top-0 bg-(--color-surface-2)">
              <tr>
                {["Date", "Open", "High", "Low", "Close", "Volume"].map((h) => (
                  <th key={h} scope="col" className="px-2 py-1.5 font-semibold text-(--color-fg-subtle)">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {bars.map((b) => (
                <tr key={b.time} className="border-t border-(--color-border)">
                  <th scope="row" className="whitespace-nowrap px-2 py-1 font-normal text-(--color-fg-muted)">
                    {fmtDate(b.time)}
                  </th>
                  <td className="px-2 py-1">{b.open != null ? fmt(b.open) : "—"}</td>
                  <td className="px-2 py-1">{b.high != null ? fmt(b.high) : "—"}</td>
                  <td className="px-2 py-1">{b.low != null ? fmt(b.low) : "—"}</td>
                  <td className="px-2 py-1 font-medium">{fmt(b.close)}</td>
                  <td className="px-2 py-1">{b.volume != null ? fmtVol(b.volume) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: "up" | "down" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-(--color-fg-subtle)">{k}</span>
      <span
        className={
          tone === "up" ? "text-(--color-up)" : tone === "down" ? "text-(--color-down)" : strong ? "font-semibold text-(--color-fg)" : "text-(--color-fg-muted)"
        }
      >
        {v}
      </span>
    </div>
  );
}

/** Memoised: with stable props from the workbench, hovering or toggling a
 *  sibling control no longer re-runs path building for ~120 bars. */
export const PriceChartPro = memo(PriceChartProInner);
