"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, TrendingUp, AlertTriangle, ArrowRight, Bot } from "lucide-react";
import Link from "next/link";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { generateJson, hasGeminiKey, type GeminiContent } from "@/lib/api/gemini";
import { getQuote } from "@/lib/api/yahoo";
import { NIFTY_50 } from "@/lib/mock-data";

type Rich = {
  confidence?: number;
  stock?: { symbol: string; name: string; price: number; changePct: number };
  metrics?: { label: string; value: string }[];
  bullets?: string[];
  risks?: string[];
  opportunities?: string[];
  related?: string[];
};

type Message = {
  id: string;
  role: "user" | "ai";
  text: string;
  rich?: Rich;
};

type GeminiAnswer = {
  text: string;
  confidence?: number;
  symbol?: string;
  bullets?: string[];
  opportunities?: string[];
  risks?: string[];
  related?: string[];
};

const SUGGESTED = [
  "Should I invest in Apple?",
  "Explain TCS Q3 earnings",
  "Compare HDFC Bank and ICICI Bank",
  "Why is Reliance falling today?",
  "Is Adani Enterprises overvalued?",
  "What is a P/E ratio?",
];

const INITIAL: Message[] = [
  {
    id: "seed-1",
    role: "ai",
    text:
      "Hi, I'm Sense — your AI markets companion. I can help you research stocks, compare peers, and understand earnings. What would you like to look at?",
  },
];

const SYSTEM_PROMPT = `You are Sense, an AI markets assistant for Indian retail investors using a stock-research app called StockSense.
Reply briefly and clearly in plain English. Educational tone, never give explicit buy/sell advice.

You MUST respond with a single JSON object matching this TypeScript type — no markdown, no prose outside the JSON:
{
  "text": string,                              // 2-3 sentence natural-language answer
  "confidence": number,                        // 0-100, how confident you are
  "symbol"?: string,                           // NSE ticker (e.g. "RELIANCE", "INFY") if the answer focuses on one stock. Use the ticker only, no ".NS" suffix.
  "bullets"?: string[],                        // 3-5 short summary bullets
  "opportunities"?: string[],                  // up to 3 short upside points (only if relevant)
  "risks"?: string[],                          // up to 3 short downside points (only if relevant)
  "related"?: string[]                         // up to 4 related NSE tickers
}

Always use Indian-context examples and INR. If the user asks about a US stock, return its US ticker in "symbol" only if asked specifically.`;

function findKnownSymbol(text: string): string | undefined {
  const upper = text.toUpperCase();
  return NIFTY_50.find((s) => upper.includes(s.symbol))?.symbol;
}

// Gemini's response is rendered straight into `/stocks/[symbol]` links, so
// only accept strings that actually look like a ticker before trusting them.
const SAFE_TICKER = /^[A-Z0-9]{1,15}$/;

function isSafeTicker(s: string): boolean {
  return SAFE_TICKER.test(s);
}

async function hydrateStockCard(answer: GeminiAnswer): Promise<Rich["stock"] | undefined> {
  const sym = answer.symbol?.toUpperCase();
  if (!sym || !isSafeTicker(sym)) return undefined;
  const known = NIFTY_50.find((s) => s.symbol === sym);
  const name = known?.name ?? sym;
  const quote = await getQuote(sym);
  if (quote) {
    return { symbol: sym, name, price: quote.price, changePct: quote.changePct };
  }
  if (known) {
    return { symbol: sym, name: known.name, price: known.basePrice, changePct: 0 };
  }
  return undefined;
}

function fallbackResponse(prompt: string): Message {
  return {
    id: `a-${Date.now()}`,
    role: "ai",
    text: hasGeminiKey()
      ? "I couldn't reach Gemini just now — please try again in a moment."
      : "Add a NEXT_PUBLIC_GEMINI_KEY to enable real AI responses. In the meantime, " +
        "for a question like \"" + prompt + "\" I'd start with last earnings, peer multiples, and recent news.",
    rich: {
      confidence: 30,
      bullets: [
        "Check the latest quarterly results and management commentary",
        "Compare valuation multiples (P/E, P/B) to sector peers",
        "Look at recent news, analyst revisions and insider activity",
      ],
    },
  };
}

