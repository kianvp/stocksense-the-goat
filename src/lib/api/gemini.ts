// Gemini client.
//
// On the deployed site every call goes through the same-origin Worker endpoint
// `/__ai`, which holds the API key as a server-side Secret — the key is NEVER
// shipped in the client bundle where it could be scraped and drained. In local
// dev (`next dev`, no Worker) the call falls back to a direct request using
// NEXT_PUBLIC_GEMINI_KEY from .env.local, which is gitignored and never
// deployed. Same code path, two transports.

// Local-dev fallback ONLY. Gated on NODE_ENV so that in a production build the
// branch is statically false and the minifier strips the NEXT_PUBLIC_* read
// entirely — the key can never be inlined into the shipped bundle even if the
// build variable is (accidentally) still set. In production the key lives only
// in the Worker (/__ai) as a server-side Secret.
const LOCAL_KEY =
  process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_GEMINI_KEY : undefined;
// "-latest" aliases (not pinned versions) so a model retirement — e.g. the
// 2.5 line being sunset — can't silently 404 us the way gemini-2.5-flash-lite
// did. Primary is full flash; fallback is the lighter lite model, which draws
// on a SEPARATE per-model free-tier daily quota, so it still answers when the
// primary's daily quota is spent.
const PRIMARY_MODEL = "gemini-flash-latest";
const FALLBACK_MODEL = "gemini-flash-lite-latest";
const googleEndpoint = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export type GeminiPart = { text: string };
export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

type GenerateOptions = {
  system?: string;
  responseJson?: boolean;
  temperature?: number;
  /**
   * Thinking control for pipeline calls where deterministic code already did
   * the maths and the model only interprets. 0 means "think as little as
   * possible": current 3.x flash models reject a literal budget of 0, so it is
   * mapped to thinkingLevel:"low" (their nearest equivalent). A positive value
   * is passed through as an explicit token budget. Undefined keeps the model
   * default (chat features keep their existing behaviour).
   */
  thinkingBudget?: number;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

/**
 * Optimistic in the browser: the Worker may hold the key even when the client
 * bundle has none (the intended production shape). Actual availability is
 * confirmed by the call itself, which degrades gracefully on failure. Use
 * checkAiConfigured() for a precise, quota-free answer.
 */
export function hasGeminiKey() {
  return !!LOCAL_KEY || typeof window !== "undefined";
}

let configuredCache: boolean | null = null;

/** Quota-free probe of whether the server actually has a key. Cached. */
export async function checkAiConfigured(): Promise<boolean> {
  if (configuredCache !== null) return configuredCache;
  if (typeof window === "undefined") {
    configuredCache = !!LOCAL_KEY;
    return configuredCache;
  }
  try {
    const r = await fetch("/__ai", { method: "GET", credentials: "same-origin", cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { configured?: boolean };
      configuredCache = !!j.configured;
      return configuredCache;
    }
    // 404 → no Worker (local dev): fall back to the client key.
    if (r.status === 404) {
      configuredCache = !!LOCAL_KEY;
      return configuredCache;
    }
  } catch {
    /* no Worker reachable */
  }
  configuredCache = !!LOCAL_KEY;
  return configuredCache;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Why the most recent generate() returned null — for caller diagnostics. */
let lastError: string | null = null;
export function getLastGenerateError(): string | null {
  return lastError;
}

/**
 * One HTTP attempt. Prefers the Worker proxy; if that isn't present (local
 * dev → 404) or explicitly can't serve (501), falls back to a direct Google
 * call with the local key. Returns the raw Response so the caller can inspect
 * status/body uniformly regardless of transport.
 */
async function sendOnce(model: string, body: string): Promise<Response | null> {
  if (typeof window !== "undefined") {
    try {
      const r = await fetch(`/__ai?model=${encodeURIComponent(model)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "same-origin",
        cache: "no-store",
      });
      // 404 (no Worker) or 501 (Worker has no key) → try the direct fallback.
      if (r.status !== 404 && r.status !== 501) return r;
    } catch {
      /* Worker unreachable — fall through to direct */
    }
  }
  if (!LOCAL_KEY) return null;
  try {
    return await fetch(`${googleEndpoint(model)}?key=${encodeURIComponent(LOCAL_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

type OnceResult = { text: string } | { text: null; exhausted: boolean };

/** Backoff loop for a single model. `exhausted` signals it's worth trying the
 *  lighter model, which draws on a separate free-tier pool. */
async function generateWithModel(model: string, body: string): Promise<OnceResult> {
  // 429/503 are transient (RPM caps, overload). A PER-DAY rejection, however,
  // cannot be waited out — retrying only adds latency to a guaranteed failure.
  const BACKOFF_MS = [15_000, 30_000];
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    const r = await sendOnce(model, body);
    if (!r) {
      lastError = "no AI transport available";
      return { text: null, exhausted: false };
    }
    if (r.status === 429 || r.status === 503) {
      const errBody = await r.text().catch(() => "");
      if (/PerDay/i.test(errBody)) {
        lastError = "Gemini daily free-tier quota exhausted (resets midnight PT)";
        return { text: null, exhausted: true };
      }
      if (attempt === BACKOFF_MS.length) {
        lastError = `rate limited (HTTP ${r.status}) after ${BACKOFF_MS.length + 1} attempts`;
        return { text: null, exhausted: true };
      }
      const retryAfter = parseFloat(r.headers.get("retry-after") ?? "");
      await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 35_000) : BACKOFF_MS[attempt]);
      continue;
    }
    if (!r.ok) {
      lastError = `HTTP ${r.status}`;
      return { text: null, exhausted: false };
    }
    const json = (await r.json().catch(() => null)) as GeminiResponse | null;
    const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? null;
    if (text !== null) {
      lastError = null;
      return { text };
    }
    lastError = json?.promptFeedback?.blockReason ?? "empty response";
    return { text: null, exhausted: false };
  }
  return { text: null, exhausted: true };
}

export async function generate(
  contents: GeminiContent[],
  opts: GenerateOptions = {},
): Promise<string | null> {
  const body = JSON.stringify({
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.6,
      ...(opts.responseJson ? { responseMimeType: "application/json" } : {}),
      ...(opts.thinkingBudget !== undefined
        ? {
            thinkingConfig:
              opts.thinkingBudget === 0
                ? { thinkingLevel: "low" } // 3.x can't hard-disable thinking; "low" is the floor
                : { thinkingBudget: opts.thinkingBudget },
          }
        : {}),
    },
    ...(opts.system ? { systemInstruction: { role: "system", parts: [{ text: opts.system }] } } : {}),
  });

  // Try flash; on quota exhaustion fall back to flash-lite (separate pool).
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    const res = await generateWithModel(model, body);
    if (res.text !== null) return res.text;
    if (!res.exhausted) return null; // hard failure — a different model won't help
  }
  return null;
}

export async function generateJson<T>(
  contents: GeminiContent[],
  opts: Omit<GenerateOptions, "responseJson"> = {},
): Promise<T | null> {
  const text = await generate(contents, { ...opts, responseJson: true });
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Models occasionally wrap JSON in ```json fences; strip and retry.
    const stripped = text
      .replace(/^\s*```(?:json)?/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    try {
      return JSON.parse(stripped) as T;
    } catch {
      return null;
    }
  }
}
