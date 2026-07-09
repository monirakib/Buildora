"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserRole,
  VerificationStatus,
  type ProfessionalProfile,
  type SessionUser,
  type VerificationRequest,
} from "@buildora/shared";
import {
  getMyVerification,
  submitVerification,
  updateProfessionalProfile,
  uploadImage,
  type ProfessionalProfileInput,
} from "@/lib/api";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const labelClass = "mb-1.5 block text-sm font-semibold";

/** Liquid-glass card, same surface as the land-owner profile page. */
const sectionClass =
  "relative overflow-hidden rounded-3xl border border-white/40 bg-white/30 p-6 shadow-2xl shadow-black/10 backdrop-blur-2xl backdrop-saturate-150 sm:p-8 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-40 before:bg-linear-to-b before:from-white/40 before:to-transparent before:content-[''] dark:border-white/15 dark:bg-white/10 dark:shadow-black/40 dark:before:from-white/15";

/** Subtle bordered box for one entry inside a list section. */
const entryClass =
  "rounded-2xl border border-stone-300/60 bg-white/40 p-4 dark:border-white/10 dark:bg-white/5";

const removeButtonClass =
  "text-xs font-bold text-stone-500 transition hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400";

const addButtonClass =
  "self-start rounded-full border border-stone-300/80 bg-white/50 px-5 py-2 text-sm font-bold text-stone-700 backdrop-blur transition hover:border-amber-500 hover:text-amber-600 dark:border-white/15 dark:bg-white/5 dark:text-slate-300 dark:hover:border-amber-400 dark:hover:text-amber-300";

// List entries are edited as strings (like every other form here); numbers are
// converted right before the save request.
const emptyEducation = { degree: "", institution: "", year: "", certificateUrl: "" };
const emptyAchievement = { title: "", year: "", description: "" };
const emptyProject = { title: "", description: "", year: "", location: "", imageUrls: [] as string[] };

type EducationForm = typeof emptyEducation;
type AchievementForm = typeof emptyAchievement;
type ProjectForm = { title: string; description: string; year: string; location: string; imageUrls: string[] };

function formFromUser(user: SessionUser) {
  const p = (user.profile ?? {}) as ProfessionalProfile;
  return {
    name: user.name,
    phone: user.phone ?? "",
    avatarUrl: p.avatarUrl ?? "",
    company: p.company ?? "",
    bio: p.bio ?? "",
    licenseAuthority: p.licenseAuthority ?? "",
    licenseNumber: p.licenseNumber ?? "",
    specialties: p.specialties ?? "",
    yearsExperience: p.yearsExperience?.toString() ?? "",
    website: p.website ?? "",
    education: (p.education ?? []).map((e) => ({
      degree: e.degree,
      institution: e.institution,
      year: e.year?.toString() ?? "",
      certificateUrl: e.certificateUrl ?? "",
    })),
    achievements: (p.achievements ?? []).map((a) => ({
      title: a.title,
      year: a.year?.toString() ?? "",
      description: a.description ?? "",
    })),
    portfolio: (p.portfolio ?? []).map((pr) => ({
      title: pr.title,
      description: pr.description ?? "",
      year: pr.year?.toString() ?? "",
      location: pr.location ?? "",
      imageUrls: pr.imageUrls ?? [],
    })),
  };
}

type FormState = ReturnType<typeof formFromUser>;

/** Converts the string-based form into the API payload. */
function toPayload(form: FormState): ProfessionalProfileInput {
  const num = (s: string) => (s === "" ? undefined : Number(s));
  return {
    ...form,
    education: form.education.map((e) => ({
      degree: e.degree,
      institution: e.institution,
      year: num(e.year),
      certificateUrl: e.certificateUrl || undefined,
    })),
    achievements: form.achievements.map((a) => ({
      title: a.title,
      year: num(a.year),
      description: a.description || undefined,
    })),
    portfolio: form.portfolio.map((p) => ({
      title: p.title,
      description: p.description || undefined,
      year: num(p.year),
      location: p.location || undefined,
      imageUrls: p.imageUrls,
    })),
  };
}

