// Research Engine — Layer 7: confidence engine.
//
// Entirely deterministic. Confidence is not an LLM's self-assessment; it is
// computed from measurable properties of the run:
//
//   overall = 100 · ( 0.30·modelAgreement
//                   + 0.25·alignmentScore
//                   + 0.15·bandTightness
//                   + 0.15·coverageScore
//                   + 0.15·analystScore )   − freshnessPenalty
//
// Each term is in [0,1] and documented at its computation. Analyst-reported
// confidences participate at only 15% weight and are penalised by their own
// disagreement — self-reported certainty is the least trustworthy input.

import type {
  AgentEnvelope, AnalystOutput, ConfidenceReport, ModelLayer, PriceData,
} from "./types";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function computeConfidence(args: {
  price: PriceData | null;
  models: ModelLayer | null;
  analysts: AgentEnvelope<AnalystOutput>[];
  delivered: string[];
  missing: string[];
}): ConfidenceReport {
  const { price, models } = args;

  /* Model agreement: do the individual model paths point the same way at the
     horizon, and how dispersed are they relative to random-walk noise? */
  let modelAgreement = 0;
  if (models && price) {
    const last = price.lastClose;
    const dirs = models.ensemble.models.map((m) => Math.sign(m.target - last));
    const up = dirs.filter((d) => d > 0).length;
    const consensus = Math.max(up, dirs.length - up) / Math.max(1, dirs.length);
    // Dispersion term: σ_disp vs σ_rw at the horizon (from the CI machinery).
    const h = models.ensemble.horizon - 1;
    const sigmaTot = models.ensemble.sigmaPath[h] ?? 0;
    const sigmaRw = models.ensemble.sigmaDaily * Math.sqrt(h + 1);
    const dispersionShare = sigmaTot > 0 ? clamp01(1 - (sigmaTot - sigmaRw) / sigmaTot) : 0.5;
    modelAgreement = clamp01(0.6 * consensus + 0.4 * dispersionShare);
  }

  /* Indicator alignment from the z-score components (signals.ts). */
  let bullish = 0, bearish = 0, neutral = 0;
  if (models) {
    for (const c of models.score.components) {
      if (c.z > 0.15) bullish++;
      else if (c.z < -0.15) bearish++;
      else neutral++;
    }
  }
  const totalInd = bullish + bearish + neutral;
  // One-sidedness of the indicator set — an evenly split panel is low signal.
  const alignmentScore = totalInd > 0 ? Math.abs(bullish - bearish) / totalInd : 0;

  /* Forecast band tightness: CI width at horizon relative to price, mapped so
     ±2% → ~0.9 and ±15% → ~0.2. */
  let bandTightness = 0;
  if (models && price) {
    const h = models.ensemble.horizon - 1;
    const width = (models.ensemble.upper[h] - models.ensemble.lower[h]) / price.lastClose;
    bandTightness = clamp01(1 - width / 0.3);
  }

  /* Data freshness: age of the last bar in days. Weekends make 1–3 normal. */
  const dataFreshnessDays = price
    ? Math.max(0, (Date.now() - price.asOf) / 86_400_000)
    : 99;
  const freshnessPenalty = dataFreshnessDays > 4 ? Math.min(20, (dataFreshnessDays - 4) * 4) : 0;

  /* Coverage: which agents actually delivered. */
  const coverageScore =
    args.delivered.length + args.missing.length > 0
      ? args.delivered.length / (args.delivered.length + args.missing.length)
      : 0;

  /* Analyst consensus: mean self-reported confidence minus a spread penalty. */
  const okAnalysts = args.analysts.filter(
    (a) => (a.status === "done" || a.status === "cached") && a.payload,
  );
  let analystConsensus: ConfidenceReport["analystConsensus"] = null;
  let analystScore = 0.5; // neutral prior when no analysts ran
  if (okAnalysts.length > 0) {
    const confs = okAnalysts.map((a) => clamp01(a.payload!.confidence));
    const meanC = confs.reduce((x, y) => x + y, 0) / confs.length;
    const spread = confs.length > 1 ? Math.max(...confs) - Math.min(...confs) : 0;
    analystConsensus = { mean: meanC, spread };
    analystScore = clamp01(meanC - 0.5 * spread);
  }

  const overall = Math.round(
    Math.max(0, Math.min(100,
      100 * (
        0.30 * modelAgreement +
        0.25 * alignmentScore +
        0.15 * bandTightness +
        0.15 * coverageScore +
        0.15 * analystScore
      ) - freshnessPenalty,
    )),
  );

  return {
    overall,
    modelAgreement,
    indicatorAlignment: { bullish, bearish, neutral },
    dataFreshnessDays,
    coverage: { delivered: args.delivered, missing: args.missing },
    analystConsensus,
    bandTightness,
  };
}
