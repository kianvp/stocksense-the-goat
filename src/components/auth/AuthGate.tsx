"use client";

import Link from "next/link";
import { LogIn, ShieldCheck, LineChart, Bot, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { Logo } from "@/components/layout/Logo";

// Client-side access wall. Because the app is a static export there is no
// server to enforce this — it gates the UI, not the underlying files. Real
// enforcement would need an authenticated backend.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, hydrated, ready, clientId, openSignIn } = useAuth();

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-(--color-bg)">
        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-(--color-brand-500) animate-pulse-dot" />
      </div>
    );
  }

  if (user) return <>{children}</>;

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-(--color-brand-950) px-5 py-12 text-white">
      <div className="pointer-events-none absolute inset-0 grid-mask opacity-40" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-(--color-brand-500)/12 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="flex justify-center">
          <Logo tone="dark" />
        </div>

        <div className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-sm">
          <div className="px-7 pt-8 pb-7 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-(--color-brand-500)/15 text-(--color-brand-300)">
              <Lock className="h-5 w-5" />
            </span>
            <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.02em]">Sign in to continue</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-white/60">
              StockSense is a members-only workspace. Sign in with Google to open the dashboard,
              live markets, portfolio simulator, and AI research.
            </p>

            <button
              type="button"
              onClick={openSignIn}
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[14.5px] font-semibold text-(--color-brand-900) transition-colors hover:bg-white/90"
            >
              <LogIn className="h-4 w-4" />
              {clientId ? "Continue with Google" : "Sign in"}
            </button>
            {!ready && clientId && (
              <p className="mt-3 text-[12px] text-white/45">Loading Google sign-in…</p>
            )}

            <div className="mt-7 grid gap-2.5 border-t border-white/10 pt-6 text-left text-[12.5px] text-white/55">
              <Perk icon={<LineChart className="h-3.5 w-3.5 text-(--color-brand-300)" />} text="Live prices for every NSE stock and ETF" />
              <Perk icon={<Bot className="h-3.5 w-3.5 text-(--color-brand-300)" />} text="AI research copilot and quant engine" />
              <Perk icon={<ShieldCheck className="h-3.5 w-3.5 text-(--color-brand-300)" />} text="We only see your name, email and picture" />
            </div>
          </div>
          <Link
            href="/"
            className="block border-t border-white/10 bg-white/[0.02] px-7 py-3.5 text-center text-[12.5px] font-medium text-white/55 hover:text-white"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

function Perk({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <p className="flex items-start gap-2.5">
      <span className="mt-0.5">{icon}</span>
      <span>{text}</span>
    </p>
  );
}
