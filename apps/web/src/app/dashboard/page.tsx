"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRole } from "@buildora/shared";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";

const cardClass =
  "group relative overflow-hidden rounded-3xl border border-white/40 bg-white/40 p-6 shadow-xl shadow-black/5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-400/60 dark:border-white/10 dark:bg-white/5";

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

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
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

            {/* Professionals get the richer editor with credentials + portfolio. */}
            <Link href={isProfessional ? "/profile/professional" : "/profile"} className={cardClass}>
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
                {isProfessional
                  ? "Add your credentials, education, and portfolio — then request verification."
                  : "Add your details so professionals understand your project."}
              </p>
              <span className="mt-4 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
                Edit profile →
              </span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
