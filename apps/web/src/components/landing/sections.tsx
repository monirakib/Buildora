import Link from "next/link";
import { CountUp } from "./CountUp";
import { Reveal } from "./Reveal";

export { HowItWorks } from "./HowItWorks";

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

/* ---------- Statement (editorial split with photo collage) ----------
   Photography: Unsplash / Pexels free license, stored in /public/landing. */

export function Statement() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        {/* The words */}
        <Reveal>
          <p className="text-sm font-bold tracking-[0.2em] text-amber-800 uppercase dark:text-amber-400">
            Why Buildora exists
          </p>
          <h2 className="mt-3 text-3xl leading-tight font-extrabold tracking-tight sm:text-5xl">
            We don&apos;t just connect you to builders.
            <br />
            <span className="text-amber-700 dark:text-amber-400">We protect the build.</span>
          </h2>
          <p className="mt-5 max-w-lg text-lg text-stone-600 dark:text-slate-400">
            Building a home in Bangladesh means navigating unverified contractors, cash handshakes,
            and permits that vanish into queues. Buildora replaces all three with one accountable
            platform.
          </p>
          <ul className="mt-8 flex flex-col gap-4">
            {[
              "Every professional is human-verified. NID, IAB/IEB, RAJUK",
              "Every taka sits in escrow until an engineer signs off",
              "Every permit step is tracked in the open, end to end",
            ].map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm font-semibold">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-400">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                {point}
              </li>
            ))}
          </ul>
        </Reveal>

        {/* The photo collage — a big frame with a smaller print overlapping it */}
        <Reveal delay={150}>
          <div className="relative pb-14 pl-0 sm:pr-10">
            {/* eslint-disable-next-line @next/next/no-img-element -- local asset */}
            <img
              src="/landing/site-crane.jpg"
              alt="Engineers reviewing a slab under construction"
              loading="lazy"
              className="aspect-4/3 w-full rounded-3xl object-cover shadow-2xl shadow-black/10"
            />
            {/* eslint-disable-next-line @next/next/no-img-element -- local asset */}
            <img
              src="/landing/blueprint-tools.jpg"
              alt="Floor plans with measuring tools"
              loading="lazy"
              className="absolute right-0 bottom-0 w-2/5 rounded-2xl border-4 border-stone-50 object-cover shadow-xl sm:right-2 dark:border-[#060a15]"
            />
            {/* Amber accent square, echoing the brand mark */}
            <span
              aria-hidden
              className="absolute -bottom-3 left-6 h-16 w-16 rounded-xl bg-amber-400/90 sm:left-10"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export { Showcase } from "./Showcase";

/* ---------- Features (bento grid) ---------- */

/** Shared shell for every bento tile — hover lifts it and warms the border. */
const tileClass =
  "group spotlight relative flex h-full flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white p-7 shadow-sm transition-[translate,border-color,box-shadow,background-color] duration-300 ease-out hover:-translate-y-1 hover:border-amber-400/60 hover:shadow-xl dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:hover:bg-white/10";

/** Icon chip in the tile's top-left corner. */
function TileIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-11 w-11 place-items-center rounded-xl bg-stone-900 text-amber-400 transition duration-300 group-hover:scale-110 group-hover:rotate-3 dark:bg-white/10 dark:text-amber-300">
      {children}
    </div>
  );
}

