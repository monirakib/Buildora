"use client";

import { useEffect, useState } from "react";
import {
  PERMIT_CHECKLISTS,
  PermitApplicationStatus,
  PermitType,
  type PermitApplication,
  type Project,
} from "@buildora/shared";
import {
  addPermitDocument,
  createPermitApplication,
  listPermitApplications,
  removePermitDocument,
  updatePermitApplication,
} from "@/lib/apiPermitApplications";
import { uploadDocument } from "@/lib/api";
import { formatDate } from "@/components/app/projectStatus";
import { PermitDocumentChecklist } from "./PermitDocumentChecklist";

const cardClass =
  "rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const PERMIT_TYPE_LABELS: Record<PermitType, string> = {
  [PermitType.PLANNING_PERMIT]: "Planning Permit (Land Use Clearance)",
  [PermitType.CONSTRUCTION_PERMIT]: "Construction Permit",
};

const STATUS_LABELS: Record<PermitApplicationStatus, string> = {
  [PermitApplicationStatus.NOT_STARTED]: "Not started",
  [PermitApplicationStatus.SUBMITTED]: "Submitted",
  [PermitApplicationStatus.UNDER_REVIEW]: "Under review",
  [PermitApplicationStatus.APPROVED]: "Approved",
  [PermitApplicationStatus.REJECTED]: "Rejected",
};

const STATUS_TONE: Record<PermitApplicationStatus, string> = {
  [PermitApplicationStatus.NOT_STARTED]:
    "bg-black/10 text-stone-600 dark:bg-white/10 dark:text-slate-300",
  [PermitApplicationStatus.SUBMITTED]: "bg-amber-400/15 text-amber-700 dark:text-amber-300",
  [PermitApplicationStatus.UNDER_REVIEW]: "bg-amber-400/15 text-amber-700 dark:text-amber-300",
  [PermitApplicationStatus.APPROVED]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  [PermitApplicationStatus.REJECTED]: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

/**
 * The project's RAJUK permit tracker: Planning Permit and Construction Permit,
 * side by side. Everything here is what the user reports about their own
 * real-world filing — Buildora has no RAJUK integration — plus whether an
 * admin has manually confirmed it against what they were shown.
 */
export function PermitApplicationsSection({
  project,
  token,
  canEdit,
}: {
  project: Project;
  token: string;
  canEdit: boolean;
}) {
  const [applications, setApplications] = useState<PermitApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPermitApplications(token, project.id)
      .then(setApplications)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load permit tracker"))
      .finally(() => setLoading(false));
  }, [token, project.id]);

  function upsert(app: PermitApplication) {
    setApplications((list) => {
      const exists = list.some((a) => a.id === app.id);
      return exists ? list.map((a) => (a.id === app.id ? app : a)) : [...list, app];
    });
  }

  return (
    <section>
      <h2 className="text-xl font-extrabold tracking-tight">RAJUK permit applications</h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
        Track your real Planning Permit and Construction Permit filings here. Buildora has no
        connection to RAJUK's system — this records what you tell us, which an admin can confirm
        against the documents you upload.
      </p>

      {error && (
        <p className="mt-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-stone-500 dark:text-slate-500">Loading…</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {Object.values(PermitType).map((permitType) => (
            <PermitTypeCard
              key={permitType}
              project={project}
              token={token}
              canEdit={canEdit}
              permitType={permitType}
              application={applications.find((a) => a.permitType === permitType) ?? null}
              onChanged={upsert}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PermitTypeCard({
  project,
  token,
  canEdit,
  permitType,
  application,
  onChanged,
}: {
  project: Project;
  token: string;
  canEdit: boolean;
  permitType: PermitType;
  application: PermitApplication | null;
  onChanged: (app: PermitApplication) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceNumber, setReferenceNumber] = useState(application?.referenceNumber ?? "");
  const [uploadKey, setUploadKey] = useState("");

  useEffect(() => {
    setReferenceNumber(application?.referenceNumber ?? "");
  }, [application?.referenceNumber]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      onChanged(await createPermitApplication(token, project.id, permitType));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start tracking");
    } finally {
      setBusy(false);
    }
  }

  async function saveField(input: { status?: string; referenceNumber?: string }) {
    if (!application) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await updatePermitApplication(token, application.id, input));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    if (!application || !uploadKey) return;
    const checklistItem = PERMIT_CHECKLISTS[permitType].find((i) => i.key === uploadKey);
    if (!checklistItem) return;
    setBusy(true);
    setError(null);
    try {
      const fileUrl = await uploadDocument(token, file);
      onChanged(
        await addPermitDocument(token, application.id, {
          key: uploadKey,
          name: checklistItem.label,
          fileUrl,
        })
      );
      setUploadKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload the document");
    } finally {
      setBusy(false);
    }
  }

  async function removeDocument(key: string) {
    if (!application) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await removePermitDocument(token, application.id, key));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the document");
    } finally {
      setBusy(false);
    }
  }

  const uploadedKeys = new Set(application?.documents.map((d) => d.key) ?? []);
  const missingItems = PERMIT_CHECKLISTS[permitType].filter((i) => !uploadedKeys.has(i.key));

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-extrabold tracking-tight">{PERMIT_TYPE_LABELS[permitType]}</h3>
        {application && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[application.status]}`}
          >
            {STATUS_LABELS[application.status]}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
          {error}
        </p>
      )}

      {!application ? (
        <div className="mt-3">
          <p className="text-sm text-stone-600 dark:text-slate-400">
            Not tracked yet — nothing has been filed for this permit.
          </p>
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={start}
              className="mt-3 rounded-full bg-amber-400 px-5 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
            >
              {busy ? "Starting…" : "Start tracking"}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {application.verifiedByAdmin ? (
            <p className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              Admin-confirmed
              {application.verifiedAt ? ` on ${formatDate(application.verifiedAt)}` : ""}
            </p>
          ) : (
            <p className="rounded-xl border border-stone-300/60 bg-stone-500/5 px-3 py-2 text-xs font-semibold text-stone-600 dark:border-white/10 dark:text-slate-400">
              Not yet confirmed by an admin
            </p>
          )}

          <label className="text-sm">
            <span className="mb-1 block font-semibold">Your RAJUK reference/permit number</span>
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={referenceNumber}
                disabled={!canEdit}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g. RAJUK/2026/..."
              />
              {canEdit && referenceNumber !== (application.referenceNumber ?? "") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => saveField({ referenceNumber })}
                  className="shrink-0 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
                >
                  Save
                </button>
              )}
            </div>
          </label>

          {canEdit && (
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Status (self-reported)</span>
              <select
                className={inputClass}
                value={application.status}
                disabled={busy}
                onChange={(e) => saveField({ status: e.target.value })}
              >
                {Object.values(PermitApplicationStatus).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          )}

          <PermitDocumentChecklist permitType={permitType} documents={application.documents} />

          {application.documents.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-xs">
              {application.documents.map((d) => (
                <li key={d.key} className="flex items-center justify-between gap-2">
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-amber-700 underline underline-offset-2 dark:text-amber-400"
                  >
                    {d.name}
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeDocument(d.key)}
                      className="shrink-0 text-stone-500 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEdit && missingItems.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-stone-300/60 pt-3 dark:border-white/10">
              <label className="text-sm">
                <span className="mb-1 block font-semibold">Upload a document</span>
                <select
                  className={inputClass}
                  value={uploadKey}
                  onChange={(e) => setUploadKey(e.target.value)}
                >
                  <option value="">Choose which document…</option>
                  {missingItems.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              {uploadKey && (
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload(file);
                  }}
                  className="text-xs"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
