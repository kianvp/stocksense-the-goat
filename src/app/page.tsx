import { MarketingNav } from "@/components/layout/MarketingNav";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { Hero3D } from "@/components/landing/hero3d/Hero3D";
import { TickerTape } from "@/components/landing/TickerTape";
import { MarketPulse } from "@/components/landing/MarketPulse";
import { VelocityMarquee } from "@/components/landing/VelocityMarquee";
import { FeatureCinema } from "@/components/landing/FeatureCinema";
import { QuantEngine } from "@/components/landing/QuantEngine";
import { StatsBand } from "@/components/landing/StatsBand";
import { Principles } from "@/components/landing/Principles";
import { FAQ } from "@/components/landing/FAQ";
import { CtaBanner } from "@/components/landing/CtaBanner";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <main className="bg-(--color-bg)">
      <SmoothScroll />

      {/* Dark cinematic region: nav, pinned WebGL hero, live tape, glide, marquee */}
      <div className="gradient-brand-soft noise relative overflow-clip">
        <div className="absolute inset-0 grid-mask pointer-events-none" />
        <div className="relative">
          <MarketingNav />
          <Hero3D />
          <TickerTape />
          <MarketPulse />
          <VelocityMarquee />
        </div>
      </div>

      {/* Light editorial region */}
      <FeatureCinema />

      {/* Dark centrepiece: live technical-analysis engine showing its math */}
      <QuantEngine />

      <StatsBand />
      <Principles />
      <FAQ />
      <CtaBanner />
      <Footer />
    </main>
  );
}
