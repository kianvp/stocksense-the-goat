import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function CtaBanner() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-24">
      <div className="relative overflow-hidden rounded-[28px] gradient-brand p-10 sm:p-16">
        <div className="particle-dust pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-(--color-brand-400)/20 blur-3xl" />
        <div className="absolute -left-20 -bottom-24 h-72 w-72 rounded-full bg-(--color-brand-300)/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-[40px] sm:leading-[1.08]">
            Start understanding the market.
            <span className="block text-(--color-brand-200)">In ten minutes a day.</span>
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-white/75">
            Open a free InvestSense account, track the portfolio you already own, put any two
            stocks head-to-head, and run your first AI-powered research session. No card needed.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/dashboard" size="lg" className="bg-white text-(--color-brand-900) hover:bg-white/90 shadow-none">
              Create free account <ArrowRight className="h-4 w-4" />
            </Button>
            <Button href="/dashboard" variant="ghost" size="lg" className="text-white hover:bg-white/10">
              Open demo dashboard
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
