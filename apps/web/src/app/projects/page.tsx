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
import { surfaceClass, surfaceHoverClass } from "@/components/ui/surface";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { Alert } from "@/components/ui/Alert";
import { ArrowRight, FolderKanban, Plus } from "lucide-react";

const cardClass = `block ${surfaceClass} ${surfaceHoverClass} p-5 sm:p-6`;

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
          <PageHeader
            eyebrow="Projects"
            title={isLandOwner ? "Your projects" : "Projects you're engaged on"}
            description={
              isLandOwner
                ? "Every build you have posted, from brief to handover."
                : "The briefs you have won and the builds you are working on."
            }
            actions={
              isLandOwner ? (
                <Link href="/projects/new" className="btn-primary px-6 py-2.5 text-sm">
                  <Plus className="h-4 w-4" />
                  New project
                </Link>
              ) : undefined
            }
          />

          <div className="mt-8">
            {loading ? (
              <ListSkeleton rows={3} />
            ) : error ? (
              <Alert>{error}</Alert>
            ) : projects.length === 0 ? (
              <EmptyState
                icon={<FolderKanban className="h-7 w-7" />}
                title={isLandOwner ? "No projects yet" : "Nothing on your desk yet"}
                description={
                  isLandOwner
                    ? "Post your first brief and let verified architects come to you."
                    : "Browse the open briefs and send a proposal to get started."
                }
                action={
                  <Link
                    href={isLandOwner ? "/projects/new" : "/briefs"}
                    className="btn-primary px-6 py-2.5 text-sm"
                  >
                    {isLandOwner ? "Post a brief" : "Browse open briefs"}
                    <ArrowRight className="btn-arrow h-4 w-4" />
                  </Link>
                }
              />
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
