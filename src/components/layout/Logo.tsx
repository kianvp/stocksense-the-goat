import Link from "next/link";
import { cn } from "@/lib/cn";

export function Logo({
  className,
  href = "/",
  tone = "light",
}: {
  className?: string;
  href?: string;
  tone?: "light" | "dark";
}) {
  const fg = tone === "dark" ? "text-white" : "text-(--color-fg)";
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", fg, className)}
    >
      <LogoMark tone={tone} />
      <span className="text-[17px]">
        Invest<span className={tone === "dark" ? "text-(--color-brand-300)" : "text-(--color-brand-600)"}>Sense</span>
      </span>
    </Link>
  );
}

export function LogoMark({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const ring = tone === "dark" ? "#3d9a6b" : "#115e3c";
  const bg = tone === "dark" ? "#0c4a30" : "#ecf6f0";
  const stroke = tone === "dark" ? "#a6d4b8" : "#115e3c";
  return (
    <span
      className={cn("relative inline-flex h-7 w-7 items-center justify-center rounded-[8px]", className)}
      style={{ background: bg, boxShadow: `inset 0 0 0 1px ${ring}33` }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path
          d="M4 16l5-5 3.5 3L20 7"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="7" r="2" fill={stroke} />
      </svg>
    </span>
  );
}
