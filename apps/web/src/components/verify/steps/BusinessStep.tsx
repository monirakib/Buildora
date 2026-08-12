"use client";
import { Info } from "lucide-react";
import { UserRole, checkBin, checkTin, checkTradeLicenseNo } from "@buildora/shared";
import { CredentialField, Field, StepHeader, input } from "../ui";
import { UploadZone } from "../UploadZone";
import type { StepProps } from "../form";

/**
 * Business registration — the contractor's and supplier's equivalent of the
 * architect's IAB step.
 *
 * Neither trade is licensed by a professional institute: what makes them a real
 * business is a city corporation trade licence and an NBR tax registration. The
 * TIN matters most on this platform, because escrow money is eventually paid out
 * against it, which is why it's mandatory while the BIN is not — plenty of small
 * firms are below the VAT threshold.
 */
export function BusinessStep({ form, patch, onError, role }: StepProps) {
  const isSupplier = role === UserRole.SUPPLIER;

  return (
    <div>
      <StepHeader
        title="Business Registration"
        subtitle={
          isSupplier
            ? "Your trade licence and tax registration — what makes you a real, payable business."
            : "Your firm's trade licence and tax registration. Escrow payouts are made against these."
        }
      />

      <div className="flex flex-col gap-5">
        {/* ---- Trade licence ---- */}
        <div className="grid gap-5 sm:grid-cols-2">
          <CredentialField
            id="tradeLicenseNo"
            title="Trade licence number"
            required
            placeholder="e.g. TRAD/DNCC/012345/2024"
            value={form.tradeLicenseNo}
            onChange={(tradeLicenseNo) => patch({ tradeLicenseNo })}
            check={checkTradeLicenseNo}
          />
          <Field
            id="tradeLicenseIssuer"
            title="Issuing authority"
            hint="The city corporation or pourashava that issued it."
          >
            <input
              id="tradeLicenseIssuer"
              type="text"
              placeholder="e.g. Dhaka North City Corporation"
              value={form.tradeLicenseIssuer}
              onChange={(e) => patch({ tradeLicenseIssuer: e.target.value })}
              className={input}
            />
          </Field>
          <Field
            id="tradeLicenseExpiry"
            title="Valid until"
            hint="Trade licences are renewed every year — an expired one is flagged to the supervisor."
          >
            <input
              id="tradeLicenseExpiry"
              type="date"
              value={form.tradeLicenseExpiry}
              onChange={(e) => patch({ tradeLicenseExpiry: e.target.value })}
              className={input}
            />
          </Field>
          <UploadZone
            title="Trade licence"
            required
            value={form.tradeLicenseUrl}
            onChange={(url) => patch({ tradeLicenseUrl: url })}
            onError={onError}
          />
        </div>

        {/* ---- Tax registration ---- */}
        <div className="mt-2 border-t border-white/40 dark:border-white/8 pt-5">
          <p className="mb-4 text-sm font-bold text-stone-700 dark:text-slate-300">
            Tax registration (NBR)
          </p>
          <div className="grid items-start gap-5 sm:grid-cols-2">
            <CredentialField
              id="tinNumber"
              title="e-TIN number"
              required
              placeholder="12 digits"
              hint="Required before any escrow payout can be made to you."
              value={form.tinNumber}
              onChange={(tinNumber) => patch({ tinNumber })}
              check={checkTin}
            />
            <UploadZone
              title="TIN certificate"
              // Mandatory for contractors, who take milestone payouts; a
              // supplier is paid per order, so theirs is encouraged not forced.
              required={!isSupplier}
              compact
              value={form.tinCertificateUrl}
              onChange={(url) => patch({ tinCertificateUrl: url })}
              onError={onError}
            />
            <CredentialField
              id="binNumber"
              title="BIN / VAT registration"
              placeholder="13 digits"
              hint="Optional — leave blank if you're below the VAT threshold."
              value={form.binNumber}
              onChange={(binNumber) => patch({ binNumber })}
              check={checkBin}
            />
            <UploadZone
              title="VAT certificate"
              compact
              value={form.binCertificateUrl}
              onChange={(url) => patch({ binCertificateUrl: url })}
              onError={onError}
            />
          </div>
        </div>

        {/* ---- Company incorporation ---- */}
        <div className="mt-2 border-t border-white/40 dark:border-white/8 pt-5">
          <p className="mb-1 text-sm font-bold text-stone-700 dark:text-slate-300">
            Company incorporation (optional)
          </p>
          <p className="mb-4 text-xs text-stone-500 dark:text-slate-500">
            Only for firms registered with the RJSC. Sole proprietorships trading on a licence alone
            can skip this.
          </p>
          <div className="grid items-start gap-5 sm:grid-cols-2">
            <Field id="rjscRegistrationNo" title="RJSC registration number">
              <input
                id="rjscRegistrationNo"
                type="text"
                placeholder="e.g. C-123456/2019"
                value={form.rjscRegistrationNo}
                onChange={(e) => patch({ rjscRegistrationNo: e.target.value })}
                className={input}
              />
            </Field>
            <UploadZone
              title="Incorporation certificate"
              compact
              value={form.rjscCertificateUrl}
              onChange={(url) => patch({ rjscCertificateUrl: url })}
              onError={onError}
            />
          </div>
        </div>

        <p className="inline-flex items-start gap-2 rounded-2xl bg-white/40 px-4 py-3 text-xs text-stone-600 dark:bg-white/[0.05] dark:text-slate-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Buildora checks the shape of these numbers and whether another account already claims
          them. There is no public register to look a trade licence, BIN or TIN up in, so a
          supervisor reads your uploaded documents before approving.
        </p>
      </div>
    </div>
  );
}
