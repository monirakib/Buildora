"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, PencilRuler, Wallet } from "lucide-react";
import {
  DeliverableStatus,
  MilestoneStatus,
  StructuralStatus,
  UserRole,
  type BuildContract,
  type Milestone,
  type StructuralEngagement,
} from "@buildora/shared";
import { AccountShell, type NavGroup } from "@/components/account/AccountShell";
import { formatBdt, formatDate } from "@/components/app/projectStatus";
import { Navbar } from "@/components/landing/Navbar";
import { listMyBuildWork } from "@/lib/apiBuild";
import { listMyEngagements } from "@/lib/apiStructural";
import { useRegisterAiContext } from "@/lib/useRegisterAiContext";
import { useSession } from "@/store/useSession";

/**
 * The structural engineer's console.
 *
 * The problem it solves: an engineer's work is scattered one project at a time
 * across other people's pages. A milestone sits in AWAITING_INSPECTION until
 * they sign it, and nothing on the platform told them so — they had to open
 * each project's Contractor tab in turn and look. Every queue here is that
 * question asked once, across everything.
 *
 * It reads two endpoints that already existed and had no caller anywhere in the
 * app: `GET /api/structural/mine` and `GET /api/build/mine`. The only server
 * change was making the second one return milestone schedules alongside the
 * contracts, since the statuses are the whole point.
 */

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 shadow-xl shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-white/5";

const smallButtonClass =
  "inline-flex items-center justify-center rounded-full bg-stone-900 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-stone-800 dark:bg-white dark:text-stone-950 dark:hover:bg-slate-200";

type SectionId = "inspections" | "drawings" | "escrow";

/* -------------------------------------------------------------------------
   Reading the queues out of the raw lists
   ------------------------------------------------------------------------- */

/**
 * Where an engagement is waiting, from the engineer's side.
 *
 * `yours` is the one that matters: the escrow is funded and there is no set
 * sitting with the owner, so the next move is the engineer's — either the first
 * submission or a revision after changes were requested.
 */
type EngagementStage = "escrow" | "yours" | "review" | "closed";

function stageOf(engagement: StructuralEngagement): EngagementStage {
  if (engagement.status === StructuralStatus.AWAITING_ESCROW) return "escrow";
  if (engagement.status !== StructuralStatus.DRAWINGS_IN_PROGRESS) return "closed";

  // Submissions are appended, so the last one is the live one. A set still
  // pending review means the owner has it; anything else means the engineer
  // owes the next set.
  const latest = engagement.submissions[engagement.submissions.length - 1];
  return latest?.status === DeliverableStatus.PENDING_REVIEW ? "review" : "yours";
}

