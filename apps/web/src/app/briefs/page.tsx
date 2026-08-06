"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRole, type Paginated, type Project } from "@buildora/shared";
import { listOpenBriefs } from "@/lib/apiProjects";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { Stagger } from "@/components/Stagger";
import { buildingTypeLabels, formatBdt, formatDate } from "@/components/app/projectStatus";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const cardClass =
  "block rounded-3xl border border-white/40 bg-white/40 p-5 shadow-xl shadow-black/5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-400/60 sm:p-6 dark:border-white/10 dark:bg-white/5";

const PROFESSIONAL_ROLES: UserRole[] = [
  UserRole.ARCHITECT,
  UserRole.STRUCTURAL_ENGINEER,
  UserRole.CONTRACTOR,
  UserRole.SUPPLIER,
];

/** Open client briefs, for professionals to browse and (architects) pitch on. */
export default function BriefsPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [result, setResult] = useState<Paginated<Project> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (!user || !token) {
      router.replace("/auth");
      return;
    }
    if (!PROFESSIONAL_ROLES.includes(user.role)) {
      router.replace("/projects");
      return;
    }
    setLoading(true);
    // Small debounce so we don't hit the API on every keystroke.
    const timer = setTimeout(async () => {
      try {
        setResult(await listOpenBriefs(token, { search, page }));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load the briefs");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mounted, user, token, router, search, page]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-4xl">
          <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
            Open briefs
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Projects looking for professionals
          </h1>

          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by title, area, or description…"
            className={`${inputClass} mt-6 max-w-md`}
          />

          <div className="mt-6">
            {loading ? (
              <p className="text-sm text-stone-500 dark:text-slate-500">Loading…</p>
            ) : error ? (
              <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                {error}
              </p>
            ) : !result || result.items.length === 0 ? (
              <p className="rounded-3xl border border-white/40 bg-white/40 p-8 text-center text-stone-600 backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                No open briefs right now — check back soon.
              </p>
            ) : (
              <>
                <Stagger as="ul" className="flex flex-col gap-4" dependencies={[result.items]}>
                  {result.items.map((p) => (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className={cardClass}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-lg font-bold">{p.title}</p>
                          <span className="shrink-0 text-xs text-stone-500 dark:text-slate-500">
                            {formatDate(p.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-stone-600 dark:text-slate-400">
                          {p.areaName} · {buildingTypeLabels[p.buildingType] ?? p.buildingType} ·{" "}
                          {p.floors} floors · {p.landAreaKatha} katha
                          {p.budgetMaxBdt ? ` · budget up to ${formatBdt(p.budgetMaxBdt)}` : ""}
                        </p>
                        <p className="mt-3 line-clamp-3 text-sm text-stone-700 dark:text-slate-300">
                          {p.description}
                        </p>
                        <span className="mt-4 inline-block text-sm font-bold text-amber-600 dark:text-amber-400">
                          View & propose →
                        </span>
                      </Link>
                    </li>
                  ))}
                </Stagger>

                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-center gap-3 text-sm">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-full border border-stone-300 px-4 py-1.5 font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-40 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                    >
                      ← Prev
                    </button>
                    <span className="text-stone-500 dark:text-slate-500">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-full border border-stone-300 px-4 py-1.5 font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-40 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
