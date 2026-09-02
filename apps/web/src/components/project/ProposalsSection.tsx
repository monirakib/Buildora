"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ProposalStatus,
  UserRole,
  VerificationStatus,
  type Project,
  type Proposal,
} from "@buildora/shared";
import { createProposal, decideProposal, listProjectProposals } from "@/lib/apiProjects";
import { VerifiedBadge } from "@/components/app/VerifiedBadge";
import { VerifyNotice, useIsVerified } from "@/components/app/VerifyGate";
import { formatBdt, formatDate } from "@/components/app/projectStatus";
import { ProposalDraftButton } from "@/components/project/ProposalDraftButton";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

const statusLabels: Record<ProposalStatus, string> = {
  [ProposalStatus.PENDING]: "Pending",
  [ProposalStatus.ACCEPTED]: "Accepted",
  [ProposalStatus.DECLINED]: "Declined",
  [ProposalStatus.WITHDRAWN]: "Withdrawn",
};

const statusStyles: Record<ProposalStatus, string> = {
  [ProposalStatus.PENDING]: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  [ProposalStatus.ACCEPTED]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  [ProposalStatus.DECLINED]: "bg-stone-500/15 text-stone-600 dark:text-slate-400",
  [ProposalStatus.WITHDRAWN]: "bg-stone-500/15 text-stone-600 dark:text-slate-400",
};

/**
 * Proposals on a posted brief. The owner sees every pitch with accept/decline;
 * an architect sees a pitch form (or their already-sent proposal). Accepting
 * reloads the whole page state via `onChanged` because it moves the project
 * to CONCEPT_STAGE and creates the contract.
 */
