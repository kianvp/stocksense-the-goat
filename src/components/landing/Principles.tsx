"use client";

// Replaces the old fabricated testimonials. Instead of invented five-star
// quotes, this states what the product actually commits to — verifiable,
// not social proof theatre.

import { Radio, FunctionSquare, ShieldOff, Wallet } from "lucide-react";
import { useReveal } from "@/lib/use-reveal";
import { cn } from "@/lib/cn";

const PRINCIPLES = [
  {
    icon: Radio,
    title: "Real data, not decoration",
    body: "Every price, chart and indicator is pulled live from the exchange for 2,350+ NSE stocks and 325+ ETFs. Nothing on screen is faked for a screenshot.",
  },
  {
    icon: FunctionSquare,
    title: "Transparent math",
    body: "The quant engine shows every formula with the numbers plugged in — SMA, RSI, Bollinger, volatility, regression, Sharpe. You can check its working.",
  },
  {
    icon: ShieldOff,
    title: "No tips, no hype",
    body: "StockSense never tells you what to buy. It helps you understand what you're looking at. We're not a SEBI-registered advisor and don't pretend to be.",
  },
  {
    icon: Wallet,
    title: "Practise before you risk",
    body: "A ₹5,00,000 virtual portfolio lets you test ideas at live prices with zero money on the line — until you're ready to use a real broker.",
  },
];

export function Principles() {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <section id="principles" className="mx-auto max-w-7xl px-5 py-24">
      <div className="max-w-2xl">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.2em] text-(--color-brand-700)">
          What we actually promise
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-[46px] sm:leading-[1.05]">
          No testimonials.
          <br className="hidden sm:block" /> Just how it works.
        </h2>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-(--color-fg-muted)">
          We&apos;d rather show you the mechanics than quote made-up five-star reviews. Here&apos;s
          what the product stands on.
        </p>
      </div>

      <div ref={ref} className="mt-14 grid gap-4 sm:grid-cols-2">
        {PRINCIPLES.map((p, i) => (
          <div
            key={p.title}
            className={cn(
              "reveal group flex gap-4 rounded-2xl border border-(--color-border) bg-(--color-surface) p-7 transition-all hover:border-(--color-brand-300) hover:shadow-[0_18px_40px_-24px_rgba(13,31,23,0.16)]",
              shown && "reveal-shown",
            )}
            style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-(--color-brand-50) text-(--color-brand-700) transition-colors group-hover:bg-(--color-brand-100)">
              <p.icon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-[16px] font-semibold tracking-tight text-(--color-fg)">{p.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-(--color-fg-muted)">{p.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
