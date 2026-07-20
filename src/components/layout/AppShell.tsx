"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  LineChart,
  CandlestickChart,
  Layers,
  Scale,
  Briefcase,
  Bookmark,
  Newspaper,
  Bot,
  Radar,
  Sigma,
  BookOpen,
  History,
  ExternalLink,
  Search,
  Bell,
  Menu,
  X,
} from "lucide-react";
import { Logo, LogoMark } from "./Logo";
import { UserMenu } from "@/components/auth/UserMenu";
import { cn } from "@/lib/cn";

const PRIMARY = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/market", label: "Market", icon: LineChart },
  { href: "/stocks", label: "Stocks", icon: CandlestickChart },
  { href: "/etfs", label: "ETFs", icon: Layers },
  { href: "/compare", label: "Compare", icon: Scale },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/watchlist", label: "Watchlist", icon: Bookmark },
];

const SECONDARY = [
  { href: "/ask-ai", label: "Ask AI", icon: Bot, badge: "AI" },
  { href: "/research", label: "Deep Research", icon: Radar, badge: "AI" },
  { href: "/quant", label: "Quant Engine", icon: Sigma, badge: "MATH" },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/glossary", label: "Glossary", icon: BookOpen },
  { href: "/recently-viewed", label: "Recently Viewed", icon: History },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex bg-(--color-bg)">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[256px] -translate-x-full border-r border-(--color-border) bg-(--color-surface) transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          open && "translate-x-0",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-5 pt-5 pb-4">
            <Logo />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="md:hidden text-(--color-fg-subtle)"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3">
            <SidebarSection label="Workspace" items={PRIMARY} onNavigate={() => setOpen(false)} />
            <SidebarSection label="Discover" items={SECONDARY} onNavigate={() => setOpen(false)} />
          </nav>
          <div className="border-t border-(--color-border) p-3">
            <Link
              href="/buy-stocks"
              className="flex items-center justify-between rounded-xl bg-(--color-brand-50) px-3 py-2.5 text-sm font-medium text-(--color-brand-700) hover:bg-(--color-brand-100)"
            >
              <span className="inline-flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Buy Real Stocks
              </span>
            </Link>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setOpen(true)} />
        <main className="flex-1 px-5 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-[1280px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SidebarSection({
  label,
  items,
  onNavigate,
}: {
  label: string;
  items: { href: string; label: string; icon: typeof LayoutDashboard; badge?: string }[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="mb-4">
      <p className="px-3 pt-3 pb-1.5 text-[10.5px] uppercase tracking-[0.16em] font-semibold text-(--color-fg-subtle)">
        {label}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group relative flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[14px] font-medium",
                  active
                    ? "bg-(--color-surface-2) text-(--color-fg)"
                    : "text-(--color-fg-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg)",
                )}
              >
                <span className="inline-flex items-center gap-3">
                  {active && (
                    <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-(--color-brand-600)" />
                  )}
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px]",
                      active ? "text-(--color-brand-700)" : "text-(--color-fg-subtle) group-hover:text-(--color-fg-muted)",
                    )}
                  />
                  {item.label}
                </span>
                {item.badge && (
                  <span className="rounded-full bg-(--color-brand-50) px-1.5 py-0.5 text-[10px] font-semibold text-(--color-brand-700)">
                    {item.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-(--color-border) bg-(--color-bg)/85 px-4 backdrop-blur-md md:px-8">
      <button
        type="button"
        onClick={onMenuClick}
        className="md:hidden text-(--color-fg-muted)"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="md:hidden">
        <LogoMark />
      </div>
      <div className="flex-1 max-w-xl">
        <div className="relative hidden md:block">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-fg-subtle)" />
          <input
            type="search"
            placeholder="Search stocks, sectors, or ask the AI…"
            className="h-10 w-full rounded-xl border border-(--color-border) bg-(--color-surface) pl-10 pr-3 text-sm placeholder:text-(--color-fg-subtle) focus:border-(--color-brand-300) focus:ring-4 focus:ring-(--color-brand-50) focus:outline-none"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10.5px] font-semibold text-(--color-fg-subtle) bg-(--color-surface-2) border border-(--color-border) rounded px-1.5 py-0.5">
            ⌘K
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-(--color-up)/30 bg-(--color-up-soft) px-2.5 py-1 text-[11px] font-semibold tracking-tight text-(--color-up)">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 rounded-full bg-(--color-up) animate-pulse-dot" />
          </span>
          Markets open
        </span>
        <button
          type="button"
          className="relative grid h-10 w-10 place-items-center rounded-xl border border-(--color-border) bg-(--color-surface) text-(--color-fg-muted) hover:bg-(--color-surface-2)"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-(--color-brand-500)" />
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
