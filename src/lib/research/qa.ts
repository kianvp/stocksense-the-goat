// Research Engine — Layer 8: quality assurance.
//
// Every validator here is deterministic code, not another LLM call. The
// reasoning: an LLM asked "did the other LLM hallucinate?" can itself
// hallucinate; a cross-referencer that checks every figure in an analyst's
// prose against the numbers that were actually computed cannot. The pipeline
// uses these validators in a check → retry-once → suppress loop, so output
// that fails hard validation never reaches the report body.

import type { AnalystOutput, ModeratorOutput, QaFinding, ThesisOutput } from "./types";

/* ------------------------------------------------- numeric grounding */

/**
 * Analytic constants that legitimately appear in market commentary without
 * being derived from this run's data (thresholds, conventions, percentiles).
 */
const WHITELIST = new Set([
  0, 1, 2, 3, 5, 7, 9, 10, 12, 14, 20, 26, 30, 50, 52, 60, 70, 80, 90, 95,
  100, 200, 252, 1.96, 2.5, 0.5,
]);

/** Pull the numeric tokens out of prose. Handles ₹, %, commas, decimals. */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /-?\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
  for (const m of text.matchAll(re)) {
    const v = parseFloat(m[0].replace(/,/g, ""));
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** Flatten every number reachable in a JSON-ish structure. */
export function collectAllowedNumbers(input: unknown, into = new Set<number>()): Set<number> {
  if (typeof input === "number" && Number.isFinite(input)) {
    into.add(input);
    // Prose rounds: allow the common renderings of the same figure.
    into.add(Math.round(input));
    into.add(Math.round(input * 10) / 10);
    into.add(Math.round(input * 100) / 100);
    // Fractions are usually quoted as percentages.
    if (Math.abs(input) <= 1.5) {
      into.add(Math.round(input * 1000) / 10); // 0.0432 → 4.3
      into.add(Math.round(input * 100));
    }
  } else if (Array.isArray(input)) {
    input.forEach((v) => collectAllowedNumbers(v, into));
  } else if (input && typeof input === "object") {
    Object.values(input).forEach((v) => collectAllowedNumbers(v, into));
  }
  return into;
}

/**
 * The hallucination detector. Every number an analyst states must match a
 * number that exists in the data it was given (within 1.5% relative or 0.05
 * absolute tolerance), or be a whitelisted analytic constant, or a plausible
 * calendar token (years, small day counts pass via the whitelist and range).
 * Returns the figures that could not be grounded.
 */
export function ungroundedNumbers(text: string, allowed: Set<number>): number[] {
  const bad: number[] = [];
  for (const n of extractNumbers(text)) {
    if (WHITELIST.has(n)) continue;
    if (n >= 1990 && n <= 2100 && Number.isInteger(n)) continue; // years
    let ok = false;
    for (const a of allowed) {
      if (Math.abs(n - a) <= Math.max(0.05, Math.abs(a) * 0.015)) { ok = true; break; }
    }
    if (!ok) bad.push(n);
  }
  return bad;
}

/* --------------------------------------------------- schema validation */

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isStrArr = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const isConf = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1;

export function validateAnalyst(p: unknown): p is AnalystOutput {
  const o = p as AnalystOutput;
  return !!o && isStr(o.summary) && isStrArr(o.bullishEvidence) && isStrArr(o.bearishEvidence)
    && isConf(o.confidence) && isStrArr(o.assumptions) && isStrArr(o.uncertainties);
}

export function validateThesis(p: unknown): p is ThesisOutput {
  const o = p as ThesisOutput;
  return !!o && isStr(o.thesis) && isStrArr(o.strongestPoints)
    && isStrArr(o.rebuttalOfOpposingCase) && isConf(o.confidence);
}

export function validateModerator(p: unknown): p is ModeratorOutput {
  const o = p as ModeratorOutput;
  return !!o && ["bullish", "bearish", "neutral"].includes(o.verdict)
    && isStr(o.executiveSummary) && isStrArr(o.winningArguments)
    && isStrArr(o.rejectedArguments) && isStrArr(o.keyRisks)
    && isStrArr(o.keyOpportunities) && isConf(o.confidence);
}

/* ------------------------------------------------------- consistency */

/**
 * Cross-agent coherence checks. These produce warnings, not suppressions:
 * a moderator is allowed to disagree with the indicator panel — that is the
 * point of a debate — but the disagreement is surfaced, never hidden.
 */
export function consistencyFindings(args: {
  moderatorVerdict: "bullish" | "bearish" | "neutral" | null;
  compositeZ: number | null;
  forecastTarget: number | null;
  lastClose: number | null;
}): QaFinding[] {
  const out: QaFinding[] = [];
  const { moderatorVerdict, compositeZ, forecastTarget, lastClose } = args;

  if (moderatorVerdict && compositeZ !== null && Math.abs(compositeZ) > 0.75) {
    const indicatorSide = compositeZ > 0 ? "bullish" : "bearish";
    if (moderatorVerdict !== "neutral" && moderatorVerdict !== indicatorSide) {
      out.push({
        validator: "consistency",
        agentId: "debate.moderator",
        severity: "warning",
        detail: `moderator verdict "${moderatorVerdict}" opposes the indicator composite (Z=${compositeZ.toFixed(2)}, ${indicatorSide})`,
      });
    }
  }
  if (forecastTarget !== null && lastClose !== null && moderatorVerdict) {
    const forecastSide = forecastTarget > lastClose ? "bullish" : "bearish";
    if (moderatorVerdict !== "neutral" && forecastSide !== moderatorVerdict) {
      out.push({
        validator: "consistency",
        agentId: "debate.moderator",
        severity: "warning",
        detail: `verdict "${moderatorVerdict}" vs ensemble forecast pointing ${forecastSide}`,
      });
    }
  }
  return out;
}

/** Serialise an analyst/thesis payload to the prose that needs grounding. */
export function proseOf(payload: AnalystOutput | ThesisOutput | ModeratorOutput): string {
  return Object.values(payload)
    .map((v) => (Array.isArray(v) ? v.join(" ") : typeof v === "string" ? v : ""))
    .join(" ");
}
