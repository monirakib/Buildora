"use client";

import { MEMBERSHIP_CATEGORIES, MEMBERSHIP_STATUSES } from "@buildora/shared";
import { useSession } from "@/store/useSession";
import { Field, StepHeader, input, label } from "../ui";
import { IabCheckField } from "../IabCheckField";
import { UploadZone } from "../UploadZone";
import type { StepProps } from "../form";

/** Step 3 — IAB membership (mandatory) and RAJUK enlistment (optional). */
export function LicenseStep({ form, patch, onError }: StepProps) {
  const token = useSession((s) => s.token);

  return (
    <div>
      <StepHeader
        title="Professional License"
        subtitle="Your Institute of Architects Bangladesh membership, the core credential Buildora verifies."
      />

      <div className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <IabCheckField
            value={form.licenseNumber}
            onChange={(licenseNumber) => patch({ licenseNumber })}
            accountName={form.name}
            token={token ?? undefined}
            inputClass={input}
            labelClass={label}
            // Tier and standing come straight from the directory. The name is
            // deliberately not filled here: it's the account's own name, and
            // overwriting it would defeat the mismatch check on submit.
            onResult={(member) =>
              patch({
                membershipStatus: member.status ?? "",
                membershipCategory: member.category ?? "",
              })
            }
          />
          <Field id="membershipCategory" title="Membership Category">
            <select
              id="membershipCategory"
              value={form.membershipCategory}
              onChange={(e) => patch({ membershipCategory: e.target.value })}
              className={input}
            >
              <option value="">Select…</option>
              {MEMBERSHIP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field id="membershipStatus" title="Membership Status">
            <select
              id="membershipStatus"
              value={form.membershipStatus}
              onChange={(e) => patch({ membershipStatus: e.target.value })}
              className={input}
            >
              <option value="">Select…</option>
              {MEMBERSHIP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field id="licenseIssueDate" title="Issue Date">
            <input
              id="licenseIssueDate"
              type="date"
              value={form.licenseIssueDate}
              onChange={(e) => patch({ licenseIssueDate: e.target.value })}
              className={input}
            />
          </Field>
          <Field id="licenseExpiryDate" title="Expiry Date">
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
            title="IAB Certificate"
            required
            value={form.iabCertificateUrl}
            onChange={(url) => patch({ iabCertificateUrl: url })}
            onError={onError}
          />
          <UploadZone
            title="Membership Card"
            value={form.membershipCardUrl}
            onChange={(url) => patch({ membershipCardUrl: url })}
            onError={onError}
          />
        </div>

        {/* Optional RAJUK enlistment */}
        <div className="mt-2 border-t border-white/40 dark:border-white/8 pt-5">
          <p className="mb-4 text-sm font-bold text-stone-700 dark:text-slate-300">
            RAJUK Enlistment (optional)
          </p>
          <div className="grid items-start gap-5 sm:grid-cols-2">
            <Field id="rajukEnlistmentNo" title="RAJUK Enlistment Number">
              <input
                id="rajukEnlistmentNo"
                type="text"
                value={form.rajukEnlistmentNo}
                onChange={(e) => patch({ rajukEnlistmentNo: e.target.value })}
                className={input}
              />
            </Field>
            <UploadZone
              title="RAJUK Certificate"
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
