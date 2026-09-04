"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BD_DISTRICTS,
  BD_DIVISIONS,
  UserRole,
  expertiseFor,
  type BdDivision,
  type PublicProfessional,
} from "@buildora/shared";
import { listProfessionals } from "@/lib/api";
import { Navbar } from "@/components/landing/Navbar";
import { Stagger } from "@/components/Stagger";
import { PageHeader } from "@/components/ui/PageHeader";
import { surfaceClass, surfaceHoverClass } from "@/components/ui/surface";
import { PendingBadge, VerifiedBadge } from "@/components/app/VerifiedBadge";
import { Stars } from "@/components/app/Stars";
import { ArrowRight } from "lucide-react";
import { imageAt } from "@/lib/imageUrl";
import { professionalCopy } from "./roleCopy";

const filterLabel =
  "mb-1.5 block text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400";
const filterControl =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

/** Initials avatar from a name, e.g. "Imran Khan" → "IK". */
function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function ProfessionalCard({ p, basePath }: { p: PublicProfessional; basePath: string }) {
  return (
    <Link
      href={`/${basePath}/${p.id}`}
      className={`group flex flex-col overflow-hidden ${surfaceClass} ${surfaceHoverClass}`}
    >
      {/* The portrait, 4:5, or an initials block in the same frame when the
          professional has not added a photo yet. */}
      <div className="zoom-media relative aspect-4/5 w-full overflow-hidden">
        {p.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */
          <img
            src={imageAt(p.avatarUrl, 640)}
            alt={p.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-linear-to-br from-amber-300/60 to-stone-300/60 dark:from-amber-400/25 dark:to-white/5">
            <span className="grid h-24 w-24 place-items-center rounded-3xl bg-amber-400 text-3xl font-extrabold text-stone-950">
              {initials(p.name)}
            </span>
          </div>
        )}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
          <VerifiedBadge status={p.verificationStatus} />
          <PendingBadge status={p.verificationStatus} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="truncate text-lg font-extrabold tracking-tight">{p.name}</p>
        {p.company && (
          <p className="truncate text-sm text-stone-600 dark:text-slate-400">{p.company}</p>
        )}
        {p.specialties && (
          <p className="mt-2 line-clamp-2 text-sm text-stone-600 dark:text-slate-400">
            {p.specialties}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-slate-400">
          <Stars rating={p.ratingAvg} count={p.ratingCount} />
          {p.practiceDistrict && <span>{p.practiceDistrict}</span>}
          {typeof p.yearsExperience === "number" && <span>{p.yearsExperience} yrs</span>}
        </div>

        {p.expertise && p.expertise.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.expertise.slice(0, 3).map((e) => (
              <span
                key={e}
                className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300"
              >
                {e}
              </span>
            ))}
          </div>
        )}

        <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-bold text-amber-700 dark:text-amber-400">
          View profile
          <ArrowRight className="btn-arrow h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

/**
 * The public directory for one of the three searchable professions. The
 * `/architects`, `/engineers` and `/contractors` pages are thin wrappers
 * around this — `role` picks the API filter, the expertise chip list, and the
 * copy from {@link professionalCopy}. Everything else (search, filters,
 * cards) is identical across the three.
 */
export function ProfessionalsDirectory({ role }: { role: UserRole }) {
  const copy = professionalCopy(role);
  const [items, setItems] = useState<PublicProfessional[]>([]);
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

  // Filters reset when the role changes (e.g. navigating /architects -> /engineers
  // without a full reload) so a stale chip from one profession's list can't leak
  // into another's query.
  useEffect(() => {
    setExpertise([]);
    setDivision("");
    setDistrict("");
    setMinRating(0);
    setSort("");
    setIncludeUnverified(false);
    setSearch("");
  }, [role]);

  // Debounce so typing in the search box doesn't fire a request per keystroke.
  // The filter controls share the delay — it's short enough not to feel laggy
  // and stops a burst of requests when several are changed in a row.
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listProfessionals({
          role,
          search,
          includeUnverified,
          expertise,
          division,
          district,
          minRating: minRating || undefined,
          sort: sort || undefined,
        });
        setItems(res.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Couldn't load ${copy.plural}`);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [
    role,
    search,
    includeUnverified,
    expertise,
    division,
    district,
    minRating,
    sort,
    copy.plural,
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <PageHeader
            eyebrow={copy.kicker}
            title={
              <span className="capitalize">
                {includeUnverified ? `All ${copy.plural}` : `Verified ${copy.plural}`}
              </span>
            }
            description={includeUnverified ? copy.unverifiedBody : copy.verifiedBody}
          />

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
          <div className={`mt-6 p-5 ${surfaceClass}`}>
            {/* Specialisation — the wizard's own expertise chips, so ticking one
                matches exactly what this profession selected on their profile. */}
            <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
              Specialisation
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {expertiseFor(role).map((area) => {
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
              <p className="mt-3 text-xs text-stone-500 dark:text-slate-500 capitalize">
                {copy.plural} nobody has reviewed yet are hidden while a minimum rating is set.
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4 dark:border-white/10">
              <button
                type="button"
                onClick={() => setIncludeUnverified((v) => !v)}
                aria-pressed={includeUnverified}
                className="rounded-full border border-stone-300/80 bg-white/70 px-5 py-2 text-sm font-bold text-stone-700 transition hover:border-amber-500 hover:text-amber-700 dark:border-white/15 dark:bg-white/5 dark:text-slate-300 dark:hover:text-amber-400"
              >
                {includeUnverified ? "Show verified only" : `Also show unverified ${copy.plural}`}
              </button>
              {filtersOn && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm font-bold text-stone-500 underline underline-offset-4 transition hover:text-amber-700 dark:text-slate-400 dark:hover:text-amber-400"
                >
                  Clear filters
                </button>
              )}
              <span className="ml-auto text-sm text-stone-500 dark:text-slate-500">
                {loading ? "…" : `${items.length} shown`}
              </span>
            </div>
          </div>

          {/* Results */}
          <div className="mt-8">
            {loading ? (
              <p className="text-sm text-stone-500 dark:text-slate-500">Loading {copy.plural}…</p>
            ) : error ? (
              <p className="alert alert-danger">{error}</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-stone-500 dark:text-slate-500">
                {search || filtersOn
                  ? `No ${copy.plural} match these filters. Try widening them.`
                  : `No ${copy.plural} have joined yet, check back soon.`}
              </p>
            ) : (
              /* Stagger *is* the grid — it animates its own children in
                 sequence. `dependencies` re-runs it whenever a new search
                 result set arrives. */
              <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" dependencies={[items]}>
                {items.map((p) => (
                  <ProfessionalCard key={p.id} p={p} basePath={copy.basePath} />
                ))}
              </Stagger>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
