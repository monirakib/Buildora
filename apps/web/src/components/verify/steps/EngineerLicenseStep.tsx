"use client";
import { ShieldCheck } from "lucide-react";
import {
  IEB_MEMBERSHIP_CATEGORIES,
  IEB_MEMBERSHIP_STATUSES,
  checkIebMembershipNo,
} from "@buildora/shared";
import { CredentialField, Field, StepHeader, input } from "../ui";
import { UploadZone } from "../UploadZone";
import type { StepProps } from "../form";

/**
 * The structural engineer's licence step: IEB membership, the certificate
 * behind it, and the professional seal.
 *
 * There's no IEB equivalent of the IAB directory — IEB publishes no public
 * member search — so unlike the architect's step there's no live lookup here,
 * only a format check. The membership number is still recorded and screened at
 * submit time; the supervisor is the one who compares it to the certificate.
 */
export function EngineerLicenseStep({ form, patch, onError }: StepProps) {
  return (
    <div>
      <StepHeader
        title="IEB Membership & Professional Seal"
        subtitle="Your Institution of Engineers, Bangladesh membership and the seal your drawings and inspection sign-offs carry."
      />

      <div className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <CredentialField
            id="licenseNumber"
            title="IEB membership number"
            required
            placeholder="e.g. M/12345"
            hint="As printed on your membership certificate."
            value={form.licenseNumber}
            onChange={(licenseNumber) => patch({ licenseNumber })}
            check={checkIebMembershipNo}
          />
          <Field id="membershipCategory" title="Membership grade">
            <select
              id="membershipCategory"
              value={form.membershipCategory}
              onChange={(e) => patch({ membershipCategory: e.target.value })}
              className={input}
            >
              <option value="">Select…</option>
              {IEB_MEMBERSHIP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field id="membershipStatus" title="Standing">
            <select
              id="membershipStatus"
              value={form.membershipStatus}
              onChange={(e) => patch({ membershipStatus: e.target.value })}
              className={input}
            >
              <option value="">Select…</option>
              {IEB_MEMBERSHIP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field id="licenseIssueDate" title="Issue date">
            <input
              id="licenseIssueDate"
              type="date"
              value={form.licenseIssueDate}
              onChange={(e) => patch({ licenseIssueDate: e.target.value })}
              className={input}
            />
          </Field>
          <Field
            id="licenseExpiryDate"
            title="Valid until"
            hint="Leave blank for a life membership."
          >
            <input
              id="licenseExpiryDate"
              type="date"
              value={form.licenseExpiryDate}
              onChange={(e) => patch({ licenseExpiryDate: e.target.value })}
              className={input}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <UploadZone
            title="IEB certificate"
            required
            value={form.licenseCertificateUrl}
            onChange={(url) => patch({ licenseCertificateUrl: url })}
            onError={onError}
          />
          <UploadZone
            title="Membership card"
            value={form.membershipCardUrl}
            onChange={(url) => patch({ membershipCardUrl: url })}
            onError={onError}
          />
        </div>

        {/* The seal gets its own block because on this platform it does real
            work: an engineer's signed inspection is what releases an escrow
            tranche to a contractor, so the supervisor needs to have seen the
            seal that signature will carry. */}
        <div className="mt-2 border-t border-white/40 dark:border-white/8 pt-5">
          <p className="mb-1 text-sm font-bold text-stone-700 dark:text-slate-300">
            Professional seal / stamp
          </p>
          <p className="mb-4 inline-flex items-start gap-2 text-xs text-stone-500 dark:text-slate-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Your seal is what a milestone inspection is signed with, passing an inspection releases
            the contractor&apos;s escrow tranche. Upload a clear scan of the seal you use on
            structural drawings.
          </p>
          <UploadZone
            title="Seal impression"
            required
            value={form.professionalSealUrl}
            onChange={(url) => patch({ professionalSealUrl: url })}
            onError={onError}
          />
        </div>

        {/* Optional RAJUK enlistment — engineers preparing drawings for a RAJUK
            submission are often enlisted, but plenty of practising engineers
            aren't, so it never blocks. */}
        <div className="mt-2 border-t border-white/40 dark:border-white/8 pt-5">
          <p className="mb-4 text-sm font-bold text-stone-700 dark:text-slate-300">
            RAJUK enlistment (optional)
          </p>
          <div className="grid items-start gap-5 sm:grid-cols-2">
            <Field id="rajukEnlistmentNo" title="RAJUK enlistment number">
              <input
                id="rajukEnlistmentNo"
                type="text"
                value={form.rajukEnlistmentNo}
                onChange={(e) => patch({ rajukEnlistmentNo: e.target.value })}
                className={input}
              />
            </Field>
            <UploadZone
              title="RAJUK certificate"
              compact
              value={form.rajukCertificateUrl}
              onChange={(url) => patch({ rajukCertificateUrl: url })}
              onError={onError}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
