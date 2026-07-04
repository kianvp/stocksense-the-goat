"use client";

import { useReveal, useCountUp } from "@/lib/use-reveal";

const STATS = [
  { to: 2354, format: (v: number) => `${Math.round(v).toLocaleString("en-IN")}+`, label: "NSE stocks, live" },
  { to: 328, format: (v: number) => `${Math.round(v)}`, label: "ETFs tracked" },
  { to: 500000, format: (v: number) => `₹${(v / 100000).toFixed(v >= 500000 ? 0 : 1)}L`, label: "Virtual cash to practise" },
  { to: 20, format: (v: number) => `${Math.round(v)}s`, label: "Quote refresh cycle" },
];

export function StatsBand() {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <section id="stats" className="border-y border-(--color-border) bg-(--color-surface)">
      <div ref={ref} className="mx-auto grid max-w-7xl grid-cols-2 gap-y-12 px-5 py-20 md:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-[40px] font-semibold tabular tracking-[-0.03em] text-(--color-fg) sm:text-[48px]">
              <Counter to={s.to} format={s.format} start={shown} />
            </p>
            <p className="mt-1.5 text-[13px] text-(--color-fg-muted)">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Counter({ to, format, start }: { to: number; format: (v: number) => string; start: boolean }) {
  const val = useCountUp(to, start);
  return <span>{format(val)}</span>;
}
