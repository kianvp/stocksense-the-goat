// Research Engine — Layer 5 (specialist analysts) and Layer 6 (debate).
//
// The division of labour is absolute: deterministic code computes every
// number; Gemini only interprets, argues, and synthesises. Each call:
//
//   • receives ONLY a structured JSON slice relevant to its role (never raw
//     APIs, never another agent's prose) — so no two analysts duplicate work;
//   • must return a strict schema, validated in code;
//   • has every number in its prose cross-checked against the numbers it was
//     given (qa.ts numeric grounding). A response with fabricated figures is
//     retried once with the violations named; a second failure rejects the
//     output entirely rather than showing it to the user.

import { generateJson, getLastGenerateError, type GeminiContent } from "@/lib/api/gemini";
import {
  collectAllowedNumbers, proseOf, ungroundedNumbers,
  validateAnalyst, validateModerator, validateThesis,
} from "./qa";
import type {
  AnalystOutput, AnalystRole, ModeratorOutput, ThesisOutput,
} from "./types";

const BASE_RULES =
  "You are one specialist inside a multi-agent equity research system for Indian markets. " +
  "STRICT RULES: use ONLY the numbers present in the provided JSON — never invent, recall or estimate figures. " +
  "Every claim must trace to a provided field. Educational register, INR context, no buy/sell advice. " +
  "Return ONLY the requested JSON object.";

const ANALYST_SCHEMA =
  `{"summary": "3-4 sentences", "bullishEvidence": ["..."], "bearishEvidence": ["..."], ` +
  `"confidence": 0.0-1.0, "assumptions": ["..."], "uncertainties": ["..."]}`;

const ROLE_BRIEFS: Record<AnalystRole, string> = {
  technical:
    "Role: TECHNICAL ANALYST. Interpret trend, momentum, oscillators, bands, " +
    "support/resistance and volume features. Judge the structure of the move, not the company.",
  quant:
    "Role: QUANT MODEL ANALYST. Interpret the forecasting models: their point paths, " +
    "confidence interval, walk-forward diagnostics (RMSE/MAE/MAPE/directional accuracy) " +
    "versus the random-walk baseline, and the ensemble weights. Say plainly whether the " +
    "models demonstrate real predictive edge over the baseline or not.",
  risk:
    "Role: RISK ANALYST. Interpret volatility (realised and EWMA forecast), drawdowns, " +
    "beta, regime, anomalies and the width of the forecast interval. Quantify what could " +
    "be lost and under what conditions.",
  news:
    "Role: NEWS ANALYST. You receive general market headlines (not company-specific — " +
    "say so). Extract only themes that plausibly bear on Indian equities broadly.",
};

async function callWithGrounding<T>(args: {
  system: string;
  user: string;
  input: unknown;
  validate: (p: unknown) => p is T & (AnalystOutput | ThesisOutput | ModeratorOutput);
  maxUngrounded?: number;
}): Promise<T> {
  const allowed = collectAllowedNumbers(args.input);
  const contents: GeminiContent[] = [{ role: "user", parts: [{ text: args.user }] }];

  for (let attempt = 1; attempt <= 2; attempt++) {
    // thinkingBudget 0: the maths is already done by deterministic code —
    // extended reasoning only adds seconds of latency per agent.
    const res = await generateJson<T>(contents, {
      system: args.system,
      temperature: 0.3,
      thinkingBudget: 0,
    });
    if (!res) throw new Error(getLastGenerateError() ?? "no response from model");
    if (!args.validate(res)) throw new Error("schema validation failed");

    const bad = ungroundedNumbers(proseOf(res), allowed);
    if (bad.length <= (args.maxUngrounded ?? 0)) return res;

    if (attempt === 1) {
      // Feed the violation back — the retry loop the QA layer demands.
      contents.push(
        { role: "model", parts: [{ text: JSON.stringify(res) }] },
        { role: "user", parts: [{ text:
          `VALIDATION FAILED. These figures do not exist in the data you were given: ` +
          `${bad.slice(0, 8).join(", ")}. Rewrite using only provided numbers. Same JSON schema.` }] },
      );
    } else {
      throw new Error(`ungrounded figures after retry: ${bad.slice(0, 5).join(", ")}`);
    }
  }
  throw new Error("unreachable");
}

/* ------------------------------------------------------------ analysts */

export async function runAnalyst(role: AnalystRole, input: unknown): Promise<AnalystOutput> {
  return callWithGrounding<AnalystOutput>({
    system: `${BASE_RULES}\n${ROLE_BRIEFS[role]}`,
    user:
      `DATA (your only source of facts):\n${JSON.stringify(input)}\n\n` +
      `Return exactly: ${ANALYST_SCHEMA}`,
    input,
    validate: validateAnalyst,
    // Headlines contain figures we did not compute; the news analyst quotes
    // them legitimately, so grounding is relaxed for that role only.
    maxUngrounded: role === "news" ? 12 : 0,
  });
}

/* -------------------------------------------------------------- debate */

export async function runThesis(
  side: "bull" | "bear",
  evidence: { supporting: string[]; opposing: string[]; context: unknown },
): Promise<ThesisOutput> {
  return callWithGrounding<ThesisOutput>({
    system:
      `${BASE_RULES}\nRole: ${side.toUpperCase()} ADVOCATE in a structured debate. ` +
      `Build the strongest honest ${side} case from the supporting evidence, and rebut ` +
      `the opposing evidence point by point. You may not ignore an opposing point — ` +
      `address it or concede it.`,
    user:
      `SUPPORTING EVIDENCE:\n${JSON.stringify(evidence.supporting)}\n\n` +
      `OPPOSING EVIDENCE (rebut each):\n${JSON.stringify(evidence.opposing)}\n\n` +
      `NUMERIC CONTEXT:\n${JSON.stringify(evidence.context)}\n\n` +
      `Return exactly: {"thesis": "one paragraph", "strongestPoints": ["..."], ` +
      `"rebuttalOfOpposingCase": ["..."], "confidence": 0.0-1.0}`,
    input: evidence,
    validate: validateThesis,
  });
}

export async function runModerator(args: {
  bull: ThesisOutput;
  bear: ThesisOutput;
  quantContext: unknown;
}): Promise<ModeratorOutput> {
  const input = args;
  return callWithGrounding<ModeratorOutput>({
    system:
      `${BASE_RULES}\nRole: DEBATE MODERATOR. Your sole responsibility is adjudication: ` +
      `weigh which specific arguments are strongest and which fail, using the quantitative ` +
      `context as the arbiter where the sides conflict. NEVER split the difference or ` +
      `average — name winners and losers among the arguments and let the verdict follow ` +
      `from them. "neutral" is only for genuinely balanced evidence, not for hedging.`,
    user:
      `BULL CASE:\n${JSON.stringify(args.bull)}\n\n` +
      `BEAR CASE:\n${JSON.stringify(args.bear)}\n\n` +
      `QUANTITATIVE CONTEXT (ground truth):\n${JSON.stringify(args.quantContext)}\n\n` +
      `Return exactly: {"verdict": "bullish|bearish|neutral", "executiveSummary": "3-5 sentences", ` +
      `"winningArguments": ["..."], "rejectedArguments": ["..."], "keyRisks": ["..."], ` +
      `"keyOpportunities": ["..."], "confidence": 0.0-1.0}`,
    input,
    validate: validateModerator,
  });
}
