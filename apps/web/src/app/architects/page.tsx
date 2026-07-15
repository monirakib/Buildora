"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRole, type PublicProfessional } from "@buildora/shared";
import { listProfessionals } from "@/lib/api";
import { Navbar } from "@/components/landing/Navbar";
import { PendingBadge, VerifiedBadge } from "@/components/app/VerifiedBadge";

/** Initials avatar from a name, e.g. "Imran Khan" → "IK". */
function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function ArchitectCard({ a }: { a: PublicProfessional }) {
  return (
    <Link
      href={`/architects/${a.id}`}
      className="group flex flex-col rounded-3xl border border-white/40 bg-white/40 p-5 shadow-xl shadow-black/5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-400/60 dark:border-white/10 dark:bg-white/5"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-400 text-lg font-extrabold text-stone-950">
          {initials(a.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold">{a.name}</p>
          {a.company && (
            <p className="truncate text-sm text-stone-600 dark:text-slate-400">{a.company}</p>
          )}
        </div>
      </div>

      {a.specialties && (
        <p className="mt-4 line-clamp-2 text-sm text-stone-600 dark:text-slate-400">
          {a.specialties}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <VerifiedBadge status={a.verificationStatus} />
        <PendingBadge status={a.verificationStatus} />
        {typeof a.yearsExperience === "number" && (
          <span className="rounded-full bg-stone-500/10 px-2.5 py-1 text-xs font-semibold text-stone-600 dark:bg-white/10 dark:text-slate-300">
            {a.yearsExperience} yrs exp
          </span>
        )}
      </div>

      <span className="mt-5 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
        View profile →
      </span>
    </Link>
  );
}

export default function ArchitectsPage() {
  const [architects, setArchitects] = useState<PublicProfessional[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce the search box so we don't fire a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listProfessionals({ role: UserRole.ARCHITECT, search });
        setArchitects(res.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load architects");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
            Find an architect
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Verified architects
          </h1>
          <p className="mt-3 max-w-xl text-stone-600 dark:text-slate-400">
            Browse architects on Buildora, then send a contact request to start your project.
          </p>

          {/* Search */}
          <div className="relative mt-8 max-w-md">
            <span className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-stone-400">
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, firm, or specialty…"
              className="block w-full rounded-full border border-stone-300/80 bg-white/70 py-2.5 pr-4 pl-11 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500"
            />
          </div>

          {/* Results */}
          <div className="mt-8">
            {loading ? (
              <p className="text-sm text-stone-500 dark:text-slate-500">Loading architects…</p>
            ) : error ? (
              <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                {error}
              </p>
            ) : architects.length === 0 ? (
              <p className="text-sm text-stone-500 dark:text-slate-500">
                {search
                  ? "No architects match your search."
                  : "No architects have joined yet — check back soon."}
              </p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {architects.map((a) => (
                  <ArchitectCard key={a.id} a={a} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
