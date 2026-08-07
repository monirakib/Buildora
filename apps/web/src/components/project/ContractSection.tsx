"use client";

import { useState } from "react";
import {
  ContractStatus,
  DeliverableStatus,
  PaymentKind,
  PaymentMethod,
  type Contract,
} from "@buildora/shared";
import {
  cancelContract,
  decideDeliverable,
  fundEscrow,
  payConceptFee,
  submitDeliverable,
} from "@/lib/apiProjects";
import { formatBdt, formatDate } from "@/components/app/projectStatus";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

const statusLabels: Record<ContractStatus, string> = {
  [ContractStatus.AWAITING_CONCEPT_FEE]: "Awaiting concept fee",
  [ContractStatus.CONCEPT_IN_PROGRESS]: "Concept in progress",
  [ContractStatus.AWAITING_ESCROW]: "Awaiting escrow deposit",
  [ContractStatus.DESIGN_IN_PROGRESS]: "Design in progress",
  [ContractStatus.COMPLETED]: "Completed",
  [ContractStatus.CANCELLED]: "Cancelled",
};

const paymentKindLabels: Record<PaymentKind, string> = {
  [PaymentKind.CONCEPT_FEE]: "Concept fee paid",
  [PaymentKind.ESCROW_DEPOSIT]: "Escrow funded",
  [PaymentKind.ESCROW_RELEASE]: "Released to architect",
  [PaymentKind.REFUND]: "Refunded",
};

