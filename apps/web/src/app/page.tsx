import { HeroScrub } from "@/components/landing/HeroScrub";
import { IntroScrub } from "@/components/landing/IntroScrub";
import { Navbar } from "@/components/landing/Navbar";
import {
  CtaSection,
  Features,
  Footer,
  HowItWorks,
  Showcase,
  Statement,
  Stats,
  Vision,
} from "@/components/landing/sections";

export default function HomePage() {
  return (
    <div id="top">
      <Navbar />
      <main>
        <HeroScrub />
        <IntroScrub />
        <Statement />
        <Features />
        <Showcase />
        <HowItWorks />
        <Stats />
        <Vision />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
