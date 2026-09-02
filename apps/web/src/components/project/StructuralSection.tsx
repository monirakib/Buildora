"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DeliverableStatus,
  PaymentKind,
  PaymentMethod,
  PaymentPurpose,
  StructuralStatus,
  UserRole,
  type Project,
  type PublicProfessional,
  type StructuralEngagement,
} from "@buildora/shared";
import { listProfessionals } from "@/lib/api";
import {
  appointEngineer,
  cancelEngagement,
  commentOnDrawings,
  fundStructuralEscrow,
  getProjectEngagement,
  reviewDrawings,
  submitDrawings,
} from "@/lib/apiStructural";
import { formatBdt, formatDate } from "@/components/app/projectStatus";
import { GatewayPayButton } from "@/components/app/GatewayPayButton";
import { surfaceClass } from "@/components/ui/surface";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const cardClass = `${surfaceClass} p-5 sm:p-6`;

const primaryButtonClass =
  "rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 shadow-lg transition hover:bg-amber-300 disabled:opacity-60";

const smallButtonClass =
  "rounded-full border border-stone-300/80 px-4 py-2 text-xs font-bold transition hover:border-amber-400/60 disabled:opacity-60 dark:border-white/15";

const statusLabels: Record<StructuralStatus, string> = {
  [StructuralStatus.AWAITING_ESCROW]: "Awaiting escrow deposit",
  [StructuralStatus.DRAWINGS_IN_PROGRESS]: "Drawings in progress",
  [StructuralStatus.COMPLETED]: "Completed",
  [StructuralStatus.CANCELLED]: "Cancelled",
};

const statusStyles: Record<StructuralStatus, string> = {
  [StructuralStatus.AWAITING_ESCROW]: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  [StructuralStatus.DRAWINGS_IN_PROGRESS]: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  [StructuralStatus.COMPLETED]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  [StructuralStatus.CANCELLED]: "bg-stone-500/15 text-stone-600 dark:text-slate-400",
};

const submissionStatusLabels: Record<DeliverableStatus, string> = {
  [DeliverableStatus.PENDING_REVIEW]: "Awaiting review",
  [DeliverableStatus.CHANGES_REQUESTED]: "Changes requested",
  [DeliverableStatus.APPROVED]: "Approved",
};

