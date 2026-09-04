"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ClipboardList,
  FileText,
  Gavel,
  HardHat,
  Inbox,
  Info,
  Megaphone,
  MessageSquare,
  PhoneMissed,
  ShieldCheck,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { NotificationType, UserRole, type DashboardSummary } from "@buildora/shared";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { VerifyBanner } from "@/components/app/VerifyGate";
import { Stagger } from "@/components/Stagger";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { surfaceClass } from "@/components/ui/surface";
import {
  formatDate,
  projectStatusLabels,
  projectStatusStyles,
} from "@/components/app/projectStatus";
import { timeAgo } from "@/components/admin/format";
import { fetchDashboardSummary } from "@/lib/apiDashboard";
import { imageAt } from "@/lib/imageUrl";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

/** "Good morning" / "afternoon" / "evening", from the visitor's own clock. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** "৳12,40,000" for money, "3" for counts. */
function statValue(value: number, unit?: "count" | "bdt") {
  return unit === "bdt" ? (
    <>
      <span className="text-[0.55em] font-semibold text-stone-500 dark:text-slate-400">৳</span>
      <AnimatedNumber value={value} />
    </>
  ) : (
    <AnimatedNumber value={value} />
  );
}

const activityIcon: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  [NotificationType.MESSAGE]: MessageSquare,
  [NotificationType.INQUIRY]: Inbox,
  [NotificationType.PROPOSAL]: FileText,
  [NotificationType.CONTRACT]: FileText,
  [NotificationType.MEETING]: CalendarClock,
  [NotificationType.TENDER]: Gavel,
  [NotificationType.BID]: Gavel,
  [NotificationType.MILESTONE]: HardHat,
  [NotificationType.SITE_DIARY]: ClipboardList,
  [NotificationType.PAYMENT]: Wallet,
  [NotificationType.ORDER]: ShoppingCart,
  [NotificationType.VERIFICATION]: ShieldCheck,
  [NotificationType.CALL]: PhoneMissed,
  [NotificationType.PROMOTION]: Megaphone,
  [NotificationType.SYSTEM]: Info,
};

/** The quiet links at the foot of the page, per role. */
function shortcutsFor(role: UserRole): { href: string; label: string }[] {
  const common = [
    { href: "/messages", label: "Messages" },
    { href: "/permits", label: "Permit tools" },
    { href: "/marketplace", label: "Marketplace" },
    { href: "/account", label: "Account" },
  ];
  switch (role) {
    case UserRole.LAND_OWNER:
      return [
        { href: "/projects/new", label: "Post a brief" },
        { href: "/architects", label: "Find an architect" },
        { href: "/engineers", label: "Find an engineer" },
        { href: "/contractors", label: "Find a contractor" },
        { href: "/meetings", label: "Meetings" },
        ...common,
      ];
    case UserRole.ADMIN:
      return [
        { href: "/admin", label: "Admin console" },
        { href: "/supervisor", label: "Verification queue" },
        { href: "/admin/permits", label: "Permit data" },
        { href: "/admin/pricing", label: "Price sheet" },
        ...common,
      ];
    case UserRole.CONTRACTOR:
      return [
        { href: "/tenders", label: "Tenders" },
        { href: "/briefs", label: "Open briefs" },
        { href: "/marketplace/sell", label: "My listings" },
        { href: "/profile/professional", label: "Profile" },
        ...common,
      ];
    case UserRole.STRUCTURAL_ENGINEER:
      return [
        { href: "/engineer", label: "Inspections & drawings" },
        { href: "/briefs", label: "Open briefs" },
        { href: "/profile/professional", label: "Profile" },
        ...common,
      ];
    case UserRole.SUPPLIER:
      return [
        { href: "/marketplace/sell", label: "My listings" },
        { href: "/marketplace/orders", label: "Incoming orders" },
        { href: "/profile/professional", label: "Profile" },
        ...common,
      ];
    default:
      return [
        { href: "/briefs", label: "Open briefs" },
        { href: "/inquiries", label: "Client requests" },
        { href: "/meetings", label: "Meetings" },
        { href: "/profile/professional", label: "Profile" },
        ...common,
      ];
  }
}

const sectionLabel =
  "text-[0.7rem] font-bold tracking-[0.22em] text-stone-500 uppercase dark:text-slate-400";

/** Hairline-separated list row, the page's one repeating shape. */
const rowClass =
  "group flex items-center gap-4 border-b border-black/8 py-4 transition-colors duration-200 hover:border-amber-400/70 dark:border-white/10";

/** What stands in for the page while the summary is on its way. */
function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your dashboard">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-5 h-12 w-2/3 max-w-lg" />
      <Skeleton className="mt-4 h-4 w-1/2 max-w-md" />
      <div className="mt-12 grid gap-8 border-y border-black/8 py-8 sm:grid-cols-2 lg:grid-cols-4 dark:border-white/10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-10 w-20" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div>
          <Skeleton className="h-3 w-20" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="mt-4 h-14 w-full" />
          ))}
        </div>
        <div>
          <Skeleton className="h-3 w-20" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="mt-4 h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The dashboard: one screen that answers "where do things stand" for whoever
 * is signed in.
 *
 * Editorial rather than tiled. Figures sit on a ruled band under the masthead,
 * lists are hairline-separated rows, and the only colour is the amber on
 * whatever needs the user. Every number comes from the summary endpoint,
 * which counts the real collections; nothing here is a placeholder.
 */
