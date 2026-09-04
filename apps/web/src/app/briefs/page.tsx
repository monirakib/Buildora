"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRole, type Paginated, type Project } from "@buildora/shared";
import { listOpenBriefs } from "@/lib/apiProjects";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { Stagger } from "@/components/Stagger";
import { ArrowRight } from "lucide-react";
import { imageAt } from "@/lib/imageUrl";
import { buildingTypeLabels, formatBdt, formatDate } from "@/components/app/projectStatus";
import { useRegisterAiContext } from "@/lib/useRegisterAiContext";
import { surfaceClass, surfaceHoverClass } from "@/components/ui/surface";
import { ListSkeleton } from "@/components/ui/Skeleton";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const cardClass = `group block overflow-hidden ${surfaceClass} ${surfaceHoverClass} p-5 sm:p-6`;

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

  useRegisterAiContext({ page: "briefs", label: "Open briefs" });

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
          <p className="animate-rise-in text-[0.7rem] font-bold tracking-[0.22em] text-stone-500 uppercase dark:text-slate-400">
            Open briefs
          </p>
          <h1 className="display-title animate-rise-in [animation-delay:70ms] mt-2 text-4xl sm:text-5xl">
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
              <ListSkeleton rows={3} />
            ) : error ? (
              <p className="alert alert-danger">{error}</p>
            ) : !result || result.items.length === 0 ? (
              <p className="rounded-2xl border border-white/50 bg-white/55 p-8 text-center text-stone-600 backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                No open briefs right now, check back soon.
              </p>
            ) : (
              <>
                <Stagger
                  as="ul"
                  className="grid gap-5 sm:grid-cols-2"
                  dependencies={[result.items]}
                >
                  {result.items.map((p) => (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className={cardClass}>
                        {/* The owner's cover photograph, or a warm placeholder. */}
                        <div className="zoom-media relative -mx-5 -mt-5 mb-5 aspect-[21/9] overflow-hidden rounded-t-3xl sm:-mx-6 sm:-mt-6">
                          {p.coverImageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */
                            <img
                              src={imageAt(p.coverImageUrl, 1200)}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-full w-full place-items-center bg-linear-to-br from-amber-300/50 via-stone-200/60 to-sky-200/50 dark:from-amber-400/20 dark:via-white/5 dark:to-sky-400/10">
                              <span className="display-title text-5xl text-stone-900/20 dark:text-white/15">
                                {p.title.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
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
                        <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-amber-700 dark:text-amber-400">
                          View & propose
                          <ArrowRight className="btn-arrow h-4 w-4" />
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
                      className="btn-secondary px-4 py-1.5 disabled:opacity-40"
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
                      className="btn-secondary px-4 py-1.5 disabled:opacity-40"
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