/**
 * Hidden file input + button. Picks an image, uploads it through the API to
 * Cloudinary, and hands the hosted URL back via onUploaded.
 */
function UploadButton({
  label,
  onUploaded,
  onError,
}: {
  label: string;
  onUploaded: (url: string) => void;
  onError: (message: string) => void;
}) {
  const token = useSession((s) => s.token);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file || !token) return;
    setBusy(true);
    try {
      onUploaded(await uploadImage(token, file));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="rounded-full border border-stone-300/80 bg-white/50 px-4 py-1.5 text-xs font-bold text-stone-700 backdrop-blur transition hover:border-amber-500 hover:text-amber-600 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-300 dark:hover:border-amber-400 dark:hover:text-amber-300"
      >
        {busy ? "Uploading…" : label}
      </button>
    </>
  );
}

/** Verification state chip shown in the header and the verification card. */
function StatusChip({ status }: { status: VerificationStatus }) {
  if (status === VerificationStatus.APPROVED) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
        Platform Verified
      </span>
    );
  }
  if (status === VerificationStatus.UNDER_REVIEW) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
        Under review
      </span>
    );
  }
  if (status === VerificationStatus.REJECTED) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-stone-500/10 px-2.5 py-1 text-xs font-semibold text-stone-500 dark:bg-white/10 dark:text-slate-400">
      Not verified yet
    </span>
  );
}

const PROFESSIONAL_ROLES: UserRole[] = [
  UserRole.ARCHITECT,
  UserRole.STRUCTURAL_ENGINEER,
  UserRole.CONTRACTOR,
  UserRole.SUPPLIER,
];

