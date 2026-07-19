// Responsive sizing rules for the analysis chart.
//
// Kept in a pure, dependency-free module so the breakpoints can be unit-tested
// (scripts/verify-quant.mjs) instead of only eyeballed in a browser — driving a
// real viewport resize is exactly the thing that's awkward to automate.

export type ChartMetrics = {
  /** Rendered width in CSS px (never below the mobile floor). */
  w: number;
  /** Rendered height in CSS px. */
  h: number;
  /** How many date labels the x-axis may show without crowding. */
  xTickCount: number;
  /** Right gutter reserved for the price axis + pinned last-price tag. */
  rightGutter: number;
  /** Share of height given to the volume pane. */
  volumeShare: number;
};

/** Smallest width we will render at; below this the container scrolls instead. */
export const MIN_CHART_WIDTH = 280;

export function chartMetrics(containerWidth: number): ChartMetrics {
  const raw = Number.isFinite(containerWidth) ? containerWidth : MIN_CHART_WIDTH;
  const w = Math.max(MIN_CHART_WIDTH, Math.round(raw));
  return {
    w,
    h: w < 560 ? 300 : w < 900 ? 360 : 420,
    // Fewer ticks on narrow screens: date labels are ~58px wide, so more than
    // width/90 of them would collide.
    xTickCount: w < 420 ? 2 : w < 560 ? 3 : w < 900 ? 5 : 7,
    // The gutter must always fit a price tag (~48px) plus breathing room.
    rightGutter: w < 420 ? 54 : w < 560 ? 62 : 74,
    volumeShare: 0.18,
  };
}