export function ProposalsSection({
  project,
  token,
  role,
  onChanged,
}: {
  project: Project;
  token: string;
  role: UserRole;
  onChanged: () => void;
}) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isOwner = role === UserRole.LAND_OWNER;
  const isArchitect = role === UserRole.ARCHITECT;
  const isVerified = useIsVerified();

  // Pitch form (architects only).
  const [form, setForm] = useState({
    coverLetter: "",
    conceptFeeBdt: "",
    designFeeBdt: "",
    estimatedWeeks: "",
  });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setProposals(await listProjectProposals(token, project.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load proposals");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, project.id]);

  async function decide(id: string, action: "accept" | "decline" | "withdraw") {
    setBusyId(id);
    setError(null);
    try {
      const updated = await decideProposal(token, id, action);
      setProposals((list) => list.map((p) => (p.id === updated.id ? updated : p)));
      if (action === "accept") onChanged(); // project moved to CONCEPT_STAGE
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  async function submitPitch(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const created = await createProposal(token, project.id, form);
      setProposals((list) => [created, ...list]);
      setForm({ coverLetter: "", conceptFeeBdt: "", designFeeBdt: "", estimatedWeeks: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the proposal");
    } finally {
      setSending(false);
    }
  }

  const myLiveProposal = proposals.find(
    (p) => p.status === ProposalStatus.PENDING || p.status === ProposalStatus.ACCEPTED
  );

  return (
    <section>
      <h2 className="text-xl font-extrabold tracking-tight">
        {isOwner ? "Proposals" : "Your proposal"}
      </h2>

      {error && (
        <p className="mt-3 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-3 text-sm text-stone-500 dark:text-slate-500">Loading…</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {proposals.length === 0 && isOwner && (
            <p className="text-sm text-stone-600 dark:text-slate-400">
              No proposals yet, architects browsing the open briefs will find yours.
            </p>
          )}

          {proposals.map((p) => (
            <div key={p.id} className={cardClass}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-bold">
                    <Link
                      href={`/architects/${p.architect.id}`}
                      className="hover:text-amber-700 dark:hover:text-amber-400"
                    >
                      {p.architect.name}
                    </Link>
                    <VerifiedBadge status={p.architect.verificationStatus} />
                  </p>
                  {p.architect.company && (
                    <p className="text-sm text-stone-600 dark:text-slate-400">
                      {p.architect.company}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusStyles[p.status]}`}
                >
                  {statusLabels[p.status]}
                </span>
              </div>

              <p className="mt-3 text-sm whitespace-pre-line text-stone-700 dark:text-slate-300">
                {p.coverLetter}
              </p>

              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span>
                  <span className="text-stone-500 dark:text-slate-500">Concept fee:</span>{" "}
                  <strong>{formatBdt(p.conceptFeeBdt)}</strong>
                </span>
                <span>
                  <span className="text-stone-500 dark:text-slate-500">Design fee:</span>{" "}
                  <strong>{formatBdt(p.designFeeBdt)}</strong>
                </span>
                {p.estimatedWeeks && (
                  <span>
                    <span className="text-stone-500 dark:text-slate-500">Timeline:</span>{" "}
                    <strong>~{p.estimatedWeeks} weeks</strong>
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-stone-500 dark:text-slate-500">
                  Sent {formatDate(p.createdAt)}
                </p>
                {p.status === ProposalStatus.PENDING && (
                  <div className="flex gap-2">
                    {isOwner && (
                      <>
                        <button
                          type="button"
                          // Accepting creates the contract and escrow schedule,
                          // so it's limited to supervisor-approved architects.
                          // The API rejects it too — this just explains why.
                          disabled={
                            busyId === p.id ||
                            p.architect.verificationStatus !== VerificationStatus.APPROVED
                          }
                          title={
                            p.architect.verificationStatus !== VerificationStatus.APPROVED
                              ? "This architect isn't Platform Verified yet"
                              : undefined
                          }
                          onClick={() => decide(p.id, "accept")}
                          className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-400 disabled:opacity-60"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => decide(p.id, "decline")}
                          className="rounded-full border border-stone-300 px-4 py-1.5 text-xs font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          Decline
                        </button>
                      </>
                    )}
                    {isArchitect && (
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => decide(p.id, "withdraw")}
                        className="rounded-full border border-stone-300 px-4 py-1.5 text-xs font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Architects pitch here while the brief is open and they have no live
              proposal — and only once verified, since an unverified architect's
              proposal can't be accepted anyway. */}
          {isArchitect && !myLiveProposal && !isVerified && (
            <div className={cardClass}>
              <VerifyNotice action="send proposals on briefs" />
            </div>
          )}
          {isArchitect && !myLiveProposal && isVerified && (
            <form onSubmit={submitPitch} className={cardClass}>
              <h3 className="font-bold">Send a proposal</h3>
              <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                Pitch your approach and quote your fees. The concept fee (500–1,000 BDT) covers the
                initial concept; the design fee is held in escrow once the client proceeds.
              </p>
              <div className="mt-4 flex flex-col gap-4">
                {/*
                  A first draft from this brief and the architect's own stored
                  portfolio. It only fills the box — sending is still the button
                  at the bottom of the form.
                */}
                <ProposalDraftButton
                  token={token}
                  projectId={project.id}
                  hasExistingText={form.coverLetter.trim().length > 0}
                  onDraft={(coverLetter) => setForm((f) => ({ ...f, coverLetter }))}
                />
                <textarea
                  value={form.coverLetter}
                  onChange={(e) => setForm((f) => ({ ...f, coverLetter: e.target.value }))}
                  rows={4}
                  required
                  placeholder="Why you're the right fit, similar work you've done, your approach…"
                  className={inputClass}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">Concept fee (BDT)</label>
                    <input
                      type="number"
                      min="500"
                      max="1000"
                      required
                      value={form.conceptFeeBdt}
                      onChange={(e) => setForm((f) => ({ ...f, conceptFeeBdt: e.target.value }))}
                      placeholder="500–1000"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">Design fee (BDT)</label>
                    <input
                      type="number"
                      min="1000"
                      required
                      value={form.designFeeBdt}
                      onChange={(e) => setForm((f) => ({ ...f, designFeeBdt: e.target.value }))}
                      placeholder="1,50,000"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      Weeks{" "}
                      <span className="font-medium text-stone-500 dark:text-slate-400">
                        (optional)
                      </span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="104"
                      value={form.estimatedWeeks}
                      onChange={(e) => setForm((f) => ({ ...f, estimatedWeeks: e.target.value }))}
                      placeholder="8"
                      className={inputClass}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={sending}
                  className="self-start rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                >
                  {sending ? "Sending…" : "Send proposal"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
