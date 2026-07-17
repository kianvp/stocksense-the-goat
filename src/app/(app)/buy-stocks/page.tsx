import { ArrowUpRight, BadgeIndianRupee, KeyRound, ShieldCheck, Wallet } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const STEPS = [
  { n: 1, icon: KeyRound, title: "Open account", body: "Choose a broker below and start your account in minutes." },
  { n: 2, icon: ShieldCheck, title: "Complete KYC", body: "Verify yourself online with PAN, Aadhaar and a quick video." },
  { n: 3, icon: Wallet, title: "Add money", body: "Transfer funds via UPI or net banking — instant on most apps." },
  { n: 4, icon: BadgeIndianRupee, title: "Start investing", body: "Search a stock, place your first order, and you're an investor." },
];

const BROKERS = [
  {
    name: "Zerodha",
    badge: "Most popular",
    tag: "💎",
    body: "India's largest discount broker with 1.3 Cr+ clients. Famous for the Kite trading platform.",
    points: [
      "Zero brokerage on delivery",
      "₹20 flat on intraday/F&O",
      "Best-in-class research tools",
      "UI loved by serious traders",
    ],
    href: "https://zerodha.com",
  },
  {
    name: "Groww",
    badge: "Beginner friendly",
    tag: "🌱",
    body: "Most beginner-friendly investing app in India. Simple UI, great for first-time investors.",
    points: [
      "Stocks & mutual funds together",
      "Zero account opening fees",
      "Intuitive mobile-first design",
      "Free educational content",
    ],
    href: "https://groww.in",
  },
  {
    name: "Upstox",
    badge: "Backed by Ratan Tata",
    tag: "⚡",
    body: "Fast-growing discount broker backed by Ratan Tata and Tiger Global. Clean app, competitive pricing.",
    points: [
      "Aggressive brokerage rates",
      "Lightning-fast order placement",
      "Option chain analyser built-in",
      "Strong API & charting tools",
    ],
    href: "https://upstox.com",
  },
  {
    name: "Angel One",
    badge: "Full-service",
    tag: "👼",
    body: "One of India's oldest brokers, now tech-first. ARQ AI for personalised recommendations and research-led picks.",
    points: [
      "Zero brokerage on delivery",
      "ARQ Prime AI app trades",
      "Strong research & advisory",
      "Pan-India branch network",
    ],
    href: "https://angelone.in",
  },
  {
    name: "ICICI Direct",
    badge: "Bank-backed",
    tag: "🏦",
    body: "Backed by ICICI Bank. Best for those who want bank-level safety and integrated 3-in-1 account.",
    points: [
      "Linked to ICICI Bank account",
      "3-in-1 (savings + demat + trade)",
      "Strong research desk",
      "Higher brokerage, premium service",
    ],
    href: "https://icicidirect.com",
  },
  {
    name: "HDFC Securities",
    badge: "Premium",
    tag: "🛡️",
    body: "HDFC Bank's brokerage arm. Ideal for existing HDFC Bank customers. Seamless integration.",
    points: [
      "Seamless HDFC Bank integration",
      "Strong fundamental research",
      "Pan-India branch network",
      "Reliable, conservative platform",
    ],
    href: "https://hdfcsec.com",
  },
];

export default function BuyStocksPage() {
  return (
    <div className="space-y-7">
      <header>
        <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-(--color-fg-subtle)">
          Where to buy
        </p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight">Open a Demat account &amp; start investing</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-(--color-fg-muted)">
          InvestSense is not a broker. When you&apos;re ready to invest with real money, pick from these SEBI-registered
          brokers. We earn no commission from these links.
        </p>
      </header>

      <Card padding="md" className="bg-(--color-brand-50)/40 border-(--color-brand-100)">
        <p className="text-[13px] text-(--color-fg-muted)">
          <strong className="font-semibold text-(--color-fg)">Before you invest:</strong> You need a Demat account and a Trading account. SEBI mandates KYC. Takes 10-15 minutes online. InvestSense earns no commission from these links.
        </p>
      </Card>

      <section>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="relative rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-(--color-brand-700) text-[13px] font-bold text-white">
                {s.n}
              </span>
              <s.icon className="absolute right-5 top-5 h-5 w-5 text-(--color-fg-subtle)" />
              <p className="mt-4 text-[15px] font-semibold tracking-tight text-(--color-fg)">{s.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-(--color-fg-muted)">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {BROKERS.map((b) => (
            <li key={b.name}>
              <Card padding="md" interactive className="h-full">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[20px]">{b.tag}</p>
                    <h3 className="mt-1 text-[18px] font-semibold tracking-tight text-(--color-fg)">{b.name}</h3>
                  </div>
                  <Badge tone="brand">{b.badge}</Badge>
                </div>
                <p className="mt-3 text-[13.5px] leading-relaxed text-(--color-fg-muted)">{b.body}</p>
                <ul className="mt-4 space-y-1.5">
                  {b.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-[13px] text-(--color-fg)">
                      <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-brand-500)" />
                      {p}
                    </li>
                  ))}
                </ul>
                <a
                  href={b.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-(--color-brand-700) px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-(--color-brand-800)"
                >
                  Open account at {b.name}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <Card padding="md">
        <CardEyebrow>Disclaimer</CardEyebrow>
        <p className="mt-2 text-[13px] leading-relaxed text-(--color-fg-muted)">
          InvestSense is an educational tool. We are not SEBI-registered investment advisors. Always do your own research.
          Investments in the securities market are subject to market risks; read all related documents carefully.
        </p>
      </Card>
    </div>
  );
}