export default function ProfessionalProfilePage() {
  const router = useRouter();
  const { user, token, setSession } = useSession();

  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Verification request state
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [verifyMessage, setVerifyMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // After hydration: only professionals belong here; land owners have /profile.
  useEffect(() => {
    if (!mounted) return;
    if (!user) {
      router.replace("/auth/professional");
      return;
    }
    if (!PROFESSIONAL_ROLES.includes(user.role)) {
      router.replace("/profile");
      return;
    }
    setForm((f) => f ?? formFromUser(user));
  }, [mounted, user, router]);

  // Load their latest verification request (for the status card).
  useEffect(() => {
    if (!mounted || !token || !user || !PROFESSIONAL_ROLES.includes(user.role)) return;
    getMyVerification(token)
      .then(setRequest)
      .catch(() => {}); // non-critical — the card just shows the user status
  }, [mounted, token, user]);

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setSaved(false);
      setForm((f) => (f ? { ...f, [field]: e.target.value } : f));
    };

  /** Immutable update helpers for the three list sections. */
  function updateList<K extends "education" | "achievements" | "portfolio">(
    key: K,
    updater: (list: FormState[K]) => FormState[K]
  ) {
    setSaved(false);
    setForm((f) => (f ? { ...f, [key]: updater(f[key]) } : f));
  }

  function setEntry<K extends "education" | "achievements" | "portfolio">(
    key: K,
    index: number,
    patch: Partial<FormState[K][number]>
  ) {
    updateList(key, (list) =>
      list.map((item, i) => (i === index ? { ...item, ...patch } : item)) as FormState[K]
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !token) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateProfessionalProfile(token, toPayload(form));
      setSession(updated, token);
      setSaved(true);
    } catch (err) {
      if (err instanceof TypeError) {
        setError("Can't reach the server. Please try again in a moment.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitVerification() {
    if (!token) return;
    setVerifyError(null);
    setSubmitting(true);
    try {
      const req = await submitVerification(token, verifyMessage);
      setRequest(req);
      // The account status changed to UNDER_REVIEW — reflect it in the session.
      if (user) {
        setSession({ ...user, verificationStatus: VerificationStatus.UNDER_REVIEW }, token);
      }
      setVerifyMessage("");
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Couldn't submit the request");
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted || !form || !user) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
          <p className="text-center text-sm text-stone-500 dark:text-slate-500">Loading…</p>
        </main>
      </div>
    );
  }

  const hasLicense = form.licenseAuthority.trim() !== "" && form.licenseNumber.trim() !== "";
  const underReview = user.verificationStatus === VerificationStatus.UNDER_REVIEW;
  const approved = user.verificationStatus === VerificationStatus.APPROVED;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      {/* pt-28 clears the fixed navbar (top-4 + h-14) */}
      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          {/* Identity header */}
          <div className="flex items-center gap-4">
            {form.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-hosted Cloudinary image
              <img
                src={form.avatarUrl}
                alt=""
                className="h-16 w-16 rounded-3xl object-cover"
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-3xl bg-amber-400 text-xl font-extrabold text-stone-950">
                {user.name
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase())
                  .join("")}
              </span>
            )}
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{user.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-600 dark:text-slate-400">
                <span>@{user.username}</span>
                <StatusChip status={user.verificationStatus} />
              </div>
            </div>
          </div>

          {/* ---------- Verification card ---------- */}
          <div className={`${sectionClass} mt-8`}>
            <div className="relative z-10">
              <h2 className="text-lg font-bold">Verification</h2>

              {approved ? (
                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                  You&apos;re Platform Verified — clients see the badge on your profile and in
                  the directory.
                </p>
              ) : underReview ? (
                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                  Your request is with a supervisor. You&apos;ll see the outcome here once
                  it&apos;s reviewed.
                </p>
              ) : (
                <>
                  {request?.status === VerificationStatus.REJECTED && (
                    <div className="mt-3 rounded-xl bg-rose-100 px-4 py-3 text-sm text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                      <p className="font-bold">Your last request was rejected.</p>
                      {request.note && <p className="mt-1">Supervisor&apos;s note: {request.note}</p>}
                      <p className="mt-1">Update your profile and submit again.</p>
                    </div>
                  )}
                  <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                    Fill in your license body and number (plus education and portfolio — the
                    more complete, the better), save, then send your profile for review.
                  </p>
                  {!hasLicense && (
                    <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                      Add your license body and license number below to enable this.
                    </p>
                  )}
                  <textarea
                    value={verifyMessage}
                    onChange={(e) => setVerifyMessage(e.target.value)}
                    maxLength={1000}
                    rows={2}
                    placeholder="Optional message to the supervisor…"
                    className={`${inputClass} mt-4`}
                  />
                  {verifyError && (
                    <p className="mt-3 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                      {verifyError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleSubmitVerification}
                    disabled={submitting || !hasLicense}
                    className="mt-4 rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 shadow-lg transition hover:bg-amber-300 disabled:opacity-50"
                  >
                    {submitting ? "Sending…" : "Send verification request"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ---------- Profile editor ---------- */}
          <form onSubmit={handleSave} className="mt-6 flex flex-col gap-6">
            {/* Basics */}
            <div className={sectionClass}>
              <div className="relative z-10 flex flex-col gap-4">
                <h2 className="text-lg font-bold">Basics</h2>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">Profile photo</span>
                  <UploadButton
                    label={form.avatarUrl ? "Replace photo" : "Upload photo"}
                    onUploaded={(url) => setForm((f) => (f ? { ...f, avatarUrl: url } : f))}
                    onError={setError}
                  />
                  {form.avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => (f ? { ...f, avatarUrl: "" } : f))}
                      className={removeButtonClass}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="name" className={labelClass}>
                      Full name
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      minLength={2}
                      value={form.name}
                      onChange={set("name")}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className={labelClass}>
                      Phone
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      value={form.phone}
                      onChange={set("phone")}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="company" className={labelClass}>
                    Firm / company
                  </label>
                  <input
                    id="company"
                    type="text"
                    required
                    minLength={2}
                    value={form.company}
                    onChange={set("company")}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="bio" className={labelClass}>
                    About you
                  </label>
                  <textarea
                    id="bio"
                    rows={4}
                    maxLength={1000}
                    value={form.bio}
                    onChange={set("bio")}
                    placeholder="Your practice, design philosophy, notable work…"
                    className={inputClass}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="specialties" className={labelClass}>
                      Specialties
                    </label>
                    <input
                      id="specialties"
                      type="text"
                      placeholder="e.g. Residential towers, RCC design"
                      value={form.specialties}
                      onChange={set("specialties")}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="yearsExperience" className={labelClass}>
                      Experience (yrs)
                    </label>
                    <input
                      id="yearsExperience"
                      type="number"
                      min={0}
                      max={80}
                      value={form.yearsExperience}
                      onChange={set("yearsExperience")}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="website" className={labelClass}>
                    Website
                  </label>
                  <input
                    id="website"
                    type="url"
                    placeholder="https://…"
                    value={form.website}
                    onChange={set("website")}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Credentials */}
            <div className={sectionClass}>
              <div className="relative z-10 flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-bold">Credentials</h2>
                  <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                    These are what the supervisor verifies. They&apos;re never shown publicly.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="licenseAuthority" className={labelClass}>
                      License body
                    </label>
                    <input
                      id="licenseAuthority"
                      type="text"
                      placeholder="IAB / IEB / RAJUK"
                      value={form.licenseAuthority}
                      onChange={set("licenseAuthority")}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="licenseNumber" className={labelClass}>
                      License no.
                    </label>
                    <input
                      id="licenseNumber"
                      type="text"
                      value={form.licenseNumber}
                      onChange={set("licenseNumber")}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Education */}
            <div className={sectionClass}>
              <div className="relative z-10 flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-bold">Education</h2>
                  <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                    Degrees and qualifications, with certificate images for the supervisor.
                  </p>
                </div>

                {form.education.map((entry, i) => (
                  <div key={i} className={entryClass}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold">Qualification {i + 1}</p>
                      <button
                        type="button"
                        onClick={() =>
                          updateList("education", (l) => l.filter((_, j) => j !== i))
                        }
                        className={removeButtonClass}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        required
                        placeholder="Degree — e.g. B.Arch"
                        value={entry.degree}
                        onChange={(e) => setEntry("education", i, { degree: e.target.value })}
                        className={inputClass}
                      />
                      <input
                        type="text"
                        required
                        placeholder="Institution — e.g. BUET"
                        value={entry.institution}
                        onChange={(e) =>
                          setEntry("education", i, { institution: e.target.value })
                        }
                        className={inputClass}
                      />
                      <input
                        type="number"
                        min={1950}
                        max={2100}
                        placeholder="Year"
                        value={entry.year}
                        onChange={(e) => setEntry("education", i, { year: e.target.value })}
                        className={inputClass}
                      />
                      <div className="flex items-center gap-2">
                        <UploadButton
                          label={entry.certificateUrl ? "Replace certificate" : "Upload certificate"}
                          onUploaded={(url) =>
                            setEntry("education", i, { certificateUrl: url })
                          }
                          onError={setError}
                        />
                        {entry.certificateUrl && (
                          <a
                            href={entry.certificateUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-amber-600 underline underline-offset-2 dark:text-amber-400"
                          >
                            View
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {form.education.length < 10 && (
                  <button
                    type="button"
                    onClick={() =>
                      updateList("education", (l) => [...l, { ...emptyEducation }])
                    }
                    className={addButtonClass}
                  >
                    + Add qualification
                  </button>
                )}
              </div>
            </div>

            {/* Achievements */}
            <div className={sectionClass}>
              <div className="relative z-10 flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-bold">Achievements</h2>
                  <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                    Awards, publications, and career milestones.
                  </p>
                </div>

                {form.achievements.map((entry, i) => (
                  <div key={i} className={entryClass}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold">Achievement {i + 1}</p>
                      <button
                        type="button"
                        onClick={() =>
                          updateList("achievements", (l) => l.filter((_, j) => j !== i))
                        }
                        className={removeButtonClass}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem]">
                      <input
                        type="text"
                        required
                        placeholder="Title — e.g. IAB Design Award"
                        value={entry.title}
                        onChange={(e) => setEntry("achievements", i, { title: e.target.value })}
                        className={inputClass}
                      />
                      <input
                        type="number"
                        min={1950}
                        max={2100}
                        placeholder="Year"
                        value={entry.year}
                        onChange={(e) => setEntry("achievements", i, { year: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <textarea
                      rows={2}
                      maxLength={500}
                      placeholder="Short description (optional)"
                      value={entry.description}
                      onChange={(e) =>
                        setEntry("achievements", i, { description: e.target.value })
                      }
                      className={`${inputClass} mt-3`}
                    />
                  </div>
                ))}

                {form.achievements.length < 15 && (
                  <button
                    type="button"
                    onClick={() =>
                      updateList("achievements", (l) => [...l, { ...emptyAchievement }])
                    }
                    className={addButtonClass}
                  >
                    + Add achievement
                  </button>
                )}
              </div>
            </div>

            {/* Portfolio */}
            <div className={sectionClass}>
              <div className="relative z-10 flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-bold">Portfolio</h2>
                  <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                    Past designs and builds, with photos — this is what clients look at first.
                  </p>
                </div>

                {form.portfolio.map((project, i) => (
                  <div key={i} className={entryClass}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold">Project {i + 1}</p>
                      <button
                        type="button"
                        onClick={() =>
                          updateList("portfolio", (l) => l.filter((_, j) => j !== i))
                        }
                        className={removeButtonClass}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        required
                        placeholder="Project title"
                        value={project.title}
                        onChange={(e) => setEntry("portfolio", i, { title: e.target.value })}
                        className={inputClass}
                      />
                      <input
                        type="text"
                        placeholder="Location — e.g. Dhanmondi, Dhaka"
                        value={project.location}
                        onChange={(e) => setEntry("portfolio", i, { location: e.target.value })}
                        className={inputClass}
                      />
                      <input
                        type="number"
                        min={1950}
                        max={2100}
                        placeholder="Year"
                        value={project.year}
                        onChange={(e) => setEntry("portfolio", i, { year: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      placeholder="What was the brief, and what did you design?"
                      value={project.description}
                      onChange={(e) =>
                        setEntry("portfolio", i, { description: e.target.value })
                      }
                      className={`${inputClass} mt-3`}
                    />

                    {/* Images */}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {project.imageUrls.map((url) => (
                        <div key={url} className="group relative">
                          {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */}
                          <img
                            src={url}
                            alt=""
                            className="h-20 w-20 rounded-xl object-cover"
                          />
                          <button
                            type="button"
                            aria-label="Remove image"
                            onClick={() =>
                              setEntry("portfolio", i, {
                                imageUrls: project.imageUrls.filter((u) => u !== url),
                              })
                            }
                            className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-stone-900 text-xs font-bold text-white opacity-0 shadow transition group-hover:opacity-100 dark:bg-white dark:text-stone-900"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {project.imageUrls.length < 8 && (
                        <UploadButton
                          label="+ Add photo"
                          onUploaded={(url) =>
                            setEntry("portfolio", i, {
                              imageUrls: [...project.imageUrls, url],
                            })
                          }
                          onError={setError}
                        />
                      )}
                    </div>
                  </div>
                ))}

                {form.portfolio.length < 12 && (
                  <button
                    type="button"
                    onClick={() => updateList("portfolio", (l) => [...l, { ...emptyProject }])}
                    className={addButtonClass}
                  >
                    + Add project
                  </button>
                )}
              </div>
            </div>

            {error && (
              <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                {error}
              </p>
            )}
            {saved && (
              <p className="rounded-xl bg-emerald-100 px-4 py-2.5 text-sm font-medium text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300">
                Profile saved.
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="self-start rounded-full bg-amber-400 px-8 py-3 text-sm font-bold text-stone-950 shadow-lg transition hover:scale-[1.02] hover:bg-amber-300 disabled:scale-100 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save profile"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
