import Link from "next/link";
import { HealthCheck } from "@/components/HealthCheck";
import { CountUp } from "./CountUp";
import { Reveal } from "./Reveal";

/* ---------- Minimal geometric icons (24×24, stroke-based) ---------- */

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      {children}
    </svg>
  );
}

const icons = {
  shield: (
    <Icon>
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3Z" />
      <path d="M9 12l2 2 4-4.5" />
    </Icon>
  ),
  escrow: (
    <Icon>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15" r="1.6" />
    </Icon>
  ),
  permit: (
    <Icon>
      <path d="M6 3h9l4 4v14H6V3Z" />
      <path d="M15 3v4h4" />
      <path d="M9.5 14.5l2 2 3.5-4" />
    </Icon>
  ),
  design: (
    <Icon>
      <path d="M4 20l4-1L19.5 7.5a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" />
      <path d="M14.5 6.5l3 3" />
    </Icon>
  ),
  bidding: (
    <Icon>
      <path d="M4 19h16" />
      <rect x="5.5" y="12" width="3.4" height="7" rx="0.8" />
      <rect x="10.3" y="8" width="3.4" height="11" rx="0.8" />
      <rect x="15.1" y="4.5" width="3.4" height="14.5" rx="0.8" />
    </Icon>
  ),
  diary: (
    <Icon>
      <rect x="4.5" y="4" width="15" height="17" rx="2" />
      <path d="M8.5 2.5v3M15.5 2.5v3M8 10h8M8 14h8M8 18h5" />
    </Icon>
  ),
};

/* ---------- Marquee strip ---------- */

const marqueeItems = [
  "Verified Architects",
  "Structural Engineers",
  "Licensed Contractors",
  "RAJUK Permit Tracking",
  "Escrow Payments",
  "Materials Marketplace",
  "Live Site Diary",
  "DAP Zone Checks",
  "Transparent Bidding",
];

function MarqueeRow({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <ul aria-hidden={ariaHidden || undefined} className="flex w-max shrink-0 items-center">
      {marqueeItems.map((item) => (
        <li key={item} className="flex items-center">
          <span className="mx-6 text-xs font-bold tracking-[0.2em] text-stone-500 uppercase dark:text-slate-400">
            {item}
          </span>
          <span className="text-[9px] text-amber-500/80">◆</span>
        </li>
      ))}
    </ul>
  );
}

export function Marquee() {
  return (
    <section className="overflow-hidden border-y border-stone-200 bg-white py-4 transition-colors duration-500 dark:border-white/10 dark:bg-white/3">
      <div className="animate-marquee flex w-max hover:[animation-play-state:paused] motion-reduce:animate-none">
        <MarqueeRow />
        <MarqueeRow ariaHidden />
      </div>
    </section>
  );
}

/* ---------- Features ---------- */