/** Little credential chip used in the verified tile. */
function CredChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-stone-200 px-3 py-1 text-xs font-bold text-stone-600 dark:border-white/15 dark:text-slate-300">
      {children}
    </span>
  );
}

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24 sm:px-8 sm:py-32">
      <Reveal>
        <p className="text-sm font-bold tracking-[0.2em] text-amber-800 uppercase dark:text-amber-400">
          The platform
        </p>
        <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
          Everything your build needs
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-stone-600 dark:text-slate-400">
          One trusted home for the entire journey, from an empty plot to the occupancy certificate.
        </p>
      </Reveal>

      {/* Bento layout: [verified verified escrow] / [permit design escrow→bidding] /
          [diary diary bidding] — spans only kick in at lg; below that it stacks. */}
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* --- Verified professionals (wide) --- */}
        <Reveal className="sm:col-span-2" delay={0}>
          <div className={tileClass}>
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-sm">
                <TileIcon>{icons.shield}</TileIcon>
                <h3 className="mt-5 text-lg font-bold">Verified professionals</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-slate-400">
                  Architects, engineers, and contractors screened through NID, IAB/IEB membership,
                  and RAJUK registration checks, reviewed by a human supervisor.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <CredChip>NID checked</CredChip>
                  <CredChip>IAB / IEB member</CredChip>
                  <CredChip>RAJUK enlisted</CredChip>
                </div>
              </div>

              {/* Mini visual: overlapping avatars + the verified badge */}
              <div className="flex flex-col items-center gap-3 self-center">
                <div className="flex -space-x-3">
                  {["NR", "AK", "SJ"].map((who, i) => (
                    <span
                      key={who}
                      className={`grid h-13 w-13 place-items-center rounded-full border-2 border-white text-xs font-extrabold transition duration-300 group-hover:-translate-y-1 dark:border-stone-800 ${
                        i === 2
                          ? "bg-amber-400 text-stone-950"
                          : "bg-stone-200 text-stone-600 dark:bg-white/15 dark:text-slate-200"
                      }`}
                      style={{ transitionDelay: `${i * 60}ms` }}
                    >
                      {who}
                    </span>
                  ))}
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Platform Verified
                </span>
              </div>
            </div>
          </div>
        </Reveal>

        {/* --- Escrow (milestone bars fill on hover) --- */}
        <Reveal delay={110}>
          <div className={tileClass}>
            <TileIcon>{icons.escrow}</TileIcon>
            <h3 className="mt-5 text-lg font-bold">Escrow-protected payments</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-slate-400">
              Funds release only at approved milestones, via bKash, Nagad, or bank.
            </p>
            <div className="mt-auto flex flex-col gap-3 pt-6">
              {[
                { label: "Design", w: "w-[30%]", d: "delay-0" },
                { label: "Structure", w: "w-[40%]", d: "delay-150" },
                { label: "Finishing", w: "w-[30%]", d: "delay-300" },
              ].map((m) => (
                <div key={m.label}>
                  <div className="flex justify-between text-xs font-bold text-stone-500 dark:text-slate-400">
                    <span>{m.label}</span>
                    <span className="opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                      released ✓
                    </span>
                  </div>
                  {/* Bar fills to 100% on hover, staggered — “tranches releasing” */}
                  <div className="mt-1 h-2 rounded-full bg-stone-200 dark:bg-white/10">
                    <div
                      className={`h-2 rounded-full bg-amber-500 transition-[width] duration-700 ease-out dark:bg-amber-400 ${m.w} ${m.d} group-hover:w-full`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* --- Permits (checklist ticks in on hover) --- */}
        <Reveal delay={0}>
          <div className={tileClass}>
            <TileIcon>{icons.permit}</TileIcon>
            <h3 className="mt-5 text-lg font-bold">RAJUK permits, guided</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-slate-400">
              Zone checks, fee calculators, and ECPS tracking from day one.
            </p>
            <ul className="mt-auto flex flex-col gap-2.5 pt-6">
              {["DAP zone checked", "Fees calculated", "ECPS submitted"].map((item, i) => (
                <li key={item} className="flex items-center gap-2.5 text-sm font-semibold">
                  <span className="grid h-5 w-5 place-items-center rounded-full border border-stone-300 transition-colors duration-300 group-hover:border-amber-500 group-hover:bg-amber-400/15 dark:border-white/20 dark:group-hover:border-amber-400">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3 scale-0 text-amber-700 transition-transform duration-300 group-hover:scale-100 dark:text-amber-400"
                      style={{ transitionDelay: `${i * 120}ms` }}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        {/* --- Design studio (blueprint that inks amber on hover) --- */}
        <Reveal delay={110}>
          <div className={tileClass}>
            <TileIcon>{icons.design}</TileIcon>
            <h3 className="mt-5 text-lg font-bold">Design studio</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-slate-400">
              Concept briefs, floor plans, and 3D previews, with revision rounds built in.
            </p>
            {/* Tiny floor plan; strokes warm to amber on hover */}
            <svg
              viewBox="0 0 120 64"
              className="mt-auto w-full pt-6 text-stone-300 transition-colors duration-500 group-hover:text-amber-500 dark:text-white/20 dark:group-hover:text-amber-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="6" y="4" width="108" height="56" rx="2" />
              <path d="M48 4v24M48 40v20M6 34h28M62 34h52M84 34v26" />
              {/* Door swing arc */}
              <path d="M48 28a12 12 0 0 1 12 12" strokeDasharray="3 3" />
            </svg>
          </div>
        </Reveal>

        {/* --- Bidding (bars race up on hover) --- */}
        <Reveal delay={220}>
          <div className={tileClass}>
            <TileIcon>{icons.bidding}</TileIcon>
            <h3 className="mt-5 text-lg font-bold">Transparent bidding</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-slate-400">
              Post your BOQ and compare contractor bids side by side.
            </p>
            <div className="mt-auto flex items-end gap-3 pt-6">
              {[
                { h: "h-10", hover: "group-hover:h-14", tone: "bg-stone-300 dark:bg-white/15" },
                { h: "h-16", hover: "group-hover:h-20", tone: "bg-stone-300 dark:bg-white/15" },
                {
                  h: "h-12",
                  hover: "group-hover:h-24",
                  tone: "bg-amber-500 dark:bg-amber-400",
                },
              ].map((bar, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className={`w-full rounded-t-lg transition-[height] duration-500 ease-out ${bar.h} ${bar.hover} ${bar.tone}`}
                    style={{ transitionDelay: `${i * 90}ms` }}
                  />
                  <span className="text-xs font-bold text-stone-500 dark:text-slate-400">
                    Bid {String.fromCharCode(65 + i)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* --- Site diary (wide, live log rows) --- */}
        <Reveal className="sm:col-span-2" delay={0}>
          <div className={tileClass}>
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-sm">
                <TileIcon>{icons.diary}</TileIcon>
                <h3 className="mt-5 text-lg font-bold">Live site diary</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-slate-400">
                  Daily work logs, photos, attendance, and weather from your site, visible from
                  anywhere, any time.
                </p>
              </div>
              {/* Mini visual: recent log entries */}
              <ul className="flex min-w-56 flex-1 flex-col gap-2.5 self-center sm:max-w-xs">
                {[
                  { day: "Day 42", note: "Slab casting, 14 workers" },
                  { day: "Day 41", note: "Rebar inspection passed" },
                  { day: "Day 40", note: "Materials delivered on site" },
                ].map((row, i) => (
                  <li
                    key={row.day}
                    className="flex items-center gap-3 rounded-xl border border-stone-200 px-3.5 py-2.5 transition duration-300 group-hover:translate-x-1 dark:border-white/10"
                    style={{ transitionDelay: `${i * 70}ms` }}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400" />
                    <span className="text-xs font-extrabold text-stone-500 dark:text-slate-400">
                      {row.day}
                    </span>
                    <span className="truncate text-xs font-semibold">{row.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Stats (editorial hairline band) ---------- */

const stats = [
  { to: 5, suffix: "", label: "user roles, one platform" },
  { to: 48, suffix: "h", label: "verification review target" },
  { to: 3, suffix: "", label: "design revision rounds included" },
  { to: 100, suffix: "%", label: "of payments escrow-protected" },
];

export function Stats() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="grid gap-x-8 gap-y-10 border-y border-stone-200 py-12 sm:grid-cols-2 lg:grid-cols-4 dark:border-white/10">
        {stats.map((stat, i) => (
          <Reveal key={stat.label} delay={i * 100}>
            <div
              className={
                i > 0 ? "lg:border-l lg:border-stone-200 lg:pl-8 dark:lg:border-white/10" : ""
              }
            >
              <p className="text-5xl font-extrabold tracking-tight text-amber-700 tabular-nums sm:text-6xl dark:text-amber-400">
                <CountUp to={stat.to} suffix={stat.suffix} />
              </p>
              <p className="mt-3 text-sm font-semibold text-stone-600 dark:text-slate-400">
                {stat.label}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------- Vision (full-bleed photo quote) ---------- */

const roles = ["Land Owners", "Architects", "Structural Engineers", "Contractors", "Suppliers"];

export function Vision() {
  return (
    <section id="vision" className="relative scroll-mt-24 overflow-hidden py-28 sm:py-36">
      {/* The architecture photograph behind the quote — day render in light
          mode, night render in dark, with a scrim so the text stays crisp. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- local asset */}
      <img
        src="/verify-bg-day.jpg"
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- local asset */}
      <img
        src="/verify-bg-night.jpg"
        alt=""
        loading="lazy"
        className="absolute inset-0 hidden h-full w-full object-cover dark:block"
      />
      <div className="absolute inset-0 bg-white/80 dark:bg-[#05070C]/75" />

      <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-8">
        <Reveal>
          <span
            aria-hidden
            className="block text-7xl leading-none font-extrabold text-amber-500/40 sm:text-8xl"
          >
            “
          </span>
          <p className="-mt-6 text-2xl leading-snug font-bold tracking-tight text-stone-800 sm:-mt-8 sm:text-4xl dark:text-slate-100">
            The single digital home for every construction project in Bangladesh, where every
            professional is <span className="text-amber-700 dark:text-amber-400">verified</span>,
            every payment is <span className="text-amber-700 dark:text-amber-400">protected</span>,
            and every permit is <span className="text-amber-700 dark:text-amber-400">tracked</span>.
          </p>
        </Reveal>
        <Reveal delay={150}>
          <ul className="mt-10 flex flex-wrap justify-center gap-2.5">
            {roles.map((role) => (
              <li
                key={role}
                className="rounded-full border border-stone-400/50 bg-white/50 px-4 py-1.5 text-sm font-semibold text-stone-700 backdrop-blur transition hover:border-amber-500 hover:text-amber-700 dark:border-white/20 dark:bg-white/5 dark:text-slate-300 dark:hover:border-amber-400 dark:hover:text-amber-300"
              >
                {role}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- CTA ---------- */

export function CtaSection() {
  return (
    <section id="cta" className="relative overflow-hidden">
      {/* Full-bleed jobsite photograph; the scrim runs left-to-right so the
          words sit on the dark side and the crew stays visible on the right. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- local asset */}
      <img
        src="/landing/crew-review.jpg"
        alt=""
        loading="lazy"
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-linear-to-r from-black/90 via-black/70 to-black/35" />

      <div className="relative mx-auto max-w-6xl px-5 py-28 sm:px-8 sm:py-40">
        <Reveal>
          <p className="text-sm font-bold tracking-[0.2em] text-amber-400 uppercase">Start today</p>
          <h2 className="mt-4 max-w-2xl text-4xl leading-[1.05] font-extrabold tracking-tight text-white sm:text-6xl">
            Let&apos;s build something that lasts.
          </h2>
          <p className="mt-5 max-w-xl text-lg text-white/70">
            Post your project brief and meet verified professionals, starting in Dhaka, under RAJUK
            jurisdiction.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link href="/auth" className="rounded-full btn-primary px-8 py-3.5 text-sm">
              Start your project
            </Link>
            <Link
              href="/auth?role=professional"
              className="rounded-full border border-white/30 px-8 py-3.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/10"
            >
              Join as a professional
            </Link>
          </div>

          {/* Quiet assurances under a hairline, instead of centered microcopy */}
          <div className="mt-16 flex flex-wrap gap-x-10 gap-y-3 border-t border-white/15 pt-6 text-xs font-bold tracking-wide text-white/50 uppercase">
            <span>Escrow-protected payments</span>
            <span>Human-verified professionals</span>
            <span>RAJUK permits guided</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */

const footerExplore = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Find architects", href: "/architects" },
  { label: "Permit tools", href: "/permits" },
];

const footerStart = [
  { label: "Start your project", href: "/auth" },
  { label: "Join as a professional", href: "/auth?role=professional" },
  { label: "Your dashboard", href: "/dashboard" },
];

export function Footer() {
  return (
    <footer className="overflow-hidden border-t border-stone-200 transition-colors duration-500 dark:border-white/10">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-[1.5fr_1fr_1fr] sm:px-8">
        <div>
          <p className="text-lg font-extrabold tracking-tight">Buildora</p>
          <p className="mt-2 max-w-xs text-sm text-stone-500 dark:text-slate-500">
            The construction super-platform for Bangladesh. Verified people, protected money,
            tracked permits. Dhaka first.
          </p>
        </div>

        <nav aria-label="Explore">
          <p className="text-xs font-bold tracking-[0.16em] text-stone-500 uppercase dark:text-slate-400">
            Explore
          </p>
          <ul className="mt-4 flex flex-col gap-2.5">
            {footerExplore.map((l) => (
              <li key={l.label}>
                <Link
                  href={l.href}
                  className="link-underline text-sm font-semibold text-stone-700 transition hover:text-amber-700 dark:text-slate-300 dark:hover:text-amber-400"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Get started">
          <p className="text-xs font-bold tracking-[0.16em] text-stone-500 uppercase dark:text-slate-400">
            Get started
          </p>
          <ul className="mt-4 flex flex-col gap-2.5">
            {footerStart.map((l) => (
              <li key={l.label}>
                <Link
                  href={l.href}
                  className="link-underline text-sm font-semibold text-stone-700 transition hover:text-amber-700 dark:text-slate-300 dark:hover:text-amber-400"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 border-t border-stone-200 px-5 py-6 sm:flex-row sm:justify-between sm:px-8 dark:border-white/10">
        <p className="text-xs text-stone-400 dark:text-slate-600">
          © 2026 Buildora. All rights reserved.
        </p>
        <p className="text-xs text-stone-400 dark:text-slate-600">Made in Dhaka 🇧🇩</p>
      </div>

      {/* Giant watermark wordmark, cropped by the footer edge */}
      <p
        aria-hidden
        className="pointer-events-none mb-[-0.28em] text-center text-[19vw] leading-none font-extrabold tracking-tighter text-stone-900/5 select-none sm:text-[15vw] dark:text-white/4"
      >
        BUILDORA
      </p>
    </footer>
  );
}