export function AskAi() {
  const [messages, setMessages] = useState<Message[]>(INITIAL);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  async function send(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", text: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setThinking(true);

    const history: GeminiContent[] = next
      .filter((m) => m.id !== "seed-1")
      .map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      }));

    let aiMsg: Message;
    const answer = await generateJson<GeminiAnswer>(history, { system: SYSTEM_PROMPT, temperature: 0.55 });
    if (!answer) {
      aiMsg = fallbackResponse(trimmed);
    } else {
      const stock = await hydrateStockCard({
        ...answer,
        symbol: answer.symbol ?? findKnownSymbol(trimmed),
      });
      aiMsg = {
        id: `a-${Date.now()}`,
        role: "ai",
        text: answer.text,
        rich: {
          confidence: answer.confidence,
          stock,
          bullets: answer.bullets,
          opportunities: answer.opportunities,
          risks: answer.risks,
          related: answer.related?.map((s) => s.toUpperCase()).filter(isSafeTicker),
        },
      };
    }
    setMessages((m) => [...m, aiMsg]);
    setThinking(false);
  }

  return (
    <div className="grid h-[calc(100vh-9rem)] gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="hidden lg:flex flex-col rounded-2xl border border-(--color-border) bg-(--color-surface) p-4">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-(--color-brand-700) text-white">
            <Bot className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[14px] font-semibold tracking-tight">Sense</p>
            <p className="text-[11.5px] text-(--color-fg-subtle)">AI markets assistant</p>
          </div>
        </div>
        <p className="mt-4 text-[11px] uppercase tracking-[0.14em] font-semibold text-(--color-fg-subtle)">
          Try asking
        </p>
        <ul className="mt-3 space-y-1.5">
          {SUGGESTED.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => send(q)}
                className="w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 text-left text-[13px] text-(--color-fg) hover:border-(--color-brand-300) hover:bg-(--color-brand-50)"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-auto rounded-xl border border-(--color-border) bg-(--color-surface-2) p-3 text-[11.5px] leading-relaxed text-(--color-fg-muted)">
          Sense is for educational use only. Not financial advice. Always cross-check critical info.
        </div>
      </aside>

      <Card padding="none" className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-(--color-brand-50) text-(--color-brand-700)">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[14px] font-semibold tracking-tight">Ask the AI</p>
              <p className="text-[11.5px] text-(--color-fg-subtle)">Powered by Gemini · live prices via Yahoo Finance</p>
            </div>
          </div>
          <Badge tone="brand">Beta</Badge>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
          {messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} text={m.text} /> : <AiBubble key={m.id} msg={m} />))}
          {thinking && <Thinking />}
        </div>

        <div className="border-t border-(--color-border) bg-(--color-bg) p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 rounded-2xl border border-(--color-border) bg-(--color-surface) p-2 focus-within:border-(--color-brand-300) focus-within:shadow-[0_18px_38px_-22px_rgba(13,31,23,0.18)]"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask anything — e.g. 'How is Infosys doing this quarter?'"
              rows={1}
              className="flex-1 resize-none bg-transparent px-2 py-2 text-[14.5px] text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:outline-none"
            />
            <button
              type="submit"
              className="grid h-10 w-10 place-items-center rounded-xl bg-(--color-brand-700) text-white hover:bg-(--color-brand-800) disabled:opacity-50"
              disabled={!input.trim() || thinking}
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] text-(--color-fg-subtle)">
            Sense can make mistakes. Verify important information before acting.
          </p>
        </div>
      </Card>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[78%] rounded-2xl rounded-tr-md bg-(--color-brand-700) px-4 py-3 text-[14.5px] text-white shadow-[0_8px_24px_-16px_rgba(11,90,60,0.45)]">
        {text}
      </div>
    </div>
  );
}