const features = [
  {
    icon: icons.shield,
    title: "Verified professionals",
    body: "Architects, engineers, and contractors screened through NID, IAB/IEB membership, and RAJUK registration checks.",
  },
  {
    icon: icons.escrow,
    title: "Escrow-protected payments",
    body: "Funds sit safely in escrow and release only at approved milestones — via bKash, Nagad, or bank transfer.",
  },
  {
    icon: icons.permit,
    title: "RAJUK permits, guided",
    body: "DAP zone checks, fee calculators, document checklists, and ECPS submission tracking from day one.",
  },
  {
    icon: icons.design,
    title: "Design studio",
    body: "Concept briefs, floor plans, elevations, and 3D previews — with revision rounds built into every contract.",
  },
  {
    icon: icons.bidding,
    title: "Transparent bidding",
    body: "Post your BOQ and compare contractor bids side by side on price, rating, timeline, and past projects.",
  },
  {
    icon: icons.diary,
    title: "Live site diary",
    body: "Daily work logs, photos, attendance, and weather from your site — visible from anywhere, any time.",
  },
];

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24 sm:px-8 sm:py-32">
      <Reveal>
        <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
          The platform
        </p>
        <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
          Everything your build needs
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-stone-600 dark:text-slate-400">
          One trusted home for the entire journey — from an empty plot to the occupancy certificate.
        </p>
      </Reveal>

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <Reveal key={f.title} delay={(i % 3) * 110}>
            <div className="group h-full rounded-2xl border border-stone-200 bg-white p-7 shadow-sm transition duration-300 hover:-translate-y-1.5 hover:border-amber-400/60 hover:shadow-xl dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:hover:bg-white/10">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-stone-900 text-amber-400 transition duration-300 group-hover:scale-110 group-hover:rotate-3 dark:bg-white/10 dark:text-amber-300">
                {f.icon}
              </div>
              <h3 className="mt-5 text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-slate-400">
                {f.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------- How it works ---------- */

const steps = [
  {
    title: "Post your project brief",
    body: "Land area, location, floors, budget, and style — done in minutes.",
  },
  {
    title: "Match with verified pros",
    body: "Browse portfolios, compare ratings, and request low-cost concept briefs.",
  },
  {
    title: "Design & permits",
    body: "Approve designs online while your RAJUK permit is filed and tracked through ECPS.",
  },
  {
    title: "Build with protection",
    body: "Engineers sign off each milestone; escrow releases payments only when work is verified.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="border-y border-stone-200 bg-white py-24 transition-colors duration-500 sm:py-32 dark:border-white/10 dark:bg-white/3"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
            How it works
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
            Four steps from plot to keys
          </h2>
        </Reveal>

        <ol className="mt-14 grid gap-10 md:grid-cols-4 md:gap-6">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 130}>
              <li className="relative list-none">
                <div className="flex items-center gap-4 md:block">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-stone-900 text-lg font-extrabold text-amber-400 dark:bg-amber-400 dark:text-slate-950">
                    {i + 1}
                  </span>
                  {i < steps.length - 1 && (
                    <span className="absolute top-6 left-14 hidden h-px w-[calc(100%-4rem)] bg-stone-300 md:block dark:bg-white/15" />
                  )}
                </div>
                <h3 className="mt-0 text-base font-bold md:mt-5">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-slate-400">
                  {step.body}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- Stats ---------- */

const stats = [
  { to: 5, suffix: "", label: "user roles, one platform" },
  { to: 48, suffix: "h", label: "verification review target" },
  { to: 3, suffix: "", label: "design revision rounds included" },
  { to: 100, suffix: "%", label: "of payments escrow-protected" },
];

export function Stats() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="grid gap-10 text-center sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Reveal key={stat.label} delay={i * 100}>
            <p className="text-5xl font-extrabold tracking-tight text-amber-600 tabular-nums sm:text-6xl dark:text-amber-400">
              <CountUp to={stat.to} suffix={stat.suffix} />
            </p>
            <p className="mt-3 text-sm font-semibold text-stone-600 dark:text-slate-400">
              {stat.label}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------- Vision ---------- */

const roles = ["Land Owners", "Architects", "Structural Engineers", "Contractors", "Suppliers"];

export function Vision() {
  return (
    <section
      id="vision"
      className="mx-auto max-w-4xl scroll-mt-24 px-5 py-24 text-center sm:px-8 sm:py-32"
    >
      <Reveal>
        <p className="text-2xl leading-snug font-bold tracking-tight text-stone-800 sm:text-4xl dark:text-slate-100">
          “The single digital home for every construction project in Bangladesh — where every
          professional is <span className="text-amber-600 dark:text-amber-400">verified</span>,
          every payment is <span className="text-amber-600 dark:text-amber-400">protected</span>,
          and every permit is <span className="text-amber-600 dark:text-amber-400">tracked</span>.”
        </p>
      </Reveal>
      <Reveal delay={150}>
        <ul className="mt-10 flex flex-wrap justify-center gap-2.5">
          {roles.map((role) => (
            <li
              key={role}
              className="rounded-full border border-stone-300 px-4 py-1.5 text-sm font-semibold text-stone-700 transition hover:border-amber-500 hover:text-amber-600 dark:border-white/15 dark:text-slate-300 dark:hover:border-amber-400 dark:hover:text-amber-300"
            >
              {role}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

/* ---------- CTA ---------- */

export function CtaSection() {
  return (
    <section id="cta" className="px-5 pb-24 sm:px-8 sm:pb-32">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-stone-900 px-8 py-16 text-center shadow-2xl sm:px-16 sm:py-24 dark:bg-linear-to-br dark:from-indigo-950 dark:via-slate-900 dark:to-slate-950">
          {/* Breathing glow */}
          <div className="animate-glow pointer-events-none absolute -top-28 left-1/2 h-64 w-152 rounded-full bg-amber-400/25 blur-3xl" />

          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Ready to build?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-stone-300 dark:text-slate-400">
            Post your project brief and meet verified professionals — starting in Dhaka, under RAJUK
            jurisdiction.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/auth"
              className="rounded-full bg-amber-400 px-8 py-3.5 text-sm font-bold text-stone-950 shadow-xl transition hover:scale-[1.03] hover:bg-amber-300"
            >
              Start your project
            </Link>
            <Link
              href="/auth/professional"
              className="rounded-full border border-white/25 px-8 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
            >
              Join as a professional
            </Link>
          </div>
          <p className="mt-6 text-xs text-stone-500 dark:text-slate-500">
            Architects, engineers, contractors, and suppliers — get verified and start bidding.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

/* ---------- Footer ---------- */

export function Footer() {
  return (
    <footer className="border-t border-stone-200 py-12 transition-colors duration-500 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 text-center sm:flex-row sm:justify-between sm:px-8 sm:text-left">
        <div>
          <p className="text-lg font-extrabold tracking-tight">Buildora</p>
          <p className="mt-1 text-sm text-stone-500 dark:text-slate-500">
            The construction super-platform for Bangladesh. Dhaka first.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 sm:items-end">
          <HealthCheck />
          <p className="text-xs text-stone-400 dark:text-slate-600">
            © 2026 Buildora. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
