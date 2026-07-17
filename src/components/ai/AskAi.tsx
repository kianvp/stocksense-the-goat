"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, TrendingUp, AlertTriangle, ArrowRight, Bot } from "lucide-react";
import Link from "next/link";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { generateJson, type GeminiContent } from "@/lib/api/gemini";
import { getQuote, type Quote } from "@/lib/api/yahoo";
import { ChatSidebar } from "./ChatSidebar";
import { ThinkingSteps, markStep, type Step } from "./ThinkingSteps";
import {
  newConversation,
  loadConversations,
  saveConversations,
  deriveTitle,
  guessSymbol,
  hydrateStock,
  fallbackMessage,
  type Conversation,
  type ChatMessage,
} from "@/lib/chat-store";

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

const SYSTEM_PROMPT = `You are Sense, an AI markets assistant for Indian retail investors using a stock-research app called InvestSense.
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AskAi() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyChatId, setBusyChatId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);

  // Load saved chats once on mount; always land on the most recently active one.
  useEffect(() => {
    const saved = loadConversations();
    if (saved.length > 0) {
      const latest = [...saved].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      setConversations(saved);
      setActiveId(latest.id);
    } else {
      const fresh = newConversation();
      setConversations([fresh]);
      setActiveId(fresh.id);
    }
    hydrated.current = true;
  }, []);

  // Persist on every change (post-hydration).
  useEffect(() => {
    if (!hydrated.current) return;
    saveConversations(conversations);
  }, [conversations]);

  const active = conversations.find((c) => c.id === activeId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages.length, busy, steps.length]);

  function handleNewChat() {
    const current = conversations.find((c) => c.id === activeId);
    // Don't stack empty drafts — reuse the current one if it has no messages yet.
    if (current && !current.messages.some((m) => m.role === "user")) return;
    const fresh = newConversation();
    setConversations((prev) => [...prev, fresh]);
    setActiveId(fresh.id);
  }

  function handleDelete(id: string) {
    const next = conversations.filter((c) => c.id !== id);
    if (next.length === 0) {
      const fresh = newConversation();
      setConversations([fresh]);
      setActiveId(fresh.id);
      return;
    }
    setConversations(next);
    if (id === activeId) {
      const fallback = [...next].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      setActiveId(fallback.id);
    }
  }

  function handleRename(id: string, title: string) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }

  async function send(promptRaw: string) {
    const trimmed = promptRaw.trim();
    const current = conversations.find((c) => c.id === activeId);
    if (!trimmed || busy || !current) return;

    const chatId = current.id;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: trimmed };
    const isFirstUserMsg = !current.messages.some((m) => m.role === "user");
    const historyMsgs = [...current.messages, userMsg];

    setConversations((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, title: isFirstUserMsg ? deriveTitle(trimmed) : c.title, messages: historyMsgs, updatedAt: Date.now() }
          : c,
      ),
    );
    setInput("");
    setBusy(true);
    setBusyChatId(chatId);

    setSteps([{ id: "understand", label: "Understanding your question", status: "active" }]);
    await wait(220);
    setSteps((s) => markStep(s, "understand", "done"));

    setSteps((s) => [...s, { id: "search", label: "Searching the market for related tickers", status: "active" }]);
    await wait(240);
    const candidate = guessSymbol(trimmed);
    setSteps((s) => markStep(s, "search", "done"));

    let preQuote: Quote | null = null;
    if (candidate) {
      setSteps((s) => [...s, { id: "quote", label: `Fetching live price for ${candidate}`, status: "active" }]);
      preQuote = await getQuote(candidate);
      setSteps((s) => markStep(s, "quote", "done"));
    }

    setSteps((s) => [...s, { id: "gemini", label: "Reasoning about your question", status: "active" }]);
    const geminiHistory: GeminiContent[] = historyMsgs
      .filter((m) => m.id !== "seed-1")
      .map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] }));
    const answer = await generateJson<GeminiAnswer>(geminiHistory, { system: SYSTEM_PROMPT, temperature: 0.55 });
    setSteps((s) => markStep(s, "gemini", "done"));

    setSteps((s) => [...s, { id: "compile", label: "Compiling your answer", status: "active" }]);
    let aiMsg: ChatMessage;
    if (!answer) {
      aiMsg = fallbackMessage(trimmed);
    } else {
      const symbolForCard = answer.symbol ?? candidate;
      const stock = symbolForCard
        ? await hydrateStock(symbolForCard, candidate ? { symbol: candidate, quote: preQuote } : undefined)
        : undefined;
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
          related: answer.related?.map((s) => s.toUpperCase()).filter((s) => /^[A-Z0-9]{1,15}$/.test(s)),
        },
      };
    }
    await wait(150);
    setSteps((s) => markStep(s, "compile", "done"));
    await wait(150);

    setConversations((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, aiMsg], updatedAt: Date.now() } : c)),
    );
    setBusy(false);
    setBusyChatId(null);
    setSteps([]);
  }

  const showEmptyPrompts = active && !active.messages.some((m) => m.role === "user");
  const showThinking = busy && busyChatId === activeId;

  return (
    <div className="grid h-[calc(100vh-9rem)] gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="hidden lg:flex flex-col rounded-2xl border border-(--color-border) bg-(--color-surface) p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-(--color-brand-700) text-white">
            <Bot className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[14px] font-semibold tracking-tight">Sense</p>
            <p className="text-[11.5px] text-(--color-fg-subtle)">AI markets assistant</p>
          </div>
        </div>
        <ChatSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={handleNewChat}
          onDelete={handleDelete}
          onRename={handleRename}
        />
      </aside>

      <Card padding="none" className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-(--color-brand-50) text-(--color-brand-700)">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[14px] font-semibold tracking-tight">{active?.title ?? "Ask the AI"}</p>
              <p className="text-[11.5px] text-(--color-fg-subtle)">Powered by Gemini · live prices via Yahoo Finance</p>
            </div>
          </div>
          <Badge tone="brand">Beta</Badge>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
          {active?.messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} text={m.text} /> : <AiBubble key={m.id} msg={m} />))}
          {showEmptyPrompts && !showThinking && (
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-(--color-brand-50) text-(--color-brand-700)">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    className="rounded-full border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-[12.5px] text-(--color-fg-muted) hover:border-(--color-brand-300) hover:bg-(--color-brand-50) hover:text-(--color-brand-700)"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {showThinking && (
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-(--color-brand-50) text-(--color-brand-700)">
                <Sparkles className="h-4 w-4" />
              </span>
              <ThinkingSteps steps={steps} />
            </div>
          )}
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
              placeholder={busy && busyChatId !== activeId ? "Sense is thinking in another chat…" : "Ask anything — e.g. 'How is Infosys doing this quarter?'"}
              rows={1}
              disabled={busy}
              className="flex-1 resize-none bg-transparent px-2 py-2 text-[14.5px] text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              className="grid h-10 w-10 place-items-center rounded-xl bg-(--color-brand-700) text-white hover:bg-(--color-brand-800) disabled:opacity-50"
              disabled={!input.trim() || busy}
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

function AiBubble({ msg }: { msg: ChatMessage }) {
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
            <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-(--color-fg-subtle)">AI confidence</p>
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
