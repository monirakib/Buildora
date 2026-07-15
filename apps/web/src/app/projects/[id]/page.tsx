"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProjectStatus, UserRole, type Contract, type Project } from "@buildora/shared";
import {
  deleteProject,
  getProject,
  getProjectContract,
  postBrief,
  updateProjectStatus,
} from "@/lib/apiProjects";
import { openConversation } from "@/lib/apiMessages";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { ProposalsSection } from "@/components/project/ProposalsSection";
import { ContractSection } from "@/components/project/ContractSection";
import { EcpsSection } from "@/components/project/EcpsSection";
import { DocumentsSection } from "@/components/project/DocumentsSection";
import {
  buildingTypeLabels,
  formatBdt,
  projectStatusLabels,
  projectStatusOrder,
  projectStatusStyles,
} from "@/components/app/projectStatus";

const cardClass =
  "rounded-3xl border border-white/40 bg-white/40 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

/** The owner's one-click stage moves, mirroring the API's allowed transitions. */
const nextStatusActions: Partial<Record<ProjectStatus, { to: ProjectStatus; label: string }>> = {
  [ProjectStatus.PERMIT_STAGE]: {
    to: ProjectStatus.UNDER_CONSTRUCTION,
    label: "Start construction",
  },
  [ProjectStatus.UNDER_CONSTRUCTION]: {
    to: ProjectStatus.COMPLETED,
    label: "Mark completed",
  },
  [ProjectStatus.COMPLETED]: { to: ProjectStatus.ARCHIVED, label: "Archive project" },
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [project, setProject] = useState<Project | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const p = await getProject(token, params.id);
      setProject(p);
      // The contract only exists once a proposal was accepted; 404s are fine.
      setContract(await getProjectContract(token, params.id).catch(() => null));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the project");
    } finally {
      setLoading(false);
    }
  }, [token, params.id]);

  useEffect(() => {
    if (!mounted) return;
    if (!user || !token) {
      router.replace("/auth");
      return;
    }
    load();
  }, [mounted, user, token, router, load]);

  const isOwner = !!user && !!project && user.id === project.owner.id;
  const isAssignedArchitect = !!user && !!project && user.id === project.architect?.id;

  async function handlePostDraft() {
    if (!token || !project) return;
    setBusy(true);
    try {
      setProject(await postBrief(token, project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post the brief");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdvanceStatus(to: ProjectStatus) {
    if (!token || !project) return;
    setBusy(true);
    try {
      setProject(await updateProjectStatus(token, project.id, to));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the status");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!token || !project) return;
    if (!window.confirm("Delete this project and its proposals? This can't be undone.")) return;
    setBusy(true);
    try {
      await deleteProject(token, project.id);
      router.push("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the project");
      setBusy(false);
    }
  }

  /** Opens (or reuses) the thread with the other party and jumps to it. */
  async function handleMessage(otherId: string) {
    if (!token) return;
    setBusy(true);
    try {
      const conversation = await openConversation(token, otherId);
      router.push(`/messages?c=${conversation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open the conversation");
      setBusy(false);
    }
  }

  if (!mounted || loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
          <p className="text-center text-sm text-stone-500 dark:text-slate-500">Loading…</p>
        </main>
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
          <p className="mx-auto max-w-xl rounded-xl bg-rose-100 px-4 py-2.5 text-center text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        </main>
      </div>
    );
  }

  if (!project || !user || !token) return null;

  const statusIndex = projectStatusOrder.indexOf(project.status);
  const nextAction = isOwner ? nextStatusActions[project.status] : undefined;
  const messagingTarget = isOwner ? project.architect : isAssignedArchitect ? project.owner : null;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
          {/* Header ------------------------------------------------------ */}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${projectStatusStyles[project.status]}`}
              >
                {projectStatusLabels[project.status]}
              </span>
              <p className="text-sm text-stone-500 dark:text-slate-500">
                {project.areaName} ·{" "}
                {buildingTypeLabels[project.buildingType] ?? project.buildingType}
              </p>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              {project.title}
            </h1>

            {/* Journey timeline (archived projects skip it) */}
            {statusIndex >= 0 && (
              <div className="mt-5 flex items-center gap-1.5 overflow-x-auto pb-1">
                {projectStatusOrder.map((s, i) => (
                  <div key={s} className="flex shrink-0 items-center gap-1.5">
                    <span
                      title={projectStatusLabels[s]}
                      className={`h-2.5 rounded-full transition-all ${
                        i < statusIndex
                          ? "w-8 bg-emerald-500"
                          : i === statusIndex
                            ? "w-12 bg-amber-400"
                            : "w-8 bg-black/10 dark:bg-white/10"
                      }`}
                    />
                  </div>
                ))}
                <span className="ml-2 shrink-0 text-xs font-semibold text-stone-500 dark:text-slate-500">
                  {statusIndex + 1}/{projectStatusOrder.length}
                </span>
              </div>
            )}

            {/* Owner / participant actions */}
            <div className="mt-5 flex flex-wrap gap-2">
              {isOwner && project.status === ProjectStatus.DRAFT && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handlePostDraft}
                  className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                >
                  Post brief to architects
                </button>
              )}
              {nextAction && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleAdvanceStatus(nextAction.to)}
                  className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                >
                  {nextAction.label}
                </button>
              )}
              {messagingTarget && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleMessage(messagingTarget.id)}
                  className="rounded-full border border-stone-300 px-6 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  Message {messagingTarget.name.split(" ")[0]}
                </button>
              )}
              {isOwner &&
                (project.status === ProjectStatus.DRAFT ||
                  project.status === ProjectStatus.BRIEF_POSTED) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleDelete}
                    className="rounded-full border border-rose-300 px-6 py-2.5 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-400/40 dark:text-rose-400 dark:hover:bg-rose-400/10"
                  >
                    Delete
                  </button>
                )}
            </div>

            {error && (
              <p className="mt-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                {error}
              </p>
            )}
          </div>

          {/* Brief -------------------------------------------------------- */}
          <section>
            <h2 className="text-xl font-extrabold tracking-tight">The brief</h2>
            <div className={`mt-4 ${cardClass}`}>
              <p className="text-sm whitespace-pre-line text-stone-700 dark:text-slate-300">
                {project.description}
              </p>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-stone-500 dark:text-slate-500">Address</dt>
                  <dd className="mt-0.5 font-semibold">{project.address}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500 dark:text-slate-500">Land</dt>
                  <dd className="mt-0.5 font-semibold">{project.landAreaKatha} katha</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500 dark:text-slate-500">Floors</dt>
                  <dd className="mt-0.5 font-semibold">{project.floors}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500 dark:text-slate-500">Budget</dt>
                  <dd className="mt-0.5 font-semibold">
                    {project.budgetMinBdt || project.budgetMaxBdt
                      ? `${project.budgetMinBdt ? formatBdt(project.budgetMinBdt) : "—"} – ${
                          project.budgetMaxBdt ? formatBdt(project.budgetMaxBdt) : "—"
                        }`
                      : "Not set"}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-stone-500 dark:text-slate-500">
                Owner: {project.owner.name}
                {project.architect && <> · Architect: {project.architect.name}</>}
              </p>
            </div>
          </section>

          {/* Proposals (while the brief is open) --------------------------- */}
          {project.status === ProjectStatus.BRIEF_POSTED && (
            <ProposalsSection project={project} token={token} role={user.role} onChanged={load} />
          )}

          {/* Contract (once an architect was engaged) ---------------------- */}
          {contract && (
            <ContractSection
              contract={contract}
              token={token}
              isClient={user.id === contract.client.id}
              isArchitect={user.id === contract.architect.id}
              onChanged={(updated) => {
                setContract(updated);
                load(); // contract actions can move the project status too
              }}
            />
          )}

          {/* Permit tracker + archive (participants only) ------------------ */}
          {(isOwner || isAssignedArchitect) && (
            <>
              <EcpsSection
                project={project}
                token={token}
                canEdit={isOwner || isAssignedArchitect}
              />
              <DocumentsSection
                projectId={project.id}
                token={token}
                userId={user.id}
                isOwner={isOwner}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
