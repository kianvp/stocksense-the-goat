"use client";

// About: a single large statement where each word lifts from muted grey to full
// colour as a reading-line sweeps through it, triggered on scroll.

import { useReveal } from "@/lib/use-reveal";

type Clause = { text: string; color: string; weight?: number };

// Colour + weight per clause; words inherit these as they resolve.
const CLAUSES: Clause[] = [
  { text: "We believe investing should be clear, data-driven, and within everyone's reach.", color: "var(--color-fg-muted)" },
  { text: "InvestSense turns the entire Indian market", color: "var(--color-brand-600)", weight: 600 },
  { text: "into insight you can act on — live prices, AI research and quant signals working together, at every step.", color: "var(--color-fg)" },
];

export function About() {
  const { ref, shown } = useReveal<HTMLDivElement>("0px 0px -20% 0px");

  // Flatten to a single indexed word stream so the stagger reads left-to-right.
  let i = 0;

  return (
    <section id="about" className="bg-(--color-brand-50) px-5 py-24">
      <div ref={ref} className="mx-auto max-w-4xl rounded-2xl bg-(--color-surface) p-8 shadow-[var(--shadow-lg)] sm:p-14">
        <div className="mb-8 flex items-center justify-center gap-2 text-[13px] text-(--color-fg-subtle)">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-(--color-brand-100)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--color-brand-500)" />
          </span>
          About InvestSense
        </div>

        <p className="text-center text-[22px] leading-[1.5] sm:text-[30px] sm:leading-[1.45]">
          {CLAUSES.map((clause, ci) => (
            <span key={ci}>
              {clause.text.split(" ").map((word) => {
                const idx = i++;
                return (
                  <span
                    key={idx}
                    className="inline-block"
                    style={{
                      color: shown ? clause.color : "#9aa8a0",
                      opacity: shown ? 1 : 0.3,
                      fontWeight: clause.weight ?? 400,
                      transition: "color 0.5s ease, opacity 0.5s ease",
                      transitionDelay: `${idx * 42}ms`,
                    }}
                  >
                    {word}&nbsp;
                  </span>
                );
              })}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
