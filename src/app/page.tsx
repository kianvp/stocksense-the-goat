import { LoadingScreen } from "@/components/landing/site/LoadingScreen";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { Hero } from "@/components/landing/site/Hero";
import { TickerTape } from "@/components/landing/TickerTape";
import { About } from "@/components/landing/site/About";
import { Stats } from "@/components/landing/site/Stats";
import { CtaShowcase } from "@/components/landing/site/CtaShowcase";
import { Bento } from "@/components/landing/site/Bento";
import { FAQ } from "@/components/landing/FAQ";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <main className="bg-(--color-bg)">
      <LoadingScreen />
      <SmoothScroll />

      {/* Dark region: cinematic hero + a live NSE tape as real-data proof */}
      <div className="gradient-brand-soft relative overflow-clip bg-(--color-brand-950)">
        <Hero />
        <TickerTape />
      </div>

      {/* Light editorial flow */}
      <About />
      <Stats />
      <CtaShowcase />
      <Bento />
      <FAQ />
      <Footer />
    </main>
  );
}
