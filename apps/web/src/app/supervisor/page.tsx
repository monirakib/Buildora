"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserRole,
  VerificationStatus,
  type ProfessionalProfile,
  type SessionUser,
  type VerificationRequest,
} from "@buildora/shared";
import {
  decideVerificationRequest,
  getVerificationRequest,
  listVerificationRequests,
} from "@/lib/api";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";

const cardClass =
  "rounded-3xl border border-white/40 bg-white/40 backdrop-blur-xl dark:border-white/10 dark:bg-white/5";

const roleLabels: Record<string, string> = {
  ARCHITECT: "Architect",
  STRUCTURAL_ENGINEER: "Structural engineer",
  CONTRACTOR: "Contractor",
  SUPPLIER: "Material supplier",
};

// The three queue tabs, in review order.
const TABS = [
  { status: VerificationStatus.UNDER_REVIEW, label: "Under review" },
  { status: VerificationStatus.APPROVED, label: "Approved" },
  { status: VerificationStatus.REJECTED, label: "Rejected" },
] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Small labelled box used across the detail pane. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
        {label}
      </p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

export default function SupervisorPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [tab, setTab] = useState<VerificationStatus>(VerificationStatus.UNDER_REVIEW);
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [listLoading, setListLoading] = useState(true);

  // Detail pane
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    request: VerificationRequest;
    professional: SessionUser;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Decision form
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    if (!user) router.replace("/auth");
    else if (user.role !== UserRole.ADMIN) router.replace("/dashboard");
  }, [mounted, user, router]);

  const loadList = useCallback(
    async (status: VerificationStatus) => {
      if (!token) return;
      setListLoading(true);
      try {
        setRequests(await listVerificationRequests(token, status));
      } catch {
        setRequests([]);
      } finally {
        setListLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (mounted && user?.role === UserRole.ADMIN) loadList(tab);
  }, [mounted, user, tab, loadList]);

  async function openRequest(id: string) {
    if (!token) return;
    setSelectedId(id);
    setDetail(null);
    setNote("");
    setError(null);
    setDetailLoading(true);
    try {
      setDetail(await getVerificationRequest(token, id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the request");
    } finally {
      setDetailLoading(false);
    }
  }

  async function decide(action: "approve" | "reject") {
    if (!token || !selectedId) return;
    setError(null);
    setDeciding(action);
    try {
      const updated = await decideVerificationRequest(token, selectedId, action, note);
      setDetail((d) => (d ? { ...d, request: updated } : d));
      loadList(tab); // it just left the "under review" queue
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the decision");
    } finally {
      setDeciding(null);
    }
  }

  if (!mounted || !user || user.role !== UserRole.ADMIN) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
          <p className="text-center text-sm text-stone-500 dark:text-slate-500">Loading…</p>
        </main>
      </div>
    );
  }

  const profile = (detail?.professional.profile ?? {}) as ProfessionalProfile;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
            Supervisor
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Verification requests
          </h1>
          <p className="mt-3 max-w-xl text-stone-600 dark:text-slate-400">
            Review each professional&apos;s credentials, education, and portfolio, then approve or
            reject with a note.
          </p>

          {/* Status tabs */}
          <div className="mt-8 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.status}
                type="button"
                onClick={() => {
                  setTab(t.status);
                  setSelectedId(null);
                  setDetail(null);
                }}
                className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                  tab === t.status
                    ? "bg-stone-900 text-white dark:bg-amber-400 dark:text-stone-950"
                    : "border border-stone-300/80 bg-white/50 text-stone-600 backdrop-blur hover:text-stone-900 dark:border-white/15 dark:bg-white/5 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
            {/* ---------- Queue list ---------- */}
            <div className="flex flex-col gap-3">
              {listLoading ? (
                <p className="text-sm text-stone-500 dark:text-slate-500">Loading…</p>
              ) : requests.length === 0 ? (
                <div className={`${cardClass} p-6 text-sm text-stone-600 dark:text-slate-400`}>
                  No {TABS.find((t) => t.status === tab)?.label.toLowerCase()} requests.
                </div>
              ) : (
                requests.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => openRequest(r.id)}
                    className={`${cardClass} p-4 text-left transition hover:border-amber-400/60 ${
                      selectedId === r.id ? "border-amber-500/70 dark:border-amber-400/60" : ""
                    }`}
                  >
                    <p className="font-bold">{r.professional.name}</p>
                    <p className="mt-0.5 text-sm text-stone-600 dark:text-slate-400">
                      {roleLabels[r.professional.role] ?? r.professional.role}
                      {r.professional.company ? ` · ${r.professional.company}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
                      Submitted {formatDate(r.createdAt)}
                    </p>
                  </button>
                ))
              )}
            </div>

            {/* ---------- Detail pane ---------- */}
            <div className={`${cardClass} p-6 sm:p-8`}>
              {!selectedId ? (
                <p className="text-sm text-stone-600 dark:text-slate-400">
                  Select a request to review the professional&apos;s full profile.
                </p>
              ) : detailLoading || !detail ? (
                <p className="text-sm text-stone-500 dark:text-slate-500">{error ?? "Loading…"}</p>
              ) : (
                <div className="flex flex-col gap-6">
                  {/* Who */}
                  <div className="flex items-center gap-4">
                    {profile.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted
                      <img
                        src={profile.avatarUrl}
                        alt=""
                        className="h-14 w-14 rounded-2xl object-cover"
                      />
                    ) : (
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-400 text-lg font-extrabold text-stone-950">
                        {detail.professional.name[0]?.toUpperCase()}
                      </span>
                    )}
                    <div>
                      <h2 className="text-xl font-extrabold tracking-tight">
                        {detail.professional.name}
                      </h2>
                      <p className="text-sm text-stone-600 dark:text-slate-400">
                        {roleLabels[detail.professional.role] ?? detail.professional.role} · @
                        {detail.professional.username}
                      </p>
                    </div>
                  </div>

                  {detail.request.message && (
                    <div className="rounded-xl bg-amber-400/10 px-4 py-3 text-sm">
                      <span className="font-bold">Message to reviewer:</span>{" "}
                      {detail.request.message}
                    </div>
                  )}

                  {/* Contact + credentials — supervisor-only detail */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Email">{detail.professional.email}</Field>
                    <Field label="Phone">{detail.professional.phone || "—"}</Field>
                    <Field label="Firm / company">{profile.company || "—"}</Field>
                    <Field label="Experience">
                      {profile.yearsExperience != null ? `${profile.yearsExperience} years` : "—"}
                    </Field>
                    <Field label="License body">{profile.licenseAuthority || "—"}</Field>
                    <Field label="License number">{profile.licenseNumber || "—"}</Field>
                    {profile.website && (
                      <Field label="Website">
                        <a
                          href={profile.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-600 underline underline-offset-2 dark:text-amber-400"
                        >
                          {profile.website}
                        </a>
                      </Field>
                    )}
                    {profile.specialties && (
                      <Field label="Specialties">{profile.specialties}</Field>
                    )}
                  </div>

                  {profile.bio && <Field label="About">{profile.bio}</Field>}

                  {/* Identity documents (architect verification wizard) */}
                  {(profile.nid || profile.nidFrontUrl || profile.dateOfBirth) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="NID number">{profile.nid || "—"}</Field>
                      <Field label="Date of birth">{profile.dateOfBirth || "—"}</Field>
                      {profile.gender && <Field label="Gender">{profile.gender}</Field>}
                      {profile.currentAddress && (
                        <Field label="Current address">{profile.currentAddress}</Field>
                      )}
                      {profile.permanentAddress && (
                        <Field label="Permanent address">{profile.permanentAddress}</Field>
                      )}
                      <Field label="NID card">
                        <span className="flex gap-3">
                          {profile.nidFrontUrl ? (
                            <a
                              href={profile.nidFrontUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold text-amber-600 underline underline-offset-2 dark:text-amber-400"
                            >
                              Front
                            </a>
                          ) : (
                            "Front missing"
                          )}
                          {profile.nidBackUrl ? (
                            <a
                              href={profile.nidBackUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold text-amber-600 underline underline-offset-2 dark:text-amber-400"
                            >
                              Back
                            </a>
                          ) : (
                            "Back missing"
                          )}
                        </span>
                      </Field>
                    </div>
                  )}

                  {/* License documents */}
                  {(profile.iabCertificateUrl || profile.membershipStatus) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {profile.membershipStatus && (
                        <Field label="Membership status">{profile.membershipStatus}</Field>
                      )}
                      {(profile.licenseIssueDate || profile.licenseExpiryDate) && (
                        <Field label="Validity">
                          {profile.licenseIssueDate || "?"} → {profile.licenseExpiryDate || "?"}
                        </Field>
                      )}
                      <Field label="License documents">
                        <span className="flex flex-wrap gap-3">
                          {[
                            { url: profile.iabCertificateUrl, label: "IAB certificate" },
                            { url: profile.membershipCardUrl, label: "Membership card" },
                            { url: profile.rajukCertificateUrl, label: "RAJUK certificate" },
                          ]
                            .filter((d) => d.url)
                            .map((d) => (
                              <a
                                key={d.label}
                                href={d.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-bold text-amber-600 underline underline-offset-2 dark:text-amber-400"
                              >
                                {d.label}
                              </a>
                            ))}
                        </span>
                      </Field>
                      {profile.rajukEnlistmentNo && (
                        <Field label="RAJUK enlistment no.">{profile.rajukEnlistmentNo}</Field>
                      )}
                    </div>
                  )}

                  {/* Expertise + skills */}
                  {((profile.expertise?.length ?? 0) > 0 || (profile.skills?.length ?? 0) > 0) && (
                    <div>
                      <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                        Expertise &amp; skills
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(profile.expertise ?? []).map((area) => (
                          <span
                            key={area}
                            className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300"
                          >
                            {area}
                          </span>
                        ))}
                        {(profile.skills ?? []).map((s) => (
                          <span
                            key={s.name}
                            className="rounded-full border border-stone-300/60 px-3 py-1 text-xs font-semibold dark:border-white/15"
                          >
                            {s.name} · {s.level.toLowerCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Work experience */}
                  {(profile.experience?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                        Experience
                      </p>
                      <ul className="mt-2 flex flex-col gap-2">
                        {profile.experience!.map((x, i) => (
                          <li
                            key={i}
                            className="rounded-xl border border-stone-300/60 px-4 py-2.5 text-sm dark:border-white/10"
                          >
                            <span className="font-semibold">{x.designation}</span>
                            <span className="text-stone-600 dark:text-slate-400">
                              {" "}
                              — {x.company}
                              {x.startDate ? ` · ${x.startDate}` : ""}
                              {x.isCurrent ? " – present" : x.endDate ? ` – ${x.endDate}` : ""}
                            </span>
                            {x.description && (
                              <p className="mt-0.5 text-stone-600 dark:text-slate-400">
                                {x.description}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Education with certificates */}
                  {(profile.education?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                        Education
                      </p>
                      <ul className="mt-2 flex flex-col gap-2">
                        {profile.education!.map((e, i) => (
                          <li
                            key={i}
                            className="flex flex-wrap items-center gap-x-2 rounded-xl border border-stone-300/60 px-4 py-2.5 text-sm dark:border-white/10"
                          >
                            <span className="font-semibold">{e.degree}</span>
                            <span className="text-stone-600 dark:text-slate-400">
                              — {e.institution}
                              {e.department ? `, ${e.department}` : ""}
                              {e.year ? `, ${e.year}` : ""}
                              {e.cgpa ? ` · CGPA ${e.cgpa}` : ""}
                            </span>
                            {e.certificateUrl && (
                              <a
                                href={e.certificateUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-auto text-xs font-bold text-amber-600 underline underline-offset-2 dark:text-amber-400"
                              >
                                View certificate
                              </a>
                            )}
                            {e.transcriptUrl && (
                              <a
                                href={e.transcriptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-bold text-amber-600 underline underline-offset-2 dark:text-amber-400"
                              >
                                Transcript
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Achievements */}
                  {(profile.achievements?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                        Achievements
                      </p>
                      <ul className="mt-2 flex flex-col gap-2">
                        {profile.achievements!.map((a, i) => (
                          <li
                            key={i}
                            className="rounded-xl border border-stone-300/60 px-4 py-2.5 text-sm dark:border-white/10"
                          >
                            <span className="font-semibold">{a.title}</span>
                            {a.year ? (
                              <span className="text-stone-600 dark:text-slate-400">
                                {" "}
                                ({a.year})
                              </span>
                            ) : null}
                            {a.description && (
                              <p className="mt-0.5 text-stone-600 dark:text-slate-400">
                                {a.description}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Portfolio */}
                  {(profile.portfolio?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                        Portfolio
                      </p>
                      <div className="mt-2 flex flex-col gap-3">
                        {profile.portfolio!.map((p, i) => (
                          <div
                            key={i}
                            className="rounded-xl border border-stone-300/60 px-4 py-3 dark:border-white/10"
                          >
                            <p className="text-sm font-semibold">
                              {p.title}
                              <span className="font-normal text-stone-600 dark:text-slate-400">
                                {p.location ? ` · ${p.location}` : ""}
                                {p.year ? ` · ${p.year}` : ""}
                              </span>
                            </p>
                            {p.description && (
                              <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                                {p.description}
                              </p>
                            )}
                            {p.imageUrls.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {p.imageUrls.map((url) => (
                                  <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */}
                                    <img
                                      src={url}
                                      alt=""
                                      className="h-20 w-20 rounded-lg object-cover transition hover:opacity-80"
                                    />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Signed declaration */}
                  {profile.declarationSignature && (
                    <div className="rounded-xl bg-emerald-400/10 px-4 py-3 text-sm">
                      <span className="font-bold">Declaration signed:</span>{" "}
                      <span className="font-serif italic">{profile.declarationSignature}</span>
                      {profile.declarationSignedAt ? ` — ${profile.declarationSignedAt}` : ""}
                    </div>
                  )}

                  {/* Decision */}
                  {detail.request.status === VerificationStatus.UNDER_REVIEW ? (
                    <div className="border-t border-stone-300/60 pt-5 dark:border-white/10">
                      <label htmlFor="note" className="mb-1.5 block text-sm font-semibold">
                        Decision note{" "}
                        <span className="font-medium text-stone-500 dark:text-slate-400">
                          (shown to the professional)
                        </span>
                      </label>
                      <textarea
                        id="note"
                        rows={2}
                        maxLength={1000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. License checked against the IAB registry."
                        className="block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500"
                      />
                      {error && (
                        <p className="mt-3 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                          {error}
                        </p>
                      )}
                      <div className="mt-4 flex gap-3">
                        <button
                          type="button"
                          disabled={deciding !== null}
                          onClick={() => decide("approve")}
                          className="rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-emerald-400 disabled:opacity-60"
                        >
                          {deciding === "approve" ? "Approving…" : "Approve"}
                        </button>
                        <button
                          type="button"
                          disabled={deciding !== null}
                          onClick={() => decide("reject")}
                          className="rounded-full bg-rose-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-rose-400 disabled:opacity-60"
                        >
                          {deciding === "reject" ? "Rejecting…" : "Reject"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`rounded-xl px-4 py-3 text-sm font-medium ${
                        detail.request.status === VerificationStatus.APPROVED
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300"
                      }`}
                    >
                      {detail.request.status === VerificationStatus.APPROVED
                        ? "Approved"
                        : "Rejected"}
                      {detail.request.decidedAt
                        ? ` on ${formatDate(detail.request.decidedAt)}`
                        : ""}
                      {detail.request.note ? ` — "${detail.request.note}"` : ""}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
