"use client";

// Transparent nav that floats over the dark hero (Cirform-style — it scrolls
// away rather than sticking, so it never sits over the light sections below).

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { useAuth } from "@/lib/auth/AuthContext";

const links = [
  { href: "#about", label: "About" },
  { href: "#numbers", label: "Numbers" },
  { href: "#features", label: "Features" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  return (
    <header className="absolute inset-x-0 top-0 z-40">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5">
        <Logo tone="dark" />

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 text-[14px] text-white/80 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-white">
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="hidden text-[14px] text-white/80 transition-colors hover:text-white sm:block">
            {user ? "Dashboard" : "Login"}
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-[13px] font-medium text-white backdrop-blur transition hover:bg-white/10"
          >
            {user ? "Open app" : "Sign up"}
          </Link>
          <button
            type="button"
            className="text-white md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="mx-5 mt-1 rounded-2xl border border-white/10 bg-(--color-brand-900) p-4 md:hidden">
          <div className="flex flex-col gap-3">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="text-sm text-white/80" onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
