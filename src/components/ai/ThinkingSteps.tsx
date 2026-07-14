"use client";

// Live progress trace for the AI pipeline. Each step's status is driven by
// real async work in AskAi (search the universe, fetch a quote, call Gemini)
// — this only renders whatever state it's given, nothing here is simulated.

import { useEffect, useState } from "react";
import { Check, Loader2, Circle } from "lucide-react";
import { cn } from "@/lib/cn";

export type StepStatus = "pending" | "active" | "done";
export type Step = { id: string; label: string; status: StepStatus };

export function markStep(steps: Step[], id: string, status: StepStatus): Step[] {
  return steps.map((s) => (s.id === id ? { ...s, status } : s));
}

export function ThinkingSteps({ steps }: { steps: Step[] }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;

  return (
    <div className="w-full max-w-md animate-fade-up rounded-2xl border border-(--color-border) bg-(--color-surface) p-4 shadow-(--shadow-sm)">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-(--color-fg-muted)">
          <span className="h-1.5 w-1.5 rounded-full bg-(--color-brand-500) animate-pulse-dot" />
          Working
        </span>
        <span className="font-mono text-[11px] tabular text-(--color-fg-subtle)">
          {mm}:{ss.toString().padStart(2, "0")}
        </span>
      </div>
      <ul className="mt-3 space-y-2.5">
        {steps.map((s) => (
          <li key={s.id}>
            <div className="flex items-center gap-2.5">
              {s.status === "done" && <Check className="h-4 w-4 shrink-0 text-(--color-brand-600)" />}
              {s.status === "active" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-(--color-brand-600)" />}
              {s.status === "pending" && <Circle className="h-3.5 w-3.5 shrink-0 text-(--color-fg-subtle)" />}
              <span
                className={cn(
                  "text-[13.5px]",
                  s.status === "active" && "font-semibold text-(--color-fg)",
                  s.status === "done" && "text-(--color-fg-muted)",
                  s.status === "pending" && "text-(--color-fg-subtle)",
                )}
              >
                {s.label}
              </span>
            </div>
            {s.status === "active" && <div className="think-bar ml-[26px] mt-1.5" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