function AiBubble({ msg }: { msg: Message }) {
  const r = msg.rich;
  return (
    <div className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-(--color-brand-50) text-(--color-brand-700)">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="max-w-[78%] space-y-3">
        <div className="rounded-2xl rounded-tl-md border border-(--color-border) bg-(--color-surface) px-4 py-3 text-[14.5px] leading-relaxed text-(--color-fg)">
          {msg.text}
        </div>
        {r?.stock && (
          <div className="overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-surface)">
            <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
              <div>
                <p className="text-[13.5px] font-semibold tracking-tight">{r.stock.symbol}</p>
                <p className="text-[11.5px] text-(--color-fg-subtle)">{r.stock.name}</p>
              </div>
              <div className="text-right">
                <p className="text-[16px] font-semibold tabular">₹{r.stock.price.toFixed(2)}</p>
                <p className={`text-[11.5px] font-semibold tabular ${r.stock.changePct >= 0 ? "text-(--color-up)" : "text-(--color-down)"}`}>
                  {r.stock.changePct >= 0 ? "+" : ""}
                  {r.stock.changePct.toFixed(2)}%
                </p>
              </div>
            </div>
            {r.metrics && (
              <div className="grid grid-cols-4 gap-2 px-4 py-3">
                {r.metrics.map((m) => (
                  <div key={m.label}>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-(--color-fg-subtle)">{m.label}</p>
                    <p className="mt-0.5 text-[12.5px] font-semibold tabular">{m.value}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-(--color-border) bg-(--color-surface-2) px-4 py-2">
              <Link
                href={`/stocks/${r.stock.symbol}`}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-(--color-brand-700) hover:underline"
              >
                Open full report <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}
        {r?.bullets && r.bullets.length > 0 && (
          <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4">
            <CardEyebrow>Summary</CardEyebrow>
            <ul className="mt-2 space-y-1.5 text-[13.5px] text-(--color-fg)">
              {r.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-brand-600)" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {((r?.opportunities && r.opportunities.length > 0) || (r?.risks && r.risks.length > 0)) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {r?.opportunities && r.opportunities.length > 0 && (
              <div className="rounded-2xl border border-(--color-up)/20 bg-(--color-up-soft)/40 p-4">
                <CardEyebrow className="text-(--color-up)">Opportunities</CardEyebrow>
                <ul className="mt-2 space-y-1.5 text-[13px] text-(--color-fg)">
                  {r.opportunities.map((o, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--color-up)" />
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r?.risks && r.risks.length > 0 && (
              <div className="rounded-2xl border border-(--color-down)/20 bg-(--color-down-soft)/40 p-4">
                <CardEyebrow className="text-(--color-down)">Risks</CardEyebrow>
                <ul className="mt-2 space-y-1.5 text-[13px] text-(--color-fg)">
                  {r.risks.map((o, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--color-down)" />
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {typeof r?.confidence === "number" && (
          <div className="flex items-center gap-3 rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-(--color-fg-subtle)">
              AI confidence
            </p>
            <div className="flex-1 overflow-hidden rounded-full bg-(--color-surface-2)">
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${r.confidence}%`, background: "linear-gradient(90deg, #6fb98e, #115e3c)" }}
              />
            </div>
            <p className="text-[12px] font-semibold tabular">{r.confidence}%</p>
          </div>
        )}
        {r?.related && r.related.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11.5px] text-(--color-fg-subtle)">Related:</span>
            {r.related.map((sym) => (
              <Link
                key={sym}
                href={`/stocks/${sym}`}
                className="rounded-full border border-(--color-border) bg-(--color-surface) px-2.5 py-0.5 text-[11.5px] font-medium text-(--color-fg-muted) hover:border-(--color-brand-300) hover:text-(--color-brand-700)"
              >
                {sym}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-(--color-brand-50) text-(--color-brand-700)">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-(--color-border) bg-(--color-surface) px-4 py-3">
        <Dot />
        <Dot delay={120} />
        <Dot delay={240} />
      </div>
    </div>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="block h-1.5 w-1.5 rounded-full bg-(--color-fg-subtle) animate-pulse-dot"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}
