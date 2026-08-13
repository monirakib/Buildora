"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileText, Lock } from "lucide-react";
import {
  DisputeScope,
  MilestoneStatus,
  PaymentKind,
  ProjectStatus,
  StructuralStatus,
  type BuildContract,
  type Contract,
  type EcpsApplication,
  type Milestone,
  type Project,
  type StructuralEngagement,
  type Tender,
} from "@buildora/shared";
import {
  deleteProject,
  getEcpsApplication,
  getProject,
  getProjectContract,
  listProjectProposals,
  postBrief,
  updateProjectStatus,
} from "@/lib/apiProjects";
import { getProjectEngagement } from "@/lib/apiStructural";
import { getProjectTender } from "@/lib/apiTenders";
import { getProjectBuild } from "@/lib/apiBuild";
import { openConversation } from "@/lib/apiMessages";
import { readPaymentNotice } from "@/lib/apiPayments";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { ProposalsSection } from "@/components/project/ProposalsSection";
import { ContractSection } from "@/components/project/ContractSection";
import { EcpsSection } from "@/components/project/EcpsSection";
import { StructuralSection } from "@/components/project/StructuralSection";
import { FloorPlanSection } from "@/components/project/FloorPlanSection";
import { DocumentsSection } from "@/components/project/DocumentsSection";
import { SiteDiarySection } from "@/components/project/SiteDiarySection";
import { TenderSection } from "@/components/project/TenderSection";
import { BuildSection } from "@/components/project/BuildSection";
import { ChangeOrderSection } from "@/components/project/ChangeOrderSection";
import { DisputeSection } from "@/components/project/DisputeSection";
import { HandoverSection } from "@/components/project/HandoverSection";
import { AttendanceSection } from "@/components/project/AttendanceSection";
import { EstimateSection } from "@/components/project/EstimateSection";
import { ShareSection } from "@/components/project/ShareSection";
import { ProjectProgress } from "@/components/project/hub/ProjectProgress";
import { ProjectTabs, type TabDescriptor } from "@/components/project/hub/ProjectTabs";
import { OverviewTab } from "@/components/project/hub/OverviewTab";
import {
  computeProjectProgress,
  tabsForRole,
  type PhaseKey,
  type ProjectSnapshot,
} from "@/components/project/hub/phases";
import { TAB_LABELS, TAB_ORDER, parseTab, type TabKey } from "@/components/project/hub/tabs";
import {
  buildingTypeLabels,
  projectStatusLabels,
  projectStatusStyles,
} from "@/components/app/projectStatus";

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

/**
 * The project hub.
 *
 * This used to be ten sections stacked in one column, several of which rendered
 * nothing at all depending on the stage — so the page had no predictable shape
 * and every visit meant scrolling to find out what was there. It's now one tab
 * per phase of the build, in the order the phases actually happen, with a
 * progress bar computed from real records rather than the hand-advanced status.
 *
 * Only the active tab's section is mounted, so a page that used to fire ten
 * section loads at once now fires one, plus the small parallel snapshot below.
 */