const submissionStatusStyles: Record<DeliverableStatus, string> = {
  [DeliverableStatus.PENDING_REVIEW]: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  [DeliverableStatus.CHANGES_REQUESTED]: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  [DeliverableStatus.APPROVED]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

const paymentKindLabels: Record<PaymentKind, string> = {
  [PaymentKind.CONCEPT_FEE]: "Concept fee paid",
  [PaymentKind.ESCROW_DEPOSIT]: "Escrow funded",
  [PaymentKind.ESCROW_RELEASE]: "Released to engineer",
  [PaymentKind.REFUND]: "Refunded",
};

/**
 * Structural engineering on a project.
 *
 * Shows one of three things depending on where the project is: the appointment
 * picker (owner, once the design is approved), the live engagement, or nothing
 * at all. The section is deliberately self-loading — it fetches its own
 * engagement rather than having the project page thread another prop through,
 * because only this section cares about it.
 */
export function StructuralSection({
  project,
  token,
  userId,
  role,
  onChanged,
}: {
  project: Project;
  token: string;
  userId: string;
  role: UserRole;
  /** Called after anything that can move the project's own status. */
  onChanged: () => void;
}) {
  const [engagement, setEngagement] = useState<StructuralEngagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True when the gateway can't take this payment, which is the only case that
  // still offers the manual form. Set by GatewayPayButton once it knows.
  const [gatewayDown, setGatewayDown] = useState(false);

  useEffect(() => {
    let active = true;
    getProjectEngagement(token, project.id)
      .then((res) => active && setEngagement(res))
      .catch(() => active && setEngagement(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token, project.id]);

  /** Runs an action, shows its error, and refreshes the project underneath. */
  async function run(fn: () => Promise<StructuralEngagement>) {
    setBusy(true);
    setError(null);
    try {
      setEngagement(await fn());
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const isClient = userId === project.owner.id;
  const isEngineer = engagement ? userId === engagement.engineer.id : false;
  const isArchitect = project.architect ? userId === project.architect.id : false;

  if (loading) return null;

  // Nothing engaged yet — only the owner sees the invitation to appoint one.
  if (!engagement || engagement.status === StructuralStatus.CANCELLED) {
    if (!isClient) return null;
    return (
      <AppointPanel
        project={project}
        token={token}
        previous={engagement}
        busy={busy}
        error={error}
        onAppoint={(engineerId, feeBdt) =>
          run(() => appointEngineer(token, { projectId: project.id, engineerId, feeBdt }))
        }
      />
    );
  }

  const openSubmission = engagement.submissions.find(
    (s) => s.status === DeliverableStatus.PENDING_REVIEW
  );

  return (
    <section className="mt-10">
      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">Structural engineering</h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
              {engagement.engineer.name}
              {engagement.engineer.company ? ` · ${engagement.engineer.company}` : ""} · fee{" "}
              {formatBdt(engagement.feeBdt)}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[engagement.status]}`}
          >
            {statusLabels[engagement.status]}
          </span>
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        )}

        {/* ---- Escrow ---- */}
        {engagement.status === StructuralStatus.AWAITING_ESCROW &&
          (isClient ? (
            <>
              {/* The gateway is the way to pay; the manual form below only
                  appears when it can't take this payment. The explanation of
                  what escrow means stays visible either way. */}
              <p className="mt-4 text-sm text-stone-600 dark:text-slate-400">
                The engineer can&apos;t start until the fee is held. It&apos;s only released when
                you approve their drawings.
              </p>
              <div className="mt-3">
                <GatewayPayButton
                  token={token}
                  purpose={PaymentPurpose.STRUCTURAL_ESCROW}
                  refId={engagement.id}
                  amountBdt={engagement.feeBdt}
                  label={`Deposit ${formatBdt(engagement.feeBdt)} into escrow`}
                  onUnavailable={setGatewayDown}
                />
              </div>
              {gatewayDown && (
                <EscrowForm
                  amountBdt={engagement.feeBdt}
                  busy={busy}
                  onPay={(method, reference) =>
                    run(() => fundStructuralEscrow(token, engagement.id, method, reference))
                  }
                />
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-stone-600 dark:text-slate-400">
              Waiting for the owner to move {formatBdt(engagement.feeBdt)} into escrow. Drawings can
              be submitted once it clears.
            </p>
          ))}

        {/* ---- Submitting ---- */}
        {engagement.status === StructuralStatus.DRAWINGS_IN_PROGRESS && isEngineer && (
          <>
            {openSubmission ? (
              <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm">
                <span className="font-bold">{openSubmission.title}</span> is with the owner for
                review. You can submit a revised set once they respond.
              </p>
            ) : (
              <SubmitForm
                busy={busy}
                revisionsLeft={engagement.maxRevisions - engagement.revisionsUsed}
                onSubmit={(input) => run(() => submitDrawings(token, engagement.id, input))}
              />
            )}
          </>
        )}

        {/* ---- Reviewing ---- */}
        {openSubmission && isClient && (
          <ReviewForm
            busy={busy}
            revisionsLeft={engagement.maxRevisions - engagement.revisionsUsed}
            feeBdt={engagement.feeBdt}
            commissionRate={engagement.commissionRate}
            onDecide={(decision, note) =>
              run(() => reviewDrawings(token, engagement.id, decision, note))
            }
          />
        )}

        {/* ---- Architect's note ---- */}
        {openSubmission && isArchitect && (
          <CommentForm
            busy={busy}
            existing={openSubmission.architectNote}
            onComment={(note) => run(() => commentOnDrawings(token, engagement.id, note))}
          />
        )}

        {/* ---- Submission history ---- */}
        {engagement.submissions.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-bold tracking-widest text-stone-500 uppercase dark:text-slate-400">
              Drawing sets
            </h3>
            <ul className="mt-3 flex flex-col gap-3">
              {engagement.submissions.map((sub, i) => (
                <li key={i} className="rounded-xl border border-black/5 p-4 dark:border-white/10">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold">{sub.title}</p>
                      <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-500">
                        Certified by {sub.signature} · {formatDate(sub.submittedAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${submissionStatusStyles[sub.status]}`}
                    >
                      {submissionStatusLabels[sub.status]}
                    </span>
                  </div>
                  {sub.note && (
                    <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">{sub.note}</p>
                  )}
                  <a
                    href={sub.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-bold text-amber-700 hover:underline dark:text-amber-400"
                  >
                    Open drawings
                  </a>
                  {sub.architectNote && (
                    <p className="mt-2 rounded-lg bg-sky-500/10 px-3 py-2 text-xs">
                      <span className="font-bold">Architect:</span> {sub.architectNote}
                    </p>
                  )}
                  {sub.clientNote && (
                    <p className="mt-2 rounded-lg bg-stone-500/10 px-3 py-2 text-xs dark:bg-white/5">
                      <span className="font-bold">Owner:</span> {sub.clientNote}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ---- Money ---- */}
        {engagement.payments.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-bold tracking-widest text-stone-500 uppercase dark:text-slate-400">
              Escrow ledger
            </h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              {engagement.payments.map((p, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span className="text-stone-600 dark:text-slate-400">
                    {paymentKindLabels[p.kind]}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </span>
                  <span className="font-semibold">{formatBdt(p.amountBdt)}</span>
                </li>
              ))}
            </ul>
            {engagement.status === StructuralStatus.COMPLETED && (
              <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">
                Platform commission {Math.round(engagement.commissionRate * 100)}% ·{" "}
                {formatBdt(engagement.commissionBdt ?? 0)}
              </p>
            )}
          </div>
        )}

        {/* ---- Cancel ---- */}
        {(isClient || isEngineer) && engagement.status !== StructuralStatus.COMPLETED && (
          <CancelForm
            busy={busy}
            hasEscrow={engagement.status === StructuralStatus.DRAWINGS_IN_PROGRESS}
            onCancel={(reason) => run(() => cancelEngagement(token, engagement.id, reason))}
          />
        )}

        {engagement.status === StructuralStatus.COMPLETED && (
          <p className="mt-5 rounded-xl bg-emerald-100 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300">
            Structural drawings approved and the fee released. The project is ready for its RAJUK
            permit application.
          </p>
        )}
      </div>
    </section>
  );
}

/** The owner picks a verified engineer and names the agreed fee. */
function AppointPanel({
  project,
  token,
  previous,
  busy,
  error,
  onAppoint,
}: {
  project: Project;
  token: string;
  previous: StructuralEngagement | null;
  busy: boolean;
  error: string | null;
  onAppoint: (engineerId: string, feeBdt: number) => void;
}) {
  const [engineers, setEngineers] = useState<PublicProfessional[]>([]);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [fee, setFee] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    listProfessionals({ role: UserRole.STRUCTURAL_ENGINEER, search: search || undefined })
      .then((res) => active && setEngineers(res.items))
      .catch(() => active && setEngineers([]));
    return () => {
      active = false;
    };
  }, [open, search]);

  return (
    <section className="mt-10">
      <div className={cardClass}>
        <h2 className="text-lg font-extrabold tracking-tight">Structural engineering</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
          {previous
            ? "The previous engagement was cancelled. You can appoint another engineer."
            : "Your design is approved. A structural engineer now prepares the drawings RAJUK needs for the permit application."}
        </p>

        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`mt-4 ${primaryButtonClass}`}
          >
            Appoint a structural engineer
          </button>
        ) : (
          <div className="mt-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search verified engineers by name, firm or specialty"
              className={inputClass}
            />

            <ul className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto">
              {engineers.length === 0 ? (
                <li className="text-sm text-stone-500 dark:text-slate-500">
                  No verified structural engineers found yet.
                </li>
              ) : (
                engineers.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setChosen(e.id)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                        chosen === e.id
                          ? "border-amber-500 bg-amber-400/15"
                          : "border-stone-300/80 hover:border-amber-400/60 dark:border-white/15"
                      }`}
                    >
                      <span className="block text-sm font-bold">{e.name}</span>
                      <span className="mt-0.5 block text-xs text-stone-600 dark:text-slate-400">
                        {e.company ?? "Independent"}
                        {e.yearsExperience ? ` · ${e.yearsExperience} yrs experience` : ""}
                        {e.specialties ? ` · ${e.specialties}` : ""}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>

            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-semibold" htmlFor="structural-fee">
                Agreed fee (BDT)
              </label>
              <input
                id="structural-fee"
                type="number"
                min={1}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="e.g. 75000"
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-stone-600 dark:text-slate-400">
                Held in escrow and released to the engineer only when you approve their drawings.
              </p>
            </div>

            {error && (
              <p className="mt-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                {error}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !chosen || Number(fee) <= 0}
                onClick={() => chosen && onAppoint(chosen, Number(fee))}
                className={primaryButtonClass}
              >
                {busy ? "Appointing…" : "Appoint engineer"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className={smallButtonClass}>
                Cancel
              </button>
              <Link
                href={`/architects?role=STRUCTURAL_ENGINEER`}
                className="self-center text-xs font-bold text-stone-600 hover:underline dark:text-slate-400"
              >
                Browse full profiles
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Sandbox escrow deposit — same pattern as the design contract's. */
function EscrowForm({
  amountBdt,
  busy,
  onPay,
}: {
  amountBdt: number;
  busy: boolean;
  onPay: (method: string, reference: string) => void;
}) {
  const [method, setMethod] = useState<string>(PaymentMethod.BKASH);
  const [reference, setReference] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onPay(method, reference);
      }}
      className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4"
    >
      <p className="text-sm font-bold">Record a {formatBdt(amountBdt)} escrow deposit</p>
      {/* The "why escrow" explanation lives above the gateway button now, so
          it isn't repeated here. */}
      <p className="mt-1 text-xs text-stone-600 dark:text-slate-400">
        Pick the channel you paid through and enter the transaction reference.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
          <option value={PaymentMethod.BKASH}>bKash</option>
          <option value={PaymentMethod.NAGAD}>Nagad</option>
          <option value={PaymentMethod.BANK}>Bank transfer</option>
        </select>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Transaction reference"
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={busy} className={`mt-3 ${primaryButtonClass}`}>
        {busy ? "Depositing…" : "Fund escrow"}
      </button>
    </form>
  );
}

/** The engineer uploads a set and stamps it with their name. */
function SubmitForm({
  busy,
  revisionsLeft,
  onSubmit,
}: {
  busy: boolean;
  revisionsLeft: number;
  onSubmit: (input: { title: string; note?: string; fileUrl: string; signature: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ title, note: note.trim() || undefined, fileUrl, signature });
      }}
      className="mt-4 flex flex-col gap-3"
    >
      <p className="text-sm font-bold">Submit a drawing set</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        minLength={3}
        maxLength={160}
        placeholder="e.g. Foundation and column layout, rev A"
        className={inputClass}
      />
      <input
        value={fileUrl}
        onChange={(e) => setFileUrl(e.target.value)}
        required
        placeholder="Link to the drawings (Drive, Dropbox, or an uploaded file URL)"
        className={inputClass}
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="Notes for the owner, assumptions, soil data used, anything outstanding"
        className={inputClass}
      />

      {/* The stamp. An unsigned structural drawing isn't something an owner
          should be asked to approve, so the API requires this too. */}
      <label className="flex items-start gap-3 rounded-xl bg-stone-500/5 p-3 dark:bg-white/5">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 size-4 accent-amber-500"
        />
        <span className="text-xs text-stone-600 dark:text-slate-400">
          I certify that this drawing set is my own work and complies with the Bangladesh National
          Building Code for this structure.
        </span>
      </label>
      <input
        value={signature}
        onChange={(e) => setSignature(e.target.value)}
        required
        minLength={2}
        maxLength={120}
        placeholder="Type your full name to certify"
        className={inputClass}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !agreed} className={primaryButtonClass}>
          {busy ? "Submitting…" : "Submit drawings"}
        </button>
        <span className="text-xs text-stone-500 dark:text-slate-500">
          {revisionsLeft} revision {revisionsLeft === 1 ? "round" : "rounds"} left
        </span>
      </div>
    </form>
  );
}

/** The owner approves or sends the set back. */
function ReviewForm({
  busy,
  revisionsLeft,
  feeBdt,
  commissionRate,
  onDecide,
}: {
  busy: boolean;
  revisionsLeft: number;
  feeBdt: number;
  commissionRate: number;
  onDecide: (decision: "approve" | "request-changes", note?: string) => void;
}) {
  const [note, setNote] = useState("");
  const release = feeBdt - Math.round(feeBdt * commissionRate);

  return (
    <div className="mt-4 rounded-2xl border border-sky-400/40 bg-sky-400/10 p-4">
      <p className="text-sm font-bold">Review the drawings</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="Your note to the engineer (required if you're asking for changes)"
        className={`mt-3 ${inputClass}`}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide("approve", note.trim() || undefined)}
          className={primaryButtonClass}
        >
          {busy ? "Working…" : `Approve, release ${formatBdt(release)}`}
        </button>
        <button
          type="button"
          disabled={busy || revisionsLeft <= 0}
          onClick={() => onDecide("request-changes", note.trim() || undefined)}
          className={smallButtonClass}
        >
          {revisionsLeft > 0 ? `Request changes (${revisionsLeft} left)` : "No revisions left"}
        </button>
      </div>
      <p className="mt-2 text-xs text-stone-600 dark:text-slate-400">
        Approving releases the fee minus {Math.round(commissionRate * 100)}% platform commission,
        and moves the project to the permit stage.
      </p>
    </div>
  );
}

/** The architect annotates the open set — a note, never a decision. */
function CommentForm({
  busy,
  existing,
  onComment,
}: {
  busy: boolean;
  existing?: string;
  onComment: (note: string) => void;
}) {
  const [note, setNote] = useState(existing ?? "");

  return (
    <div className="mt-4 rounded-2xl border border-black/10 p-4 dark:border-white/15">
      <p className="text-sm font-bold">Your note on these drawings</p>
      <p className="mt-1 text-xs text-stone-600 dark:text-slate-400">
        The owner decides whether to approve, but they and the engineer both see what you write, say
        if the structure clashes with your design.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={1000}
        className={`mt-3 ${inputClass}`}
      />
      <button
        type="button"
        disabled={busy || note.trim().length < 2}
        onClick={() => onComment(note.trim())}
        className={`mt-3 ${smallButtonClass}`}
      >
        {existing ? "Update note" : "Leave note"}
      </button>
    </div>
  );
}

/** Either side calls it off; anything in escrow goes back to the owner. */
function CancelForm({
  busy,
  hasEscrow,
  onCancel,
}: {
  busy: boolean;
  hasEscrow: boolean;
  onCancel: (reason?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 text-xs font-bold text-stone-500 hover:text-rose-600 hover:underline dark:text-slate-500 dark:hover:text-rose-400"
      >
        Cancel this engagement
      </button>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-rose-400/40 bg-rose-400/10 p-4">
      <p className="text-sm font-bold">Cancel the engagement</p>
      <p className="mt-1 text-xs text-stone-600 dark:text-slate-400">
        {hasEscrow
          ? "Everything held in escrow is refunded to the owner, and the project can take on another engineer."
          : "Nothing has been deposited yet."}
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        placeholder="Reason (optional), the other side sees this"
        className={`mt-3 ${inputClass}`}
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onCancel(reason.trim() || undefined)}
          className="rounded-full bg-rose-500 px-5 py-2 text-xs font-bold text-white transition hover:bg-rose-400 disabled:opacity-60"
        >
          {busy ? "Cancelling…" : "Confirm cancellation"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={smallButtonClass}>
          Keep it
        </button>
      </div>
    </div>
  );
}
