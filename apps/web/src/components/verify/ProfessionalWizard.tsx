"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  UserRole,
  VerificationStatus,
  computeCompletion,
  type SessionUser,
} from "@buildora/shared";
import {
  ApiError,
  getMyVerification,
  submitVerification,
  updateProfessionalProfile,
} from "@/lib/api";
import { useSession } from "@/store/useSession";
import { formFromUser, toPayload, toProfile, type WizardForm } from "./form";
import { isStepComplete, wizardFor, type StepKey } from "./roles";
import { Navbar } from "@/components/landing/Navbar";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { useHoverScale } from "@/lib/useHoverScale";
import { GlassCard } from "./ui";
import { WizardBackground } from "./Background";
import { SidebarNav } from "./SidebarNav";
import { BottomBar } from "./BottomBar";
import { StatusBadge } from "./StatusBadge";
import { IdentityStep } from "./steps/IdentityStep";
import { ProfessionalStep } from "./steps/ProfessionalStep";
import { LicenseStep } from "./steps/LicenseStep";
import { EngineerLicenseStep } from "./steps/EngineerLicenseStep";
import { BusinessStep } from "./steps/BusinessStep";
import { CapacityStep } from "./steps/CapacityStep";
import { CatalogueStep } from "./steps/CatalogueStep";
import { CoverageStep } from "./steps/CoverageStep";
import { EducationStep } from "./steps/EducationStep";
import { ExperienceStep } from "./steps/ExperienceStep";
import { ExpertiseStep } from "./steps/ExpertiseStep";
import { SkillsStep } from "./steps/SkillsStep";
import { PortfolioStep } from "./steps/PortfolioStep";
import { AchievementsStep } from "./steps/AchievementsStep";
import { DeclarationStep } from "./steps/DeclarationStep";

/**
 * The verification wizard, shared by all four professional roles.
 *
 * The machinery is identical for everyone — sidebar, debounced autosave through
 * the profile PATCH, a live completion percentage, and a submit that opens a
 * supervisor request. What differs is which steps appear and what they're
 * called, and that comes entirely from wizardFor(role) in roles.ts.
 */