const deliverableStatusStyles: Record<DeliverableStatus, string> = {
  [DeliverableStatus.PENDING_REVIEW]: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  [DeliverableStatus.CHANGES_REQUESTED]: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  [DeliverableStatus.APPROVED]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

const deliverableStatusLabels: Record<DeliverableStatus, string> = {
  [DeliverableStatus.PENDING_REVIEW]: "Awaiting review",
  [DeliverableStatus.CHANGES_REQUESTED]: "Changes requested",
  [DeliverableStatus.APPROVED]: "Approved",
};

/**
 * Sandbox payment form — the payer picks bKash/Nagad/bank and types the
 * transaction reference they paid with. A real gateway would replace this.
 */
function PaymentForm({
  label,
  amountBdt,
  onPay,
  busy,
}: {
  label: string;
  amountBdt: number;
  onPay: (method: string, reference: string) => void;
  busy: boolean;
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
      <p className="font-bold">
        {label}: {formatBdt(amountBdt)}
      </p>
      <p className="mt-1 text-xs text-stone-600 dark:text-slate-400">
        Sandbox payment — pick a channel and enter the transaction reference.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className={inputClass}
          aria-label="Payment method"
        >
          <option value={PaymentMethod.BKASH}>bKash</option>
          <option value={PaymentMethod.NAGAD}>Nagad</option>
          <option value={PaymentMethod.BANK}>Bank transfer</option>
        </select>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          required
          minLength={4}
          placeholder="TrxID e.g. 9H7XK2M1PQ"
          className={inputClass}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
        >
          {busy ? "Paying…" : "Pay now"}
        </button>
      </div>
    </form>
  );
}

/**
 * The design contract panel: fee summary, phase-appropriate action (pay
 * concept fee → review concept → fund escrow → review design), the
 * deliverables list, and the payment ledger.
 */
export function ContractSection({
  contract,
  token,
  isClient,
  isArchitect,
  onChanged,
}: {
  contract: Contract;
  token: string;
  isClient: boolean;
  isArchitect: boolean;
  onChanged: (contract: Contract) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Architect's submission form.
  const [sub, setSub] = useState({ title: "", note: "", fileUrl: "" });
  // Client's change-request note, keyed by deliverable index.
  const [reviewNote, setReviewNote] = useState("");

  async function run(action: () => Promise<Contract>) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await action());
      setSub({ title: "", note: "", fileUrl: "" });
      setReviewNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    isArchitect &&
    (contract.status === ContractStatus.CONCEPT_IN_PROGRESS ||
      contract.status === ContractStatus.DESIGN_IN_PROGRESS) &&
    !contract.deliverables.some((d) => d.status === DeliverableStatus.PENDING_REVIEW);

  const cancellable =
    isClient &&
    [
      ContractStatus.AWAITING_CONCEPT_FEE,
      ContractStatus.CONCEPT_IN_PROGRESS,
      ContractStatus.AWAITING_ESCROW,
    ].includes(contract.status);

  return (
    <section>
      <h2 className="text-xl font-extrabold tracking-tight">Design contract & escrow</h2>

      <div className={`mt-4 ${cardClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-600 dark:text-slate-400">
            {contract.architect.name}
            {contract.architect.company ? ` · ${contract.architect.company}` : ""} for{" "}
            {contract.client.name}
          </p>
          <span className="rounded-full bg-stone-900/90 px-3 py-1 text-xs font-bold text-white dark:bg-white/15">
            {statusLabels[contract.status]}
          </span>
        </div>

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-2xl bg-black/5 p-3 dark:bg-white/5">
            <p className="text-xs text-stone-500 dark:text-slate-500">Concept fee</p>
            <p className="mt-0.5 font-bold">{formatBdt(contract.conceptFeeBdt)}</p>
          </div>
          <div className="rounded-2xl bg-black/5 p-3 dark:bg-white/5">
            <p className="text-xs text-stone-500 dark:text-slate-500">Design fee (escrow)</p>
            <p className="mt-0.5 font-bold">{formatBdt(contract.designFeeBdt)}</p>
          </div>
          <div className="rounded-2xl bg-black/5 p-3 dark:bg-white/5">
            <p className="text-xs text-stone-500 dark:text-slate-500">Revision rounds</p>
            <p className="mt-0.5 font-bold">
              {contract.revisionsUsed} / {contract.maxRevisions} used
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        )}

        {/* Phase actions ------------------------------------------------- */}

        {isClient && contract.status === ContractStatus.AWAITING_CONCEPT_FEE && (
          <PaymentForm
            label="Pay the concept fee to start"
            amountBdt={contract.conceptFeeBdt}
            busy={busy}
            onPay={(method, reference) =>
              run(() => payConceptFee(token, contract.id, { method, reference }))
            }
          />
        )}

        {isArchitect && contract.status === ContractStatus.AWAITING_CONCEPT_FEE && (
          <p className="mt-4 text-sm text-stone-600 dark:text-slate-400">
            Waiting for the client to pay the concept fee — you&apos;ll be able to submit the
            concept once it&apos;s paid.
          </p>
        )}

        {isClient && contract.status === ContractStatus.AWAITING_ESCROW && (
          <PaymentForm
            label="Deposit the design fee into escrow"
            amountBdt={contract.designFeeBdt}
            busy={busy}
            onPay={(method, reference) =>
              run(() => fundEscrow(token, contract.id, { method, reference }))
            }
          />
        )}

        {isArchitect && contract.status === ContractStatus.AWAITING_ESCROW && (
          <p className="mt-4 text-sm text-stone-600 dark:text-slate-400">
            Concept approved 🎉 — waiting for the client to fund the escrow before full design
            begins.
          </p>
        )}

        {contract.status === ContractStatus.COMPLETED && (
          <div className="mt-4 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-4 text-sm">
            <p className="font-bold text-emerald-700 dark:text-emerald-300">
              Design approved — escrow released
            </p>
            <p className="mt-1 text-stone-700 dark:text-slate-300">
              {formatBdt(contract.releasedToArchitectBdt ?? 0)} went to the architect;{" "}
              {formatBdt(contract.commissionBdt ?? 0)} platform commission (
              {Math.round(contract.commissionRate * 100)}%).
            </p>
          </div>
        )}

        {contract.status === ContractStatus.CANCELLED && (
          <p className="mt-4 text-sm text-stone-600 dark:text-slate-400">
            This contract was cancelled. The brief is open to new proposals again.
          </p>
        )}

        {/* Deliverables --------------------------------------------------- */}

        {contract.deliverables.length > 0 && (
          <div className="mt-6">
            <h3 className="font-bold">Submissions</h3>
            <ul className="mt-3 flex flex-col gap-3">
              {contract.deliverables.map((d, i) => (
                <li key={i} className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      <span className="mr-2 rounded bg-black/10 px-1.5 py-0.5 text-[11px] font-bold uppercase dark:bg-white/10">
                        {d.kind === "CONCEPT" ? "Concept" : "Design"}
                      </span>
                      {d.title}
                    </p>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${deliverableStatusStyles[d.status]}`}
                    >
                      {deliverableStatusLabels[d.status]}
                    </span>
                  </div>
                  {d.note && (
                    <p className="mt-2 text-sm whitespace-pre-line text-stone-700 dark:text-slate-300">
                      {d.note}
                    </p>
                  )}
                  {d.fileUrl && (
                    <a
                      href={d.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-sm font-semibold text-amber-600 underline underline-offset-2 dark:text-amber-400"
                    >
                      Open attached file ↗
                    </a>
                  )}
                  {d.clientNote && (
                    <p className="mt-2 rounded-xl bg-black/5 px-3 py-2 text-sm text-stone-700 dark:bg-white/5 dark:text-slate-300">
                      <span className="font-semibold">Client:</span> {d.clientNote}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">
                    Submitted {formatDate(d.submittedAt)}
                  </p>

                  {/* The client reviews the pending submission here. */}
                  {isClient && d.status === DeliverableStatus.PENDING_REVIEW && (
                    <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
                      <textarea
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        rows={2}
                        placeholder="Feedback for the architect (required when requesting changes)"
                        className={inputClass}
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              decideDeliverable(token, contract.id, i, {
                                action: "approve",
                                note: reviewNote,
                              })
                            )
                          }
                          className="rounded-full bg-emerald-500 px-5 py-2 text-xs font-bold text-white transition hover:bg-emerald-400 disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busy || reviewNote.trim().length === 0}
                          onClick={() =>
                            run(() =>
                              decideDeliverable(token, contract.id, i, {
                                action: "request-changes",
                                note: reviewNote,
                              })
                            )
                          }
                          className="rounded-full border border-stone-300 px-5 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          Request changes
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Architect submits the next piece of work. */}
        {canSubmit && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => submitDeliverable(token, contract.id, sub));
            }}
            className="mt-6 rounded-2xl border border-sky-400/40 bg-sky-400/10 p-4"
          >
            <p className="font-bold">
              Submit the{" "}
              {contract.status === ContractStatus.CONCEPT_IN_PROGRESS ? "concept" : "design"} for
              review
            </p>
            <div className="mt-3 flex flex-col gap-3">
              <input
                value={sub.title}
                onChange={(e) => setSub((s) => ({ ...s, title: e.target.value }))}
                required
                placeholder="Title, e.g. Concept plan v1"
                className={inputClass}
              />
              <textarea
                value={sub.note}
                onChange={(e) => setSub((s) => ({ ...s, note: e.target.value }))}
                rows={2}
                placeholder="Notes for the client (optional)"
                className={inputClass}
              />
              <input
                type="url"
                value={sub.fileUrl}
                onChange={(e) => setSub((s) => ({ ...s, fileUrl: e.target.value }))}
                placeholder="Link to the file — Drive/Dropbox/uploaded image URL (optional)"
                className={inputClass}
              />
              <button
                type="submit"
                disabled={busy}
                className="self-start rounded-full bg-sky-500 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-sky-400 disabled:opacity-60"
              >
                {busy ? "Submitting…" : "Submit for review"}
              </button>
            </div>
          </form>
        )}

        {/* Ledger ---------------------------------------------------------- */}

        {contract.payments.length > 0 && (
          <div className="mt-6">
            <h3 className="font-bold">Payment ledger</h3>
            <ul className="mt-2 divide-y divide-black/10 text-sm dark:divide-white/10">
              {contract.payments.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {paymentKindLabels[p.kind]}
                    {p.method && (
                      <span className="text-stone-500 dark:text-slate-500">
                        {" "}
                        · {p.method.toLowerCase()}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <strong>{formatBdt(p.amountBdt)}</strong>
                    <span className="text-xs text-stone-500 dark:text-slate-500">
                      {formatDate(p.at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {cancellable && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Cancel this contract? The brief re-opens to new proposals.")) {
                run(() => cancelContract(token, contract.id));
              }
            }}
            className="mt-6 text-xs font-semibold text-rose-600 underline underline-offset-2 hover:text-rose-500 dark:text-rose-400"
          >
            Cancel contract
          </button>
        )}
      </div>
    </section>
  );
}
