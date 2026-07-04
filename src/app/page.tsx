import { MarketingNav } from "@/components/layout/MarketingNav";
import { CinematicHero } from "@/components/landing/CinematicHero";
import { TickerTape } from "@/components/landing/TickerTape";
import { MarketPulse } from "@/components/landing/MarketPulse";
import { FeatureCinema } from "@/components/landing/FeatureCinema";
import { StatsBand } from "@/components/landing/StatsBand";
import { Testimonials } from "@/components/landing/Testimonials";
import { FAQ } from "@/components/landing/FAQ";
import { CtaBanner } from "@/components/landing/CtaBanner";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <main className="bg-(--color-bg)">
      {/* Dark cinematic region: nav, hero, live tape, horizontal market glide */}
      <div className="gradient-brand-soft noise relative overflow-clip">
        <div className="absolute inset-0 grid-mask pointer-events-none" />
        <div className="relative">
          <MarketingNav />
          <CinematicHero />
          <TickerTape />
          <MarketPulse />
        </div>
      </div>

      {/* Light editorial region */}
      <FeatureCinema />
      <StatsBand />
      <Testimonials />
      <FAQ />
      <CtaBanner />
      <Footer />
    </main>
  );
}