export function ProfessionalWizard({ user }: { user: SessionUser }) {
  const { token, setSession } = useSession();
  const config = wizardFor(user.role);

  const [form, setForm] = useState<WizardForm>(() => formFromUser(user));
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [rejectionNote, setRejectionNote] = useState<string | null>(null);
  /** Set when the API blocked the submission because the IAB name differs. */
  const [nameMismatch, setNameMismatch] = useState(false);

  // The profile is frozen while a supervisor has it, or once verified.
  const locked =
    user.verificationStatus === VerificationStatus.DOCUMENTS_SUBMITTED ||
    user.verificationStatus === VerificationStatus.UNDER_REVIEW ||
    user.verificationStatus === VerificationStatus.APPROVED;

  // ---- Autosave: any patch marks the form dirty; 1.5s after the last edit
  // the whole form is saved through the existing profile PATCH. ----
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function patch(partial: Partial<WizardForm>) {
    dirtyRef.current = true;
    setSaveState("idle");
    setForm((f) => ({ ...f, ...partial }));
  }

  async function save(current: WizardForm) {
    if (!token) return false;
    setSaveState("saving");
    try {
      const updated = await updateProfessionalProfile(token, toPayload(current));
      setSession(updated, token);
      dirtyRef.current = false;
      setSaveState("saved");
      return true;
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : "Couldn't save your draft");
      return false;
    }
  }

  useEffect(() => {
    if (!dirtyRef.current || locked) return;
    timerRef.current = setTimeout(() => save(form), 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the form changes
  }, [form]);

  // Show the supervisor's note if the last request was rejected.
  useEffect(() => {
    if (!token || user.verificationStatus !== VerificationStatus.REJECTED) return;
    getMyVerification(token)
      .then((req) => setRejectionNote(req?.note ?? null))
      .catch(() => {}); // non-critical
  }, [token, user.verificationStatus]);

  const completion = useMemo(
    () => computeCompletion(toProfile(form), user.role),
    [form, user.role]
  );
  const sections = config.steps.map((s) => ({
    label: s.label,
    complete: isStepComplete(s.key, form, user.role),
  }));

  /**
   * `manualReview` sends the profile to a supervisor without the automated IAB
   * name check having to pass. It's only ever set by the button that appears
   * after the API rejects a submission for a name mismatch — never by default,
   * and only architects can hit that path, since they're the only role with a
   * public directory to disagree with.
   */
  async function handleSubmit(manualReview = false) {
    if (!token) return;
    setError(null);
    setNameMismatch(false);
    setSubmitting(true);
    // Cancel any pending autosave, flush the latest form, then submit.
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      if (dirtyRef.current && !(await save(form))) return;
      await submitVerification(token, "", manualReview);
      setSession({ ...user, verificationStatus: VerificationStatus.DOCUMENTS_SUBMITTED }, token);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      // The name on the account doesn't match the IAB record. Offer the manual
      // route rather than leaving them stuck — IAB spells plenty of names
      // differently from the applicant's own documents.
      if (err instanceof ApiError && err.code === "IAB_NAME_MISMATCH") setNameMismatch(true);
      setError(err instanceof Error ? err.message : "Couldn't submit for verification");
    } finally {
      setSubmitting(false);
    }
  }

  const stepProps = { form, patch, onError: setError, role: user.role };

  /** Renders whichever step this role has at this position. */
  function renderStep(key: StepKey) {
    switch (key) {
      case "identity":
        return <IdentityStep {...stepProps} email={user.email} />;
      case "professional":
        return <ProfessionalStep {...stepProps} />;
      case "license":
        return <LicenseStep {...stepProps} />;
      case "engineerLicense":
        return <EngineerLicenseStep {...stepProps} />;
      case "business":
        return <BusinessStep {...stepProps} />;
      case "capacity":
        return <CapacityStep {...stepProps} />;
      case "catalogue":
        return <CatalogueStep {...stepProps} />;
      case "coverage":
        return <CoverageStep {...stepProps} />;
      case "education":
        return <EducationStep {...stepProps} />;
      case "experience":
        return <ExperienceStep {...stepProps} />;
      case "expertise":
        return <ExpertiseStep {...stepProps} />;
      case "skills":
        return <SkillsStep {...stepProps} />;
      case "portfolio":
        return <PortfolioStep {...stepProps} />;
      case "achievements":
        return <AchievementsStep {...stepProps} />;
      case "declaration":
        return <DeclarationStep {...stepProps} />;
    }
  }

  // Every role's step list is non-empty, but `step` is state — falling back to
  // the first step keeps the render safe if it ever points past the end.
  const currentKey: StepKey = config.steps[step]?.key ?? "identity";
  const stepCount = config.steps.length;

  // The step panel slides in each time the step changes. AnimatePresence used
  // to fade the old step out first; here the content swaps and the new panel
  // animates in, which looks the same and is a lot less machinery.
  const stepPanelRef = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const panel = stepPanelRef.current;
      if (!panel || prefersReducedMotion()) return;
      gsap.fromTo(
        panel,
        { opacity: 0, y: 16, scale: 0.99 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "power3.out", clearProps: "transform" }
      );
    },
    { dependencies: [step] }
  );

  const backRef = useHoverScale<HTMLButtonElement>({ enabled: step > 0 });
  const nextRef = useHoverScale<HTMLButtonElement>({ enabled: step < stepCount - 1 });

  return (
    <div className="relative min-h-screen bg-stone-100 text-stone-900 dark:bg-[#05070C] dark:text-slate-100">
      {/* Theme-matched architecture photo, scrim, grain, and cursor glow. */}
      <WizardBackground />

      <Navbar />

      {/* pt-28 clears the fixed navbar (top-4 + h-14) */}
      <main className="relative mx-auto max-w-6xl px-4 pt-28 pb-36 sm:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-stone-600 transition hover:text-stone-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
          </Link>
          <p className="text-xs font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-[#F5B400]">
            Buildora · {config.eyebrow}
          </p>
          <h1 className="mt-2 bg-gradient-to-b from-stone-900 via-stone-900 to-stone-500 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl dark:from-white dark:via-white dark:to-slate-400">
            Complete your profile
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600 dark:text-slate-400">
            {config.intro}
          </p>
          <div className="mt-5">
            <StatusBadge status={user.verificationStatus} />
          </div>
        </div>

        {/* Status banners */}
        {locked && (
          <div className="mb-6 rounded-2xl border border-amber-400/25 bg-amber-400/15 px-5 py-4 text-sm font-medium text-amber-800 backdrop-blur-xl dark:text-amber-100">
            {user.verificationStatus === VerificationStatus.APPROVED
              ? `You're a ${config.verifiedLabel}, your credentials are locked. Contact support to change them.`
              : "Your profile is locked while a supervisor reviews it. You'll see the outcome here."}
          </div>
        )}
        {user.verificationStatus === VerificationStatus.REJECTED && (
          <div className="mb-6 rounded-2xl border border-rose-400/25 bg-rose-400/15 px-5 py-4 text-sm text-rose-800 backdrop-blur-xl dark:text-rose-100">
            <p className="font-bold">Your last submission was rejected.</p>
            {rejectionNote && <p className="mt-1">Supervisor&apos;s note: {rejectionNote}</p>}
            <p className="mt-1">Update the sections below and submit again.</p>
          </div>
        )}
        {error && (
          <div className="mb-6 rounded-2xl border border-rose-400/25 bg-rose-400/15 px-5 py-3.5 text-sm font-medium text-rose-800 backdrop-blur-xl dark:text-rose-100">
            {error}
            {/* The way out of a name mismatch: skip the automated check and let
                a supervisor compare the documents by hand. */}
            {nameMismatch && (
              <button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={submitting}
                className="mt-3 block rounded-full bg-rose-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send for manual review instead"}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Sidebar — sticky on desktop, horizontal scroll on mobile */}
          <div className="lg:sticky lg:top-8 lg:w-60 lg:shrink-0">
            <div className="overflow-x-auto lg:overflow-visible">
              <div className="min-w-max lg:min-w-0">
                <SidebarNav sections={sections} current={step} onSelect={setStep} />
              </div>
            </div>
          </div>

          {/* Step content */}
          <div className="min-w-0 flex-1">
            <div ref={stepPanelRef}>
              <GlassCard>
                {/* fieldset[disabled] turns every control read-only at once
                      while the profile is locked. */}
                <fieldset disabled={locked} className="min-w-0">
                  {renderStep(currentKey)}
                </fieldset>

                {/* Prev / Next */}
                <div className="mt-8 flex items-center justify-between border-t border-white/40 pt-5 dark:border-white/8">
                  <button
                    ref={backRef}
                    type="button"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                    disabled={step === 0}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/50 px-5 py-2 text-sm font-bold text-stone-700 transition-colors hover:border-stone-400 disabled:opacity-40 dark:border-white/12 dark:text-slate-300 dark:hover:border-white/25"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <span className="text-xs font-bold text-stone-500 dark:text-slate-500">
                    Step {step + 1} of {stepCount}
                  </span>
                  <button
                    ref={nextRef}
                    type="button"
                    onClick={() => setStep((s) => Math.min(stepCount - 1, s + 1))}
                    disabled={step === stepCount - 1}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/50 px-5 py-2 text-sm font-bold text-stone-700 transition-colors hover:border-[#F5B400]/50 hover:text-amber-600 hover:shadow-[0_0_24px_rgba(245,180,0,0.12)] disabled:opacity-40 dark:border-white/12 dark:text-slate-300 dark:hover:text-[#F5B400]"
                  >
                    Next <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      </main>

      <BottomBar
        saveState={saveState}
        onSaveDraft={() => save(form)}
        percent={completion.percent}
        canSubmit={completion.mandatoryComplete && !locked}
        submitting={submitting}
        onSubmit={() => handleSubmit()}
        locked={locked}
      />
    </div>
  );
}

/** Roles that have a verification wizard — everyone except land owners and admins. */
export const PROFESSIONAL_ROLES: UserRole[] = [
  UserRole.ARCHITECT,
  UserRole.STRUCTURAL_ENGINEER,
  UserRole.CONTRACTOR,
  UserRole.SUPPLIER,
];
