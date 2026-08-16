"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRole } from "@buildora/shared";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { VerifyBanner } from "@/components/app/VerifyGate";
import { Stagger } from "@/components/Stagger";

const cardClass =
  "group relative overflow-hidden rounded-2xl border border-white/50 bg-white/55 p-6 shadow-xl shadow-black/5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-400/60 dark:border-white/10 dark:bg-white/5";

export default function DashboardPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);

  // Session hydrates from localStorage on the client — wait for mount before
  // trusting `user`, then bounce anyone who isn't signed in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted && !user) router.replace("/auth");
  }, [mounted, user, router]);

  if (!mounted || !user) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
          <p className="text-center text-sm text-stone-500 dark:text-slate-500">Loading…</p>
        </main>
      </div>
    );
  }

  const firstName = user.name.split(" ")[0];
  const isLandOwner = user.role === UserRole.LAND_OWNER;
  const isAdmin = user.role === UserRole.ADMIN;
  const isProfessional = !isLandOwner && !isAdmin;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-4xl">
          <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
            Your dashboard
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Welcome back, {firstName}.
          </h1>
          <p className="mt-3 max-w-xl text-stone-600 dark:text-slate-400">
            {isLandOwner
              ? "Start by finding a verified architect to design your building."
              : isAdmin
                ? "Review professionals' verification requests and keep the platform trustworthy."
                : "Manage your profile and the client requests coming your way."}
          </p>

          {/* Renders itself away once a supervisor approves the account. Admins
              have nothing to verify, so they never see it. */}
          {!isAdmin && (
            <div className="mt-8">
              <VerifyBanner role={user.role} />
            </div>
          )}

          <Stagger className="mt-10 grid gap-5 sm:grid-cols-2">
            {!isAdmin && (
              <Link href="/projects" className={cardClass}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400 text-stone-950">
                  {/* Building / project */}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5.5 w-5.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
                    <path d="M16 9h3a1 1 0 0 1 1 1v11" />
                    <path d="M2 21h20" />
                    <path d="M8 7h2M8 11h2M8 15h2" />
                  </svg>
                </span>
                <h2 className="mt-4 text-lg font-bold">
                  {isLandOwner ? "Your projects" : "Your engagements"}
                </h2>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                  {isLandOwner
                    ? "Post a brief, review proposals, and drive your build from concept to handover."
                    : "The projects you've been engaged on, contracts, submissions, and escrow."}
                </p>
                <span className="mt-4 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
                  Open projects →
                </span>
              </Link>
            )}

            {isProfessional && (
              <Link href="/briefs" className={cardClass}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400 text-stone-950">
                  {/* Document search */}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5.5 w-5.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
                    <path d="M14 3v6h6" />
                  </svg>
                </span>
                <h2 className="mt-4 text-lg font-bold">Open briefs</h2>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                  Browse client briefs and send proposals with your concept and design fees.
                </p>
                <span className="mt-4 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
                  Browse briefs →
                </span>
              </Link>
            )}

            {user.role === UserRole.CONTRACTOR && (
              <Link href="/tenders" className={cardClass}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400 text-stone-950">
                  {/* Gavel — bidding */}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5.5 w-5.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m14 13-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10" />
                    <path d="m16 16 6-6" />
                    <path d="m8 8 6-6" />
                    <path d="m9 7 8 8" />
                    <path d="m21 11-8-8" />
                  </svg>
                </span>
                <h2 className="mt-4 text-lg font-bold">Tenders</h2>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                  Price open Bills of Quantities and submit sealed bids. Nobody sees your rates
                  until bidding closes.
                </p>
                <span className="mt-4 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
                  Find work →
                </span>
              </Link>
            )}

            {isLandOwner && (
              <Link href="/architects" className={cardClass}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400 text-stone-950">
                  {/* Compass / find */}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5.5 w-5.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M15.5 8.5l-2 5-5 2 2-5 5-2Z" />
                  </svg>
                </span>
                <h2 className="mt-4 text-lg font-bold">Find an architect</h2>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                  Browse architects, see their work, and send a contact request.
                </p>
                <span className="mt-4 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
                  Browse architects →
                </span>
              </Link>
            )}

            <Link href="/messages" className={cardClass}>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-stone-900 text-white dark:bg-white/15">
                {/* Paper plane */}
                <svg
                  viewBox="0 0 24 24"
                  className="h-5.5 w-5.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 2 11 13" />
                  <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
                </svg>
              </span>
              <h2 className="mt-4 text-lg font-bold">Messages</h2>
              <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                Chat with the people on your projects, everything stays on the platform.
              </p>
              <span className="mt-4 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
                Open inbox →
              </span>
            </Link>

            <Link href="/permits" className={cardClass}>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-stone-900 text-white dark:bg-white/15">
                {/* Stamp / permit */}
                <svg
                  viewBox="0 0 24 24"
                  className="h-5.5 w-5.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 22h14" />
                  <path d="M5 18h14v4H5z" />
                  <path d="M14 13.5V18h-4v-4.5a5 5 0 1 1 4 0Z" />
                </svg>
              </span>
              <h2 className="mt-4 text-lg font-bold">Permit toolkit</h2>
              <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                DAP zone checker, RAJUK fee calculator, and the ECPS process guide.
              </p>
              <span className="mt-4 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
                Check the rules →
              </span>
            </Link>

            {isAdmin && (
              <Link href="/admin" className={cardClass}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400 text-stone-950">
                  {/* Console grid */}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5.5 w-5.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                </span>
                <h2 className="mt-4 text-lg font-bold">Admin console</h2>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                  Live analytics, user &amp; role management, and marketplace oversight.
                </p>
                <span className="mt-4 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
                  Open the console →
                </span>
              </Link>
            )}

            {isAdmin && (
              <Link href="/supervisor" className={cardClass}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400 text-stone-950">
                  {/* Shield-check / review */}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5.5 w-5.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4Z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </span>
                <h2 className="mt-4 text-lg font-bold">Verification requests</h2>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                  Review professionals&apos; credentials and award the verified badge.
                </p>
                <span className="mt-4 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
                  Open the queue →
                </span>
              </Link>
            )}

            {isAdmin && (
              <Link href="/admin/permits" className={cardClass}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400 text-stone-950">
                  {/* Database / records */}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5.5 w-5.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <ellipse cx="12" cy="5" rx="8" ry="3" />
                    <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
                    <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
                  </svg>
                </span>
                <h2 className="mt-4 text-lg font-bold">Permit reference data</h2>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                  Maintain DAP zones, RAJUK fee rates, and the ECPS process steps.
                </p>
                <span className="mt-4 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
                  Manage records →
                </span>
              </Link>
            )}

            {!isAdmin && (
              <Link href="/inquiries" className={cardClass}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-stone-900 text-white dark:bg-white/15">
                  {/* Chat */}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5.5 w-5.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
                  </svg>
                </span>
                <h2 className="mt-4 text-lg font-bold">
                  {isLandOwner ? "Your requests" : "Client requests"}
                </h2>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                  {isLandOwner
                    ? "Track the architects you've contacted and their replies."
                    : "See land owners who've reached out to you."}
                </p>
                <span className="mt-4 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
                  View requests →
                </span>
              </Link>
            )}

            {/* Only professionals have a profile: credentials and portfolio,
                leading to verification. */}
            {isProfessional && (
              <Link href="/profile/professional" className={cardClass}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-stone-900 text-white dark:bg-white/15">
                  {/* Person */}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5.5 w-5.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <h2 className="mt-4 text-lg font-bold">Complete your profile</h2>
                <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                  Add your credentials, education, and portfolio, then request verification.
                </p>
                <span className="mt-4 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
                  Edit profile →
                </span>
              </Link>
            )}

            {/* Account settings — same for every role. */}
            <Link href="/account" className={cardClass}>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-stone-900 text-white dark:bg-white/15">
                {/* Settings cog */}
                <svg
                  viewBox="0 0 24 24"
                  className="h-5.5 w-5.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
              </span>
              <h2 className="mt-4 text-lg font-bold">Account information</h2>
              <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                Personal details, contact numbers, billing information, and your password.
              </p>
              <span className="mt-4 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
                Manage account →
              </span>
            </Link>
          </Stagger>
        </div>
      </main>
    </div>
  );
}
