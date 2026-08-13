"use client";

import { BadgeCheck } from "lucide-react";
import { Field, StepHeader, input } from "../ui";
import { UploadZone } from "../UploadZone";
import { NidCheckPanel } from "@/components/app/NidCheckPanel";
import type { StepProps } from "../form";

/** Step 1 — who the architect is, plus their NID documents. */
export function IdentityStep({ form, patch, onError, email }: StepProps & { email: string }) {
  return (
    <div>
      <StepHeader
        title="Identity Verification"
        subtitle="Your legal identity, exactly as it appears on your National ID."
      />

      <div className="flex flex-col gap-5">
        <UploadZone
          title="Profile Photo"
          required
          value={form.avatarUrl}
          onChange={(url) => patch({ avatarUrl: url })}
          onError={onError}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="name" title="Full Name" required>
            <input
              id="name"
              type="text"
              required
              minLength={2}
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              className={input}
            />
          </Field>
          <Field id="dateOfBirth" title="Date of Birth">
            <input
              id="dateOfBirth"
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => patch({ dateOfBirth: e.target.value })}
              className={input}
            />
          </Field>
          <Field id="gender" title="Gender">
            <select
              id="gender"
              value={form.gender}
              onChange={(e) => patch({ gender: e.target.value })}
              className={input}
            >
              <option value="">Select…</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </Field>
          <Field id="phone" title="Phone Number">
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => patch({ phone: e.target.value })}
              className={input}
            />
          </Field>
        </div>

        <Field id="email" title="Email" hint="Your account email, changed from account settings.">
          <input id="email" type="email" value={email} disabled className={input} />
        </Field>

        <Field id="currentAddress" title="Current Address">
          <textarea
            id="currentAddress"
            rows={2}
            maxLength={300}
            value={form.currentAddress}
            onChange={(e) => patch({ currentAddress: e.target.value })}
            className={input}
          />
        </Field>
        <Field id="permanentAddress" title="Permanent Address">
          <textarea
            id="permanentAddress"
            rows={2}
            maxLength={300}
            value={form.permanentAddress}
            onChange={(e) => patch({ permanentAddress: e.target.value })}
            className={input}
          />
        </Field>

        <Field
          id="nid"
          title="NID Number"
          required
          hint="10, 13, or 17 digits, checked against your uploaded card."
        >
          <input
            id="nid"
            type="text"
            inputMode="numeric"
            maxLength={20}
            value={form.nid}
            onChange={(e) => patch({ nid: e.target.value })}
            className={input}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <UploadZone
            title="NID Front"
            required
            value={form.nidFrontUrl}
            onChange={(url) => patch({ nidFrontUrl: url })}
            onError={onError}
          />
          <UploadZone
            title="NID Back"
            required
            value={form.nidBackUrl}
            onChange={(url) => patch({ nidBackUrl: url })}
            onError={onError}
          />
        </div>

        {/* Runs against the saved profile, so the draft must be autosaved
            first — hence the note inside the panel about saving. */}
        <NidCheckPanel
          nid={form.nid}
          dateOfBirth={form.dateOfBirth}
          hasCardImage={!!form.nidFrontUrl}
        />

        {/* Phone/email OTP verification is a separate upcoming feature — these
            chips are placeholders until it ships. */}
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/40 dark:bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-stone-600 dark:text-slate-400">
            <BadgeCheck className="h-3.5 w-3.5" /> Phone verification, coming soon
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/40 dark:bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-stone-600 dark:text-slate-400">
            <BadgeCheck className="h-3.5 w-3.5" /> Email verification, coming soon
          </span>
        </div>
      </div>
    </div>
  );
}
