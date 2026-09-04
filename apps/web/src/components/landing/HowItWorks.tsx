"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Band, BandHeading } from "@/components/ui/Band";
import { StickyStory, type StoryStep } from "@/components/ui/StickyStory";
import { Reveal } from "./Reveal";

/** A photograph with a caption pinned to its lower edge. */
function Photo({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- local asset */}
      <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-6 pt-16 text-sm font-semibold text-white">
        {caption}
      </figcaption>
    </figure>
  );
}

const steps: StoryStep[] = [
  {
    eyebrow: "Step one",
    title: "Post your project brief.",
    body: "Land area, location, floors, budget and style. Five minutes, and it is in front of every verified architect on the platform.",
    visual: (
      <Photo
        src="/landing/drafting.jpg"
        alt="An architect drafting at a desk"
        caption="A brief takes about five minutes"
      />
    ),
  },
  {
    eyebrow: "Step two",
    title: "Meet verified professionals.",
    body: "Browse portfolios, compare ratings, and request a low-cost concept brief before you commit to anyone.",
    visual: (
      <Photo
        src="/landing/facade.jpg"
        alt="A finished building facade"
        caption="NID, IAB or IEB, and RAJUK checked"
      />
    ),
  },
  {
    eyebrow: "Step three",
    title: "Design and permits, together.",
    body: "Approve designs online while your RAJUK permit is filed and tracked through ECPS, step by step.",
    visual: (
      <Photo
        src="/landing/blueprint-tools.jpg"
        alt="Floor plans with measuring tools"
        caption="Every ECPS step, tracked in the open"
      />
    ),
  },
  {
    eyebrow: "Step four",
    title: "Build with protection.",
    body: "Engineers sign off each milestone. Escrow releases a payment only when the work has been verified.",
    visual: (
      <Photo
        src="/landing/sunset-build.jpg"
        alt="A building under construction at sunset"
        caption="Escrow releases on the engineer's signature"
      />
    ),
  },
];

/**
 * How it works: the four steps as a sticky story. The photograph on the right
 * stays put while the steps scroll past on the left and it swaps for each.
 */
export function HowItWorks() {
  return (
    <Band id="how-it-works" tone="band">
      <Reveal>
        <BandHeading
          eyebrow="How it works"
          title="Four steps from plot to keys."
          lead="The whole journey lives on one platform. No chasing offices, no cash handshakes."
        />
      </Reveal>
      <StickyStory steps={steps} className="mt-16" />
      <Reveal>
        <div className="mt-16 text-center">
          <Link href="/architects" className="btn-primary px-7 py-3 text-sm">
            Browse verified architects
            <ArrowRight className="btn-arrow h-4 w-4" />
          </Link>
        </div>
      </Reveal>
    </Band>
  );
}