/** "3 days ago" / "today", for how long a stage has been waiting. */
function waitingSince(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/* -------------------------------------------------------------------------
   Page
   ------------------------------------------------------------------------- */

export default function EngineerConsolePage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);
  const bootstrapped = useSession((s) => s.bootstrapped);

  const [engagements, setEngagements] = useState<StructuralEngagement[]>([]);
  const [contracts, setContracts] = useState<BuildContract[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [section, setSection] = useState<SectionId>("inspections");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The session hydrates from localStorage on the client, so `user` is null on
  // the server render no matter who is signed in. Wait for mount before
  // trusting it — same gate the dashboard uses.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Only engineers belong here. Everyone else goes back to their dashboard —
  // an inspection queue means nothing to a supplier. The role check runs as
  // soon as the user is known; the signed-out check waits for `bootstrapped`,
  // because until the refresh call lands "no token" and "not signed in" look
  // identical and would bounce a signed-in engineer to the login page.
  useEffect(() => {
    if (!mounted) return;
    if (user && user.role !== UserRole.STRUCTURAL_ENGINEER) {
      router.replace("/dashboard");
      return;
    }
    if (bootstrapped && !token) router.replace("/auth");
  }, [mounted, bootstrapped, token, user, router]);

  useEffect(() => {
    if (!token || user?.role !== UserRole.STRUCTURAL_ENGINEER) return;
    (async () => {
      try {
        const [mine, build] = await Promise.all([listMyEngagements(token), listMyBuildWork(token)]);
        setEngagements(mine);
        setContracts(build.contracts);
        setMilestones(build.milestones);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load your work");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, user?.role]);

  const userId = user?.id;

  /**
   * Both endpoints answer for *every* side the caller sits on — an engineer who
   * also owns a plot would get their land-owner rows too. Filtering to the ones
   * where they are the engineer is what makes this a console rather than a
   * mixed feed.
   */
  const myEngagements = useMemo(
    () => engagements.filter((e) => e.engineer.id === userId),
    [engagements, userId]
  );

  const myContracts = useMemo(
    () => contracts.filter((c) => c.engineer?.id === userId),
    [contracts, userId]
  );

  /** Milestone + the contract it belongs to, which is where the project id lives. */
  const myMilestones = useMemo(() => {
    const byId = new Map(myContracts.map((c) => [c.id, c]));
    return milestones
      .filter((m) => byId.has(m.buildContractId))
      .map((m) => ({ milestone: m, contract: byId.get(m.buildContractId)! }));
  }, [milestones, myContracts]);

  const awaitingInspection = myMilestones.filter(
    (row) => row.milestone.status === MilestoneStatus.AWAITING_INSPECTION
  );
  const afterInspection = myMilestones.filter(
    (row) =>
      row.milestone.status === MilestoneStatus.INSPECTION_PASSED ||
      row.milestone.status === MilestoneStatus.INSPECTION_FAILED
  );

  const drawingsDue = myEngagements.filter((e) => stageOf(e) === "yours");
  const withOwner = myEngagements.filter((e) => stageOf(e) === "review");
  const awaitingEscrow = myEngagements.filter((e) => stageOf(e) === "escrow");

  useRegisterAiContext(loading ? null : { page: "other", label: "Engineer console" });

  const navGroups: NavGroup[] = [
    {
      heading: "Your work",
      items: [
        {
          id: "inspections",
          label: "Inspections",
          icon: <ClipboardCheck className="h-4.5 w-4.5" />,
          badge: awaitingInspection.length,
        },
        {
          id: "drawings",
          label: "Drawings",
          icon: <PencilRuler className="h-4.5 w-4.5" />,
          badge: drawingsDue.length,
        },
      ],
    },
    {
      heading: "Money",
      items: [{ id: "escrow", label: "Escrow", icon: <Wallet className="h-4.5 w-4.5" /> }],
    },
  ];

  const headings: Record<SectionId, { title: string; subtitle: string }> = {
    inspections: {
      title: "Inspections",
      subtitle: "Stages a contractor has claimed and nobody can be paid for until you sign",
    },
    drawings: {
      title: "Drawings",
      subtitle: "Structural sets you owe, and the ones sitting with an owner for review",
    },
    escrow: {
      title: "Escrow",
      subtitle: "What has been funded against your fees, and what has reached you",
    },
  };

  // Before the session is known, and while a non-engineer is being redirected
  // away, show the navbar and a line rather than a blank page.
  if (!mounted || !user || user.role !== UserRole.STRUCTURAL_ENGINEER) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
          <p className="text-center text-sm text-stone-500 dark:text-slate-500">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <AccountShell
      user={user}
      avatarUrl={user.profile?.avatarUrl}
      roleLabel="Structural engineer"
      groups={navGroups}
      active={section}
      onSelect={(id) => setSection(id as SectionId)}
      title={headings[section].title}
      subtitle={headings[section].subtitle}
    >
      {error && (
        <p className="mb-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-stone-500 dark:text-slate-500">Loading your work…</p>
      ) : section === "inspections" ? (
        <InspectionsSection waiting={awaitingInspection} decided={afterInspection} />
      ) : section === "drawings" ? (
        <DrawingsSection due={drawingsDue} withOwner={withOwner} awaitingEscrow={awaitingEscrow} />
      ) : (
        <EscrowSection engagements={myEngagements} />
      )}
    </AccountShell>
  );
}

/* -------------------------------------------------------------------------
   Sections
   ------------------------------------------------------------------------- */

type MilestoneRow = { milestone: Milestone; contract: BuildContract };

function InspectionsSection({
  waiting,
  decided,
}: {
  waiting: MilestoneRow[];
  decided: MilestoneRow[];
}) {
  return (
    <div className="space-y-6">
      <div className={cardClass}>
        <div className="flex items-baseline justify-between gap-3 border-b border-black/5 px-5 py-4 dark:border-white/10">
          <h2 className="text-sm font-extrabold">Waiting on your signature</h2>
          <span className="text-xs font-bold text-stone-400 tabular-nums dark:text-slate-500">
            {waiting.length}
          </span>
        </div>

        {waiting.length === 0 ? (
          <p className="px-5 py-6 text-sm text-stone-500 dark:text-slate-400">
            Nothing to inspect. A stage lands here the moment a contractor claims it as finished.
          </p>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {waiting.map(({ milestone, contract }) => (
              <li
                key={milestone.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {milestone.order}. {milestone.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-slate-400">
                    {contract.projectTitle} · claimed{" "}
                    {milestone.claimedAt ? waitingSince(milestone.claimedAt) : "recently"}
                  </p>
                </div>
                <span className="text-xs font-bold text-stone-600 tabular-nums dark:text-slate-300">
                  {formatBdt(milestone.amountBdt)}
                </span>
                <Link
                  href={`/projects/${contract.projectId}?tab=contractor`}
                  className={smallButtonClass}
                >
                  Inspect
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {decided.length > 0 && (
        <div className={cardClass}>
          <div className="border-b border-black/5 px-5 py-4 dark:border-white/10">
            <h2 className="text-sm font-extrabold">Already decided</h2>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
              A pass is with the owner to release. A fail is with the contractor to put right.
            </p>
          </div>
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {decided.map(({ milestone, contract }) => {
              const passed = milestone.status === MilestoneStatus.INSPECTION_PASSED;
              const last = milestone.inspections[milestone.inspections.length - 1];
              return (
                <li
                  key={milestone.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5"
                >
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-extrabold uppercase ${
                      passed
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    {passed ? "Passed" : "Failed"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {milestone.order}. {milestone.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-slate-400">
                      {contract.projectTitle}
                      {last ? ` · you signed ${formatDate(last.inspectedAt)}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/projects/${contract.projectId}?tab=contractor`}
                    className="text-xs font-bold text-amber-700 dark:text-amber-400"
                  >
                    Open →
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function DrawingsSection({
  due,
  withOwner,
  awaitingEscrow,
}: {
  due: StructuralEngagement[];
  withOwner: StructuralEngagement[];
  awaitingEscrow: StructuralEngagement[];
}) {
  return (
    <div className="space-y-6">
      <EngagementList
        heading="Your move"
        empty="No drawing set is owed right now."
        engagements={due}
        cta="Submit a set"
        note={(e) =>
          e.submissions.length === 0
            ? "First set — nothing submitted yet"
            : `Revision ${e.revisionsUsed} of ${e.maxRevisions} · changes requested`
        }
      />

      <EngagementList
        heading="With the owner"
        empty="Nothing is waiting on a review."
        engagements={withOwner}
        cta="Open"
        note={(e) => {
          const latest = e.submissions[e.submissions.length - 1];
          return latest
            ? `“${latest.title}” submitted ${formatDate(latest.submittedAt)}`
            : "Submitted for review";
        }}
      />

      <EngagementList
        heading="Waiting on escrow"
        empty="Every engagement you have is funded."
        engagements={awaitingEscrow}
        cta="Open"
        note={() => "The owner has not funded the fee yet — no drawings are due until they do"}
      />
    </div>
  );
}

/** The three drawing queues differ only in their copy, so they share a body. */
function EngagementList({
  heading,
  empty,
  engagements,
  cta,
  note,
}: {
  heading: string;
  empty: string;
  engagements: StructuralEngagement[];
  cta: string;
  note: (engagement: StructuralEngagement) => string;
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-baseline justify-between gap-3 border-b border-black/5 px-5 py-4 dark:border-white/10">
        <h2 className="text-sm font-extrabold">{heading}</h2>
        <span className="text-xs font-bold text-stone-400 tabular-nums dark:text-slate-500">
          {engagements.length}
        </span>
      </div>

      {engagements.length === 0 ? (
        <p className="px-5 py-6 text-sm text-stone-500 dark:text-slate-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-white/10">
          {engagements.map((engagement) => (
            <li
              key={engagement.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{engagement.project.title}</p>
                <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-slate-400">
                  {note(engagement)}
                </p>
              </div>
              <span className="text-xs font-bold text-stone-600 tabular-nums dark:text-slate-300">
                {formatBdt(engagement.feeBdt)}
              </span>
              <Link
                href={`/projects/${engagement.project.id}?tab=engineer`}
                className={smallButtonClass}
              >
                {cta}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EscrowSection({ engagements }: { engagements: StructuralEngagement[] }) {
  // Held = funded but not yet released. `releasedToEngineerBdt` is only filled
  // in on approval, so a live engagement contributes its whole fee to "held".
  const released = engagements.reduce((sum, e) => sum + (e.releasedToEngineerBdt ?? 0), 0);
  const held = engagements
    .filter((e) => e.status === StructuralStatus.DRAWINGS_IN_PROGRESS)
    .reduce((sum, e) => sum + e.feeBdt, 0);
  const unfunded = engagements
    .filter((e) => e.status === StructuralStatus.AWAITING_ESCROW)
    .reduce((sum, e) => sum + e.feeBdt, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Released to you" value={released} tone="emerald" />
        <Figure label="Held in escrow" value={held} tone="sky" />
        <Figure label="Not yet funded" value={unfunded} tone="stone" />
      </div>

      <div className={cardClass}>
        <div className="border-b border-black/5 px-5 py-4 dark:border-white/10">
          <h2 className="text-sm font-extrabold">Every engagement</h2>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
            Your fee, less the platform commission taken when the owner approves.
          </p>
        </div>

        {engagements.length === 0 ? (
          <p className="px-5 py-6 text-sm text-stone-500 dark:text-slate-400">
            You have not been appointed to a project yet. Verified engineers appear in the public
            directory, where land owners find them.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-136 text-sm">
              <thead>
                <tr className="text-left text-[0.65rem] font-extrabold tracking-[0.12em] text-stone-400 uppercase dark:text-slate-500">
                  <th className="px-5 py-3 font-extrabold">Project</th>
                  <th className="px-5 py-3 font-extrabold">Stage</th>
                  <th className="px-5 py-3 text-right font-extrabold">Fee</th>
                  <th className="px-5 py-3 text-right font-extrabold">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/10">
                {engagements.map((engagement) => (
                  <tr key={engagement.id}>
                    <td className="px-5 py-3">
                      <Link
                        href={`/projects/${engagement.project.id}?tab=engineer`}
                        className="font-semibold hover:text-amber-700 dark:hover:text-amber-400"
                      >
                        {engagement.project.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-xs text-stone-500 dark:text-slate-400">
                      {stageLabels[stageOf(engagement)]}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {formatBdt(engagement.feeBdt)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {engagement.releasedToEngineerBdt
                        ? formatBdt(engagement.releasedToEngineerBdt)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const stageLabels: Record<EngagementStage, string> = {
  escrow: "Awaiting escrow",
  yours: "Drawings due from you",
  review: "With the owner",
  closed: "Closed",
};

const figureTones = {
  emerald: "text-emerald-700 dark:text-emerald-300",
  sky: "text-sky-700 dark:text-sky-300",
  stone: "text-stone-600 dark:text-slate-300",
};

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof figureTones;
}) {
  return (
    <div className={`${cardClass} px-5 py-4`}>
      <p className="text-[0.65rem] font-extrabold tracking-[0.12em] text-stone-400 uppercase dark:text-slate-500">
        {label}
      </p>
      <p className={`mt-1.5 text-lg font-extrabold tabular-nums ${figureTones[tone]}`}>
        {formatBdt(value)}
      </p>
    </div>
  );
}
