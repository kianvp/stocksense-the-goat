"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, Sparkles } from "lucide-react";
import { searchUniverse, instrumentHref } from "@/lib/universe";

export function SearchHero() {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const router = useRouter();

  const results = useMemo(() => searchUniverse(q, 7), [q]);

  function submit() {
    const top = results[0];
    if (top) router.push(instrumentHref(top.symbol));
  }

  return (
    <div className="relative">
      <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) shadow-[0_6px_24px_-12px_rgba(13,31,23,0.10)] focus-within:border-(--color-brand-300) focus-within:shadow-[0_18px_40px_-20px_rgba(13,31,23,0.16)]">
        <div className="flex items-center gap-3 px-5 py-4">
          <Search className="h-5 w-5 text-(--color-fg-subtle)" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 120)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Search 2,350+ stocks & 325+ ETFs — e.g. INFY, Zomato, gold ETF"
            className="flex-1 bg-transparent text-[15.5px] text-(--color-fg) placeholder:text-(--color-fg-subtle) focus:outline-none"
          />
          <span className="hidden items-center gap-1.5 rounded-md border border-(--color-border) bg-(--color-surface-2) px-2 py-1 text-[11px] font-medium text-(--color-fg-subtle) sm:inline-flex">
            <CornerDownLeft className="h-3 w-3" /> Enter
          </span>
        </div>
        {focus && results.length > 0 && (
          <ul className="max-h-72 overflow-y-auto border-t border-(--color-border) py-1.5">
            {results.map((r) => (
              <li key={r.symbol}>
                <Link
                  href={instrumentHref(r.symbol)}
                  className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-(--color-surface-2)"
                >
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold tracking-tight text-(--color-fg)">{r.symbol}</p>
                    <p className="truncate text-[11.5px] text-(--color-fg-subtle)">
                      {r.name}
                      {r.industry ? ` • ${r.industry}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-(--color-border) bg-(--color-surface-2) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-(--color-fg-muted)">
                    {r.kind === "etf" ? "ETF" : r.inNifty50 ? "Nifty 50" : "NSE"}
                  </span>
                </Link>
              </li>
            ))}
            <li className="border-t border-(--color-border)">
              <Link
                href="/ask-ai"
                className="flex items-center justify-between gap-3 px-5 py-2.5 text-(--color-brand-700) hover:bg-(--color-brand-50)"
              >
                <span className="inline-flex items-center gap-2 text-[13px] font-medium">
                  <Sparkles className="h-4 w-4" /> Ask the AI: “{q}”
                </span>
                <CornerDownLeft className="h-3.5 w-3.5" />
              </Link>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
