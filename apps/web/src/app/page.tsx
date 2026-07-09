import { HeroScrub } from "@/components/landing/HeroScrub";
import { Navbar } from "@/components/landing/Navbar";
import {
  CtaSection,
  Features,
  Footer,
  HowItWorks,
  Marquee,
  Stats,
  Vision,
} from "@/components/landing/sections";

export default function HomePage() {
  return (
    <div id="top">
      <Navbar />
      <main>
        <HeroScrub />
        <Marquee />
        <Features />
        <HowItWorks />
        <Stats />
        <Vision />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