export default function DashboardPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Session hydrates from localStorage on the client — wait for mount before
  // trusting `user`, then bounce anyone who isn't signed in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted && !user) router.replace("/auth");
  }, [mounted, user, router]);

  useEffect(() => {
    if (!token) return;
    fetchDashboardSummary(token)
      .then(setSummary)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Couldn't load your dashboard")
      );
  }, [token]);

  // The masthead rises line by line once the summary is in.
  const headRef = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const el = headRef.current;
      if (!el || !summary || prefersReducedMotion()) return;
      gsap.fromTo(
        el.querySelectorAll("[data-line]"),
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.7, stagger: 0.09, ease: "power3.out", clearProps: "all" }
      );
    },
    { scope: headRef, dependencies: [summary] }
  );

  if (!mounted || !user) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
          <div className="mx-auto w-full max-w-5xl">
            <DashboardSkeleton />
          </div>
        </main>
      </div>
    );
  }

  const isAdmin = user.role === UserRole.ADMIN;
  const isLandOwner = user.role === UserRole.LAND_OWNER;
  const needsYou = summary?.attention.filter((a) => a.count > 0) ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-20 sm:px-8">
        <div className="mx-auto w-full max-w-5xl">
          {error && <Alert className="mb-8">{error}</Alert>}

          {!summary ? (
            <DashboardSkeleton />
          ) : (
            <>
              {/* ---------- Masthead ---------- */}
              <div ref={headRef}>
                <p data-line className={sectionLabel}>
                  Your dashboard
                </p>
                <h1
                  data-line
                  className="display-title mt-4 text-4xl text-stone-900 sm:text-6xl dark:text-white"
                >
                  {greeting()}, {summary.firstName}.
                </h1>
                <p
                  data-line
                  className="mt-4 max-w-xl text-lg leading-relaxed text-stone-600 dark:text-slate-400"
                >
                  {summary.headline}
                </p>
              </div>

              {!isAdmin && (
                <div className="mt-8">
                  <VerifyBanner role={user.role} />
                </div>
              )}

              {/* ---------- Figures ---------- */}
              <Stagger
                className="mt-12 grid gap-x-8 gap-y-8 border-y border-black/8 py-8 sm:grid-cols-2 lg:grid-cols-4 dark:border-white/10"
                dependencies={[summary]}
              >
                {summary.stats.map((s) => {
                  const inner = (
                    <>
                      <p className={sectionLabel}>{s.label}</p>
                      <p className="display-title mt-2 text-4xl text-stone-900 sm:text-5xl dark:text-white">
                        {statValue(s.value, s.unit)}
                      </p>
                      {s.hint && (
                        <p className="mt-1.5 text-sm text-stone-500 dark:text-slate-400">
                          {s.hint}
                        </p>
                      )}
                    </>
                  );
                  return s.href ? (
                    <Link key={s.key} href={s.href} className="group block">
                      {inner}
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-amber-700 opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:text-amber-400">
                        Open <ArrowUpRight className="h-3.5 w-3.5" />
                      </span>
                    </Link>
                  ) : (
                    <div key={s.key}>{inner}</div>
                  );
                })}
              </Stagger>

              <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-16">
                {/* ---------- Left: what needs you, then the projects ---------- */}
                <div className="flex flex-col gap-12">
                  {needsYou.length > 0 && (
                    <section>
                      <p className={sectionLabel}>Needs you</p>
                      <Stagger as="ul" className="mt-3 flex flex-col" dependencies={[summary]}>
                        {needsYou.map((a) => (
                          <li key={a.key}>
                            <Link href={a.href} className={rowClass}>
                              <span className="display-title w-12 shrink-0 text-3xl text-amber-700 dark:text-amber-400">
                                {a.count}
                              </span>
                              <span className="flex-1 text-base font-semibold">{a.label}</span>
                              <ArrowRight className="btn-arrow h-4 w-4 text-stone-400 group-hover:text-amber-700 dark:group-hover:text-amber-400" />
                            </Link>
                          </li>
                        ))}
                      </Stagger>
                    </section>
                  )}

                  <section>
                    <div className="flex items-baseline justify-between">
                      <p className={sectionLabel}>{isAdmin ? "Latest projects" : "Projects"}</p>
                      <Link
                        href="/projects"
                        className="link-underline text-xs font-bold text-stone-500 hover:text-amber-700 dark:text-slate-400 dark:hover:text-amber-400"
                      >
                        {isAdmin ? "All projects" : "See all"}
                      </Link>
                    </div>
                    {summary.projects.length === 0 ? (
                      <div className={`${surfaceClass} mt-4 p-6 sm:p-8`}>
                        <p className="display-title text-2xl sm:text-3xl">
                          {isLandOwner ? "No projects yet." : "Nothing on your desk yet."}
                        </p>
                        <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-600 dark:text-slate-400">
                          {isLandOwner
                            ? "Post a brief and verified architects will send proposals with their fees and timelines."
                            : "Browse the open briefs and send a proposal to get started."}
                        </p>
                        <Link
                          href={isLandOwner ? "/projects/new" : "/briefs"}
                          className="btn-primary mt-5 px-6 py-2.5 text-sm"
                        >
                          {isLandOwner ? "Post a brief" : "Open briefs"}
                          <ArrowRight className="btn-arrow h-4 w-4" />
                        </Link>
                      </div>
                    ) : (
                      <Stagger as="ul" className="mt-3 flex flex-col" dependencies={[summary]}>
                        {summary.projects.map((p) => (
                          <li key={p.id}>
                            <Link href={`/projects/${p.id}`} className={rowClass}>
                              <span className="h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-linear-to-br from-amber-300/50 to-stone-200/60 dark:from-amber-400/20 dark:to-white/5">
                                {p.coverImageUrl && (
                                  /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */
                                  <img
                                    src={imageAt(p.coverImageUrl, 320)}
                                    alt=""
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                  />
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-lg font-semibold">{p.title}</p>
                                <p className="mt-0.5 text-sm text-stone-500 dark:text-slate-400">
                                  {p.areaName} · updated {formatDate(p.updatedAt)}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${projectStatusStyles[p.status]}`}
                              >
                                {projectStatusLabels[p.status]}
                              </span>
                              <ArrowRight className="btn-arrow h-4 w-4 shrink-0 text-stone-400 group-hover:text-amber-700 dark:group-hover:text-amber-400" />
                            </Link>
                          </li>
                        ))}
                      </Stagger>
                    )}
                  </section>
                </div>

                {/* ---------- Right: coming up, then the activity feed ---------- */}
                <div className="flex flex-col gap-12">
                  {summary.upcoming.length > 0 && (
                    <section>
                      <p className={sectionLabel}>Coming up</p>
                      <Stagger as="ul" className="mt-3 flex flex-col" dependencies={[summary]}>
                        {summary.upcoming.map((u) => {
                          const d = new Date(u.at);
                          return (
                            <li key={u.id}>
                              <Link href={u.href} className={`${rowClass} py-3.5`}>
                                <span className="w-12 shrink-0 text-center">
                                  <span className="display-title block text-2xl leading-none">
                                    {d.getDate()}
                                  </span>
                                  <span className="mt-1 block text-[0.65rem] font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                                    {d.toLocaleDateString(undefined, { month: "short" })}
                                  </span>
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold">
                                    {u.title}
                                  </span>
                                  <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                                    {u.detail} ·{" "}
                                    {d.toLocaleTimeString(undefined, {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </Stagger>
                    </section>
                  )}

                  <section>
                    <p className={sectionLabel}>Activity</p>
                    {summary.activity.length === 0 ? (
                      <p className="mt-3 text-sm text-stone-500 dark:text-slate-400">
                        Nothing has happened yet. It will show up here as it does.
                      </p>
                    ) : (
                      <Stagger as="ul" className="mt-3 flex flex-col" dependencies={[summary]}>
                        {summary.activity.map((n) => {
                          const Icon = activityIcon[n.type] ?? Info;
                          const inner = (
                            <>
                              <span
                                className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                                  n.readAt
                                    ? "bg-stone-900/5 text-stone-500 dark:bg-white/5 dark:text-slate-400"
                                    : "bg-amber-400/20 text-amber-700 dark:text-amber-300"
                                }`}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span
                                  className={`block truncate text-sm ${n.readAt ? "font-medium" : "font-bold"}`}
                                >
                                  {n.title}
                                </span>
                                <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                                  {n.body}
                                </span>
                                <span className="mt-0.5 block text-[0.68rem] text-stone-400 dark:text-slate-500">
                                  {timeAgo(n.createdAt)}
                                </span>
                              </span>
                            </>
                          );
                          const cls = `${rowClass} items-start py-3`;
                          return (
                            <li key={n.id}>
                              {n.link ? (
                                <Link href={n.link} className={cls}>
                                  {inner}
                                </Link>
                              ) : (
                                <div className={cls}>{inner}</div>
                              )}
                            </li>
                          );
                        })}
                      </Stagger>
                    )}
                  </section>
                </div>
              </div>

              {/* ---------- Shortcuts ---------- */}
              <nav
                aria-label="Shortcuts"
                className="mt-16 border-t border-black/8 pt-6 dark:border-white/10"
              >
                <p className={sectionLabel}>Go to</p>
                <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                  {shortcutsFor(user.role).map((s) => (
                    <li key={s.href}>
                      <Link
                        href={s.href}
                        className="link-underline text-sm font-semibold text-stone-700 hover:text-amber-700 dark:text-slate-300 dark:hover:text-amber-400"
                      >
                        {s.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
