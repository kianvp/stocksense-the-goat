"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const FAQS = [
  {
    q: "Is StockSense a broker? Can I buy real stocks here?",
    a: "No. StockSense is a research, simulation and AI assistant — not a broker. When you're ready to invest real money, we point you to SEBI-registered brokers like Zerodha, Groww, Upstox and others.",
  },
  {
    q: "How accurate is the live price data?",
    a: "Prices update every second during market hours and reflect cached NSE data with a small delay. For execution decisions on real money, always confirm with your broker.",
  },
  {
    q: "Does the AI tell me which stock to buy?",
    a: "No. The AI helps you understand a stock — fundamentals, recent moves, risks and peers. It's an aid to your thinking, not financial advice.",
  },
  {
    q: "How does the trading simulator work?",
    a: "Every new account gets ₹5,00,000 in virtual cash. You can buy and sell at live prices, track P&L, allocation and performance versus Nifty 50 — without risking a rupee.",
  },
  {
    q: "Is StockSense free?",
    a: "Yes, the core product is free. Premium tiers with deeper analytics and more AI tokens are on the roadmap.",
  },
  {
    q: "Is my data safe?",
    a: "We store the minimum needed to run your account. We never sell your data and use industry-standard encryption in transit and at rest.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="border-t border-(--color-border) bg-(--color-surface-2)/50">
      <div className="mx-auto max-w-3xl px-5 py-24">
        <div className="text-center">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-(--color-brand-700)">
            Questions, answered
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-[48px] sm:leading-[1.05]">
            Frequently asked.
          </h2>
        </div>
        <ul className="mt-12 divide-y divide-(--color-border) rounded-2xl border border-(--color-border) bg-(--color-surface)">
          {FAQS.map((f, i) => (
            <FaqItem key={f.q} {...f} defaultOpen={i === 0} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function FaqItem({ q, a, defaultOpen }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left"
        aria-expanded={open}
      >
        <span className="text-[15.5px] font-semibold tracking-tight text-(--color-fg)">{q}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-(--color-fg-subtle) transition-transform",
            open && "rotate-180 text-(--color-brand-700)",
          )}
        />
      </button>
      <div
        className={cn(
          "grid overflow-hidden px-6 transition-[grid-template-rows] duration-300",
          open ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0">
          <p className="text-[14.5px] leading-relaxed text-(--color-fg-muted)">{a}</p>
        </div>
      </div>
    </li>
  );
}
