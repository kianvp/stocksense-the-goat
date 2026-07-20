// Google Gemini client. Calls v1beta generateContent from the browser using
// an API key (NEXT_PUBLIC_*). For chat we ask the model to return JSON so
// the UI can render rich response cards.

const KEY = process.env.NEXT_PUBLIC_GEMINI_KEY;
const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type GeminiPart = { text: string };
export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

type GenerateOptions = {
  system?: string;
  responseJson?: boolean;
  temperature?: number;
  /**
   * Gemini 2.5 thinking budget in tokens. 0 disables thinking — right for
   * pipeline calls where deterministic code already did the maths and the
   * model only interprets; leaving it undefined keeps the model default
   * (chat features keep their existing behaviour).
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

export function hasGeminiKey() {
  return !!KEY;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Why the most recent generate() returned null — for caller diagnostics. */
let lastError: string | null = null;
export function getLastGenerateError(): string | null {
  return lastError;
}

export async function generate(
  contents: GeminiContent[],
  opts: GenerateOptions = {},
): Promise<string | null> {
  if (!KEY) return null;
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.6,
      ...(opts.responseJson ? { responseMimeType: "application/json" } : {}),
      ...(opts.thinkingBudget !== undefined
        ? { thinkingConfig: { thinkingBudget: opts.thinkingBudget } }
        : {}),
    },
  };
  if (opts.system) {
    body.systemInstruction = { role: "system", parts: [{ text: opts.system }] };
  }

  // 429/503 are transient (free-tier RPM caps, overload). Parallel multi-agent
  // bursts hit them routinely, so back off and retry rather than failing the
  // whole agent. Crucially, a 429's Retry-After must be honoured for real:
  // the free-tier limit is a per-MINUTE window, so the server often asks for
  // 20–40s — retrying sooner just burns the retry against the same window.
  const BACKOFF_MS = [15_000, 30_000];
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const r = await fetch(`${ENDPOINT}?key=${encodeURIComponent(KEY)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (r.status === 429 || r.status === 503) {
        // A PER-DAY quota rejection cannot be waited out — retrying only adds
        // latency to a guaranteed failure. Fail fast with a precise reason.
        const errBody = await r.text().catch(() => "");
        if (/PerDay/i.test(errBody)) {
          lastError = "Gemini daily free-tier quota exhausted for this key (resets midnight PT)";
          return null;
        }
        if (attempt === BACKOFF_MS.length) {
          lastError = `rate limited (HTTP ${r.status}) after ${BACKOFF_MS.length + 1} attempts`;
          return null;
        }
        const retryAfter = parseFloat(r.headers.get("retry-after") ?? "");
        const wait = Number.isFinite(retryAfter)
          ? Math.min(retryAfter * 1000, 35_000)
          : BACKOFF_MS[attempt];
        await sleep(wait);
        continue;
      }
      if (!r.ok) {
        lastError = `HTTP ${r.status}`;
        return null;
      }
      const json: GeminiResponse = await r.json();
      const text =
        json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? null;
      if (text !== null) lastError = null;
      else lastError = json.promptFeedback?.blockReason ?? "empty response";
      return text;
    } catch (e) {
      if (attempt === BACKOFF_MS.length) {
        lastError = e instanceof Error ? e.message : "network error";
        return null;
      }
      await sleep(BACKOFF_MS[attempt]);
    }
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