export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [project, setProject] = useState<Project | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [structural, setStructural] = useState<StructuralEngagement | null>(null);
  const [ecps, setEcps] = useState<EcpsApplication | null>(null);
  const [tender, setTender] = useState<Tender | null>(null);
  const [build, setBuild] = useState<BuildContract | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [pendingProposals, setPendingProposals] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<TabKey>("overview");

  // Set once on mount from the ?payment=… flag the gateway callback adds.
  const [payNotice, setPayNotice] = useState<ReturnType<typeof readPaymentNotice>>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    setPayNotice(readPaymentNotice());
  }, []);

  /**
   * One snapshot of every phase, fetched in parallel.
   *
   * Each of these endpoints already existed for the individual sections; the hub
   * needs them together to draw an honest progress bar and to know which tabs
   * are reachable. Every one is allowed to fail on its own — a project with no
   * tender yet 404s, and that's simply "not started", not an error.
   */
  const load = useCallback(async () => {
    if (!token) return;
    try {
      const p = await getProject(token, params.id);
      setProject(p);

      const isClient = !!user && user.id === p.owner.id;
      const [c, s, e, t, b, proposals] = await Promise.all([
        getProjectContract(token, params.id).catch(() => null),
        getProjectEngagement(token, params.id).catch(() => null),
        getEcpsApplication(token, params.id).catch(() => null),
        getProjectTender(token, params.id).catch(() => null),
        getProjectBuild(token, params.id).catch(() => null),
        // Only the owner can list proposals, and only while the brief is open.
        isClient && p.status === ProjectStatus.BRIEF_POSTED
          ? listProjectProposals(token, params.id).catch(() => [])
          : Promise.resolve([]),
      ]);

      setContract(c);
      setStructural(s);
      setEcps(e);
      setTender(t);
      setBuild(b?.contract ?? null);
      setMilestones(b?.milestones ?? []);
      setPendingProposals(proposals.length);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the project");
    } finally {
      setLoading(false);
    }
  }, [token, params.id, user]);

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
  const isAssignedEngineer = !!user && !!project && user.id === project.engineer?.id;

  const progress = useMemo(() => {
    if (!project) return null;
    const snapshot: ProjectSnapshot = {
      project,
      contract,
      structural,
      ecps,
      tender,
      build,
      milestones,
      pendingProposals,
    };
    return computeProjectProgress(snapshot, isOwner);
  }, [project, contract, structural, ecps, tender, build, milestones, pendingProposals, isOwner]);

  /**
   * What this viewer could raise a dispute about.
   *
   * Only things with money actually behind them: a contract that's been funded,
   * an engagement past its escrow, a milestone that's funded but not yet paid
   * out. Offering to dispute an empty contract would just be noise.
   */
  const disputeTargets = useMemo(() => {
    const targets: { scope: DisputeScope; id: string; label: string }[] = [];
    if (contract && contract.payments.some((p) => p.kind === PaymentKind.ESCROW_DEPOSIT)) {
      targets.push({
        scope: DisputeScope.DESIGN_CONTRACT,
        id: contract.id,
        label: "Design contract",
      });
    }
    if (structural && structural.status !== StructuralStatus.AWAITING_ESCROW) {
      targets.push({
        scope: DisputeScope.STRUCTURAL,
        id: structural.id,
        label: "Structural engagement",
      });
    }
    for (const m of milestones) {
      if (m.status !== MilestoneStatus.PENDING && m.status !== MilestoneStatus.RELEASED) {
        targets.push({
          scope: DisputeScope.BUILD_MILESTONE,
          id: m.id,
          label: `Milestone ${m.order} — ${m.title}`,
        });
      }
    }
    return targets;
  }, [contract, structural, milestones]);

  /** Which tabs this viewer gets, in journey order. */
  const visibleTabs = useMemo(() => {
    if (!user) return [];
    const allowed = tabsForRole(user.role, isOwner);
    return TAB_ORDER.filter((t) => allowed.includes(t));
  }, [user, isOwner]);

  // Open the tab named in ?tab=, so a notification can link straight to the bid
  // that needs comparing rather than the top of the page. Falls back to
  // Overview when the value is unknown or not one this viewer can see.
  useEffect(() => {
    if (visibleTabs.length === 0) return;
    const requested = parseTab(searchParams.get("tab"));
    const fallback = visibleTabs[0] ?? "overview";
    setTab(requested && visibleTabs.includes(requested) ? requested : fallback);
  }, [searchParams, visibleTabs]);

  /** Switching tabs writes the URL, so refresh and back both behave. */
  const selectTab = useCallback(
    (key: TabKey) => {
      setTab(key);
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", key);
      router.replace(`/projects/${params.id}?${next.toString()}`, { scroll: false });
    },
    [router, params.id, searchParams]
  );

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

  if (!project || !user || !token || !progress) return null;

  const nextAction = isOwner ? nextStatusActions[project.status] : undefined;
  const messagingTarget = isOwner ? project.architect : isAssignedArchitect ? project.owner : null;

  /** Tab descriptors: phase tabs carry their own progress, lock and alert state. */
  const tabDescriptors: TabDescriptor[] = visibleTabs.map((key) => {
    const phase = (progress.phases as Record<string, (typeof progress.phases)["architect"]>)[key];
    return {
      key,
      label: TAB_LABELS[key],
      fraction: phase?.fraction,
      locked: phase ? !phase.unlocked : false,
      needsYou: phase?.needsYou ?? false,
    };
  });

  const activePhase = (progress.phases as Record<string, (typeof progress.phases)["architect"]>)[
    tab
  ];
  const activeLocked = activePhase ? !activePhase.unlocked : false;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          {/* Outcome of a gateway payment the payer was just redirected back
              from. The tab below already shows the new state; this only
              explains why. */}
          {payNotice && (
            <p
              className={`rounded-xl px-4 py-3 text-sm font-medium ${
                payNotice.tone === "success"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300"
              }`}
            >
              {payNotice.message}
            </p>
          )}

          {/* Header — identity, progress, actions. Stays put on every tab so
              the project's overall state is never more than a glance away. */}
          <header className="flex flex-col gap-5">
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
            </div>

            <ProjectProgress progress={progress} onJump={(p: PhaseKey) => selectTab(p)} />

            {(nextAction || messagingTarget || isOwner) && (
              <div className="flex flex-wrap gap-2">
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
            )}

            {error && (
              <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                {error}
              </p>
            )}
          </header>

          <ProjectTabs tabs={tabDescriptors} current={tab} onSelect={selectTab} />

          {/* Tab content ------------------------------------------------- */}
          <div className="flex flex-col gap-10 pt-2">
            {activeLocked ? (
              <LockedTab reason={activePhase?.blockedReason} label={TAB_LABELS[tab]} />
            ) : (
              <>
                {tab === "overview" && (
                  <>
                    <OverviewTab project={project} progress={progress} onJump={selectTab} />
                    {/* Disputes live on Overview because they cut across every
                        phase — the money in question may be design, structural
                        or construction. */}
                    {isOwner && <EstimateSection projectId={project.id} token={token} />}
                    {isOwner && <ShareSection projectId={project.id} token={token} />}
                    <DisputeSection
                      projectId={project.id}
                      token={token}
                      userId={user.id}
                      targets={disputeTargets}
                      onChanged={load}
                    />
                  </>
                )}

                {/* Architect — proposals, the design contract, the floor plan */}
                {tab === "architect" && (
                  <>
                    {project.status === ProjectStatus.BRIEF_POSTED && (
                      <ProposalsSection
                        project={project}
                        token={token}
                        role={user.role}
                        onChanged={load}
                      />
                    )}
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
                    {(isOwner || isAssignedArchitect) && project.architect && (
                      <FloorPlanSection project={project} token={token} />
                    )}
                    {!contract && project.status !== ProjectStatus.BRIEF_POSTED && (
                      <EmptyTab
                        title="No architect engaged yet"
                        body="Post your brief to start receiving proposals from verified architects."
                      />
                    )}
                  </>
                )}

                {tab === "engineer" && (
                  <StructuralSection
                    project={project}
                    token={token}
                    userId={user.id}
                    role={user.role}
                    onChanged={load}
                  />
                )}

                {tab === "rajuk" && (
                  <EcpsSection
                    project={project}
                    token={token}
                    canEdit={isOwner || isAssignedArchitect}
                  />
                )}

                {/* Contractor — bidding, the schedule, then variations */}
                {tab === "contractor" && (
                  <>
                    <TenderSection
                      project={project}
                      token={token}
                      isOwner={isOwner}
                      onChanged={load}
                    />
                    <BuildSection
                      project={project}
                      token={token}
                      userId={user.id}
                      onChanged={load}
                    />
                    {build && (
                      <div>
                        <Link
                          href={`/projects/${project.id}/report`}
                          className="inline-flex items-center gap-2 rounded-full border border-stone-300 px-5 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          <FileText className="h-4 w-4" /> Printable inspection report
                        </Link>
                      </div>
                    )}
                    {build && (
                      <ChangeOrderSection
                        buildContractId={build.id}
                        token={token}
                        isOwner={isOwner}
                        isContractor={user.id === build.contractor.id}
                        onChanged={load}
                      />
                    )}
                    {!tender && !build && !isOwner && (
                      <EmptyTab
                        title="Nothing to show yet"
                        body="Bidding hasn't opened on this project."
                      />
                    )}
                  </>
                )}

                {tab === "diary" && (
                  <>
                    <AttendanceSection
                      projectId={project.id}
                      token={token}
                      hasPlotPin={!!project.location}
                    />
                    <SiteDiarySection
                    project={project}
                    token={token}
                    userId={user.id}
                    canWrite={isOwner || isAssignedArchitect || isAssignedEngineer}
                    />
                  </>
                )}

                {tab === "documents" && (
                  <>
                    <HandoverSection
                      projectId={project.id}
                      token={token}
                      isOwner={isOwner}
                      onChanged={load}
                    />
                    <DocumentsSection
                      projectId={project.id}
                      token={token}
                      userId={user.id}
                      isOwner={isOwner}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Shown when a phase hasn't been reached yet — says what opens it. */
function LockedTab({ label, reason }: { label: string; reason?: string }) {
  return (
    <div className="rounded-2xl border border-white/50 bg-white/55 px-6 py-12 text-center backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-stone-500/10 dark:bg-white/10">
        <Lock className="h-5 w-5 text-stone-500 dark:text-slate-400" />
      </span>
      <p className="mt-4 font-bold">{label} isn&apos;t open yet</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-stone-600 dark:text-slate-400">
        {reason ?? "This stage becomes available once the earlier ones are finished."}
      </p>
    </div>
  );
}

/** Neutral empty state for a tab that's open but has nothing in it yet. */
function EmptyTab({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/50 bg-white/55 px-6 py-12 text-center backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
      <p className="font-bold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-stone-600 dark:text-slate-400">{body}</p>
    </div>
  );
}
