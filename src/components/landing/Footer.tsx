import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/layout/Logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Market", href: "/market" },
      { label: "Stocks", href: "/stocks" },
      { label: "ETFs", href: "/etfs" },
      { label: "Portfolio Simulator", href: "/portfolio" },
      { label: "Ask AI", href: "/ask-ai" },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "Glossary", href: "/glossary" },
      { label: "Market News", href: "/news" },
      { label: "Where to buy", href: "/buy-stocks" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Press", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "Disclaimer", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-(--color-brand-950) text-white">
      {/* Particle-dust texture + oversized watermark */}
      <div className="particle-dust pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[0.22em] left-1/2 -translate-x-1/2 select-none whitespace-nowrap text-[21vw] font-semibold leading-none tracking-[-0.05em] text-white/[0.04]"
      >
        StockSense
      </div>

      <div className="relative mx-auto max-w-7xl px-5 pt-24 pb-40 sm:pb-48">
        <div className="grid gap-14 md:grid-cols-[1.3fr_1fr_1fr_1fr_1fr] md:gap-10">
          <div>
            <Logo tone="dark" />
            <p className="mt-5 max-w-xs text-[14px] leading-relaxed text-white/55">
              An intelligent companion for the Indian market. Not a SEBI-registered advisor —
              always do your own research.
            </p>
          </div>
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <p className="text-[10.5px] uppercase tracking-[0.2em] font-semibold text-(--color-brand-300)">
                {c.title}
              </p>
              <ul className="mt-6 space-y-3.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="group inline-flex items-center gap-1 text-[14.5px] text-white/70 hover:text-white">
                      <span className="relative">
                        {l.label}
                        <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-(--color-brand-300) transition-[width] duration-300 group-hover:w-full" />
                      </span>
                      <ArrowUpRight className="h-3 w-3 -translate-x-1 text-(--color-brand-300) opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-20 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row sm:items-center">
          <p className="text-[12px] text-white/40">
            © {new Date().getFullYear()} StockSense Technologies. All rights reserved.
          </p>
          <p className="max-w-md text-[11.5px] leading-relaxed text-white/40 sm:text-right">
            Investments in the securities market are subject to market risks. Read all related
            documents carefully before investing.
          </p>
        </div>
      </div>
    </footer>
  );
}
