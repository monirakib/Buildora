"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BD_DISTRICTS,
  BD_DIVISIONS,
  EXPERTISE_AREAS,
  UserRole,
  type BdDivision,
  type PublicProfessional,
} from "@buildora/shared";
import { listProfessionals } from "@/lib/api";
import { Navbar } from "@/components/landing/Navbar";
import { Stagger } from "@/components/Stagger";
import { PendingBadge, VerifiedBadge } from "@/components/app/VerifiedBadge";
import { Stars } from "@/components/app/Stars";

const filterLabel =
  "mb-1.5 block text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400";
const filterControl =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-3 py-2 text-sm text-stone-900 backdrop-blur transition outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 [color-scheme:light] dark:[color-scheme:dark]";

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
      className="group flex flex-col rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-400/60 dark:border-white/10 dark:bg-white/5"
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

      <div className="mt-3">
        <Stars rating={a.ratingAvg} count={a.ratingCount} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <VerifiedBadge status={a.verificationStatus} />
        <PendingBadge status={a.verificationStatus} />
        {a.practiceDistrict && (
          <span className="rounded-full bg-stone-500/10 px-2.5 py-1 text-xs font-semibold text-stone-600 dark:bg-white/10 dark:text-slate-300">
            {a.practiceDistrict}
          </span>
        )}
        {typeof a.yearsExperience === "number" && (
          <span className="rounded-full bg-stone-500/10 px-2.5 py-1 text-xs font-semibold text-stone-600 dark:bg-white/10 dark:text-slate-300">
            {a.yearsExperience} yrs exp
          </span>
        )}
      </div>

      {a.expertise && a.expertise.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {a.expertise.slice(0, 3).map((e) => (
            <span
              key={e}
              className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300"
            >
              {e}
            </span>
          ))}
        </div>
      )}

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
  // Verified-only is the default; the toggle below widens the list to accounts
  // a supervisor hasn't approved. Those can be viewed but not engaged.
  const [includeUnverified, setIncludeUnverified] = useState(false);

  // ---- Filters ----
  const [expertise, setExpertise] = useState<string[]>([]);
  const [division, setDivision] = useState("");
  const [district, setDistrict] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState<"" | "rating" | "experience">("");

  const districts = division ? (BD_DISTRICTS[division as BdDivision] ?? []) : [];
  const filtersOn =
    expertise.length > 0 || division !== "" || minRating > 0 || sort !== "" || includeUnverified;

  function toggleExpertise(area: string) {
    setExpertise((current) =>
      current.includes(area) ? current.filter((a) => a !== area) : [...current, area]
    );
  }

  function clearFilters() {
    setExpertise([]);
    setDivision("");
    setDistrict("");
    setMinRating(0);
    setSort("");
    setIncludeUnverified(false);
  }

  // Debounce so typing in the search box doesn't fire a request per keystroke.
  // The filter controls share the delay — it's short enough not to feel laggy
  // and stops a burst of requests when several are changed in a row.
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listProfessionals({
          role: UserRole.ARCHITECT,
          search,
          includeUnverified,
          expertise,
          division,
          district,
          minRating: minRating || undefined,
          sort: sort || undefined,
        });
        setArchitects(res.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load architects");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search, includeUnverified, expertise, division, district, minRating, sort]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
            Find an architect
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {includeUnverified ? "All architects" : "Verified architects"}
          </h1>
          <p className="mt-3 max-w-xl text-stone-600 dark:text-slate-400">
            {includeUnverified
              ? "Including architects a supervisor hasn't approved yet. You can view their work, but you can't start a project with them until they're verified."
              : "Every architect here has had their IAB membership, degree and identity checked by a Buildora supervisor."}
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

          {/* ---- Filters ---- */}
          <div className="mt-6 rounded-2xl border border-white/50 bg-white/55 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
            {/* Specialisation — the wizard's own expertise chips, so ticking one
                matches exactly what architects selected on their profile. */}
            <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
              Specialisation
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {EXPERTISE_AREAS.map((area) => {
                const on = expertise.includes(area);
                return (
                  <button
                    key={area}
                    type="button"
                    onClick={() => toggleExpertise(area)}
                    aria-pressed={on}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                      on
                        ? "bg-amber-400 text-stone-950"
                        : "bg-stone-500/10 text-stone-600 hover:bg-stone-500/20 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20"
                    }`}
                  >
                    {area}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="division" className={filterLabel}>
                  Division
                </label>
                <select
                  id="division"
                  value={division}
                  // A district belongs to exactly one division, so changing the
                  // division has to clear whatever district was chosen.
                  onChange={(e) => {
                    setDivision(e.target.value);
                    setDistrict("");
                  }}
                  className={filterControl}
                >
                  <option value="">All divisions</option>
                  {BD_DIVISIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="district" className={filterLabel}>
                  District
                </label>
                <select
                  id="district"
                  value={district}
                  disabled={!division}
                  onChange={(e) => setDistrict(e.target.value)}
                  className={filterControl}
                >
                  <option value="">{division ? "All districts" : "Pick a division"}</option>
                  {districts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="minRating" className={filterLabel}>
                  Minimum rating
                </label>
                <select
                  id="minRating"
                  value={minRating}
                  onChange={(e) => setMinRating(Number(e.target.value))}
                  className={filterControl}
                >
                  <option value={0}>Any rating</option>
                  <option value={4}>4 stars & up</option>
                  <option value={3}>3 stars & up</option>
                  <option value={2}>2 stars & up</option>
                </select>
              </div>

              <div>
                <label htmlFor="sort" className={filterLabel}>
                  Sort by
                </label>
                <select
                  id="sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as "" | "rating" | "experience")}
                  className={filterControl}
                >
                  <option value="">Newest</option>
                  <option value="rating">Highest rated</option>
                  <option value="experience">Most experienced</option>
                </select>
              </div>
            </div>

            {minRating > 0 && (
              <p className="mt-3 text-xs text-stone-500 dark:text-slate-500">
                Architects nobody has reviewed yet are hidden while a minimum rating is set.
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4 dark:border-white/10">
              <button
                type="button"
                onClick={() => setIncludeUnverified((v) => !v)}
                aria-pressed={includeUnverified}
                className="rounded-full border border-stone-300/80 bg-white/70 px-5 py-2 text-sm font-bold text-stone-700 transition hover:border-amber-500 hover:text-amber-600 dark:border-white/15 dark:bg-white/5 dark:text-slate-300 dark:hover:text-amber-400"
              >
                {includeUnverified ? "Show verified only" : "Also show unverified architects"}
              </button>
              {filtersOn && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm font-bold text-stone-500 underline underline-offset-4 transition hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400"
                >
                  Clear filters
                </button>
              )}
              <span className="ml-auto text-sm text-stone-500 dark:text-slate-500">
                {loading ? "…" : `${architects.length} shown`}
              </span>
            </div>
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
                {search || filtersOn
                  ? "No architects match these filters. Try widening them."
                  : "No architects have joined yet — check back soon."}
              </p>
            ) : (
              /* Stagger *is* the grid — it animates its own children in
                 sequence. `dependencies` re-runs it whenever a new search
                 result set arrives. */
              <Stagger
                className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
                dependencies={[architects]}
              >
                {architects.map((a) => (
                  <ArchitectCard key={a.id} a={a} />
                ))}
              </Stagger>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
