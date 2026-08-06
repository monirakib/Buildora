"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRole, type Project } from "@buildora/shared";
import { listMyProjects } from "@/lib/apiProjects";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { Stagger } from "@/components/Stagger";
import {
  buildingTypeLabels,
  formatDate,
  projectStatusLabels,
  projectStatusStyles,
} from "@/components/app/projectStatus";

const cardClass =
  "block rounded-3xl border border-white/40 bg-white/40 p-5 shadow-xl shadow-black/5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-400/60 sm:p-6 dark:border-white/10 dark:bg-white/5";

export default function ProjectsPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [projects, setProjects] = useState<Project[]>([]);
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
    (async () => {
      try {
        setProjects(await listMyProjects(token));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load your projects");
      } finally {
        setLoading(false);
      }
    })();
  }, [mounted, user, token, router]);

  const isLandOwner = user?.role === UserRole.LAND_OWNER;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-4xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
                Projects
              </p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {isLandOwner ? "Your projects" : "Projects you're engaged on"}
              </h1>
            </div>
            {isLandOwner && (
              <Link
                href="/projects/new"
                className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300"
              >
                + New project
              </Link>
            )}
          </div>

          <div className="mt-8">
            {loading ? (
              <p className="text-sm text-stone-500 dark:text-slate-500">Loading…</p>
            ) : error ? (
              <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                {error}
              </p>
            ) : projects.length === 0 ? (
              <div className="rounded-3xl border border-white/40 bg-white/40 p-8 text-center backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                <p className="text-stone-600 dark:text-slate-400">
                  {isLandOwner
                    ? "No projects yet — post your first brief and let architects come to you."
                    : "You're not engaged on any projects yet. Browse the open briefs to pitch."}
                </p>
                <Link
                  href={isLandOwner ? "/projects/new" : "/briefs"}
                  className="mt-5 inline-block rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300"
                >
                  {isLandOwner ? "Post a brief" : "Browse open briefs"}
                </Link>
              </div>
            ) : (
              <Stagger as="ul" className="flex flex-col gap-4" dependencies={[projects]}>
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className={cardClass}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-lg font-bold">{p.title}</p>
                          <p className="mt-0.5 text-sm text-stone-600 dark:text-slate-400">
                            {p.areaName} · {buildingTypeLabels[p.buildingType] ?? p.buildingType} ·{" "}
                            {p.floors} floors · {p.landAreaKatha} katha
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${projectStatusStyles[p.status]}`}
                        >
                          {projectStatusLabels[p.status]}
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-stone-700 dark:text-slate-300">
                        {p.description}
                      </p>
                      <p className="mt-3 text-xs text-stone-500 dark:text-slate-500">
                        {isLandOwner && p.pendingProposals != null && p.pendingProposals > 0 && (
                          <span className="mr-2 rounded-full bg-amber-400/90 px-2 py-0.5 font-bold text-stone-950">
                            {p.pendingProposals} proposal{p.pendingProposals > 1 ? "s" : ""} waiting
                          </span>
                        )}
                        {!isLandOwner && <>Client: {p.owner.name} · </>}
                        Created {formatDate(p.createdAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </Stagger>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
