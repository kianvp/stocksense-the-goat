import { notFound } from "next/navigation";
import { StockDetailView } from "@/components/stock/StockDetailView";
import { NIFTY500_STOCKS, lookupInstrument } from "@/lib/universe";
import { NIFTY_50 } from "@/lib/mock-data";

export async function generateStaticParams() {
  const symbols = new Set<string>([
    ...NIFTY_50.map((s) => s.symbol),
    ...NIFTY500_STOCKS.map((s) => s.symbol),
  ]);
  return Array.from(symbols).map((symbol) => ({ symbol }));
}

type Props = { params: Promise<{ symbol: string }> };

export default async function StockDetailPage({ params }: Props) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  const inst = lookupInstrument(symbol);
  const curated = NIFTY_50.find((s) => s.symbol === symbol);
  if (!inst && !curated) notFound();

  return (
    <StockDetailView
      symbol={symbol}
      name={inst?.name ?? curated!.name}
      industry={inst?.industry ?? curated?.sector}
      kind={inst?.kind ?? "stock"}
    />
  );
}
