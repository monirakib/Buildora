"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PaymentMethod, UserRole, type SessionUser } from "@buildora/shared";
import { changeEmail, changePassword, updateAccount } from "@/lib/api";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { Reveal } from "@/components/landing/Reveal";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const labelClass = "mb-1.5 block text-sm font-semibold";

/** Liquid-glass card, matching the navbar and auth cards. */
const sectionClass =
  "relative overflow-hidden rounded-3xl border border-white/40 bg-white/30 p-6 shadow-2xl shadow-black/10 backdrop-blur-2xl backdrop-saturate-150 sm:p-8 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-40 before:bg-linear-to-b before:from-white/40 before:to-transparent before:content-[''] dark:border-white/15 dark:bg-white/10 dark:shadow-black/40 dark:before:from-white/15";

const buttonClass =
  "self-start rounded-full bg-amber-400 px-8 py-3 text-sm font-bold text-stone-950 shadow-lg transition hover:scale-[1.02] hover:bg-amber-300 disabled:scale-100 disabled:opacity-60";

const okClass =
  "rounded-xl bg-emerald-100 px-4 py-2.5 text-sm font-medium text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300";
const errClass =
  "rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300";

const roleLabels: Record<string, string> = {
  LAND_OWNER: "Land owner",
  ARCHITECT: "Architect",
  STRUCTURAL_ENGINEER: "Structural engineer",
  CONTRACTOR: "Contractor",
  SUPPLIER: "Supplier",
  ADMIN: "Admin",
};

const methodLabels: Record<PaymentMethod, string> = {
  [PaymentMethod.BKASH]: "bKash",
  [PaymentMethod.NAGAD]: "Nagad",
  [PaymentMethod.BANK]: "Bank transfer",
};

const PROFESSIONAL_ROLES: UserRole[] = [
  UserRole.ARCHITECT,
  UserRole.STRUCTURAL_ENGINEER,
  UserRole.CONTRACTOR,
  UserRole.SUPPLIER,
];

/** Everything is kept as strings; the API coerces and drops blanks. */
function formFromUser(user: SessionUser) {
  // Personal fields live on the shared profile subdocument. Both role shapes
  // declare avatarUrl / nid / company / bio, so reading them straight off the
  // union needs no narrowing.
  const p = user.profile;
  const b = user.billing;
  return {
    name: user.name,
    phone: user.phone ?? "",
    altPhone: user.altPhone ?? "",
    recoveryEmail: user.recoveryEmail ?? "",
    avatarUrl: p?.avatarUrl ?? "",
    nid: p?.nid ?? "",
    company: p?.company ?? "",
    bio: p?.bio ?? "",
    billingName: b?.billingName ?? "",
    addressLine1: b?.addressLine1 ?? "",
    addressLine2: b?.addressLine2 ?? "",
    city: b?.city ?? "",
    postcode: b?.postcode ?? "",
    country: b?.country ?? "",
    preferredMethod: b?.preferredMethod ?? "",
    mobileWalletNumber: b?.mobileWalletNumber ?? "",
    bankAccountName: b?.bankAccountName ?? "",
    bankAccountNumber: b?.bankAccountNumber ?? "",
    bankName: b?.bankName ?? "",
    bankBranch: b?.bankBranch ?? "",
    tin: b?.tin ?? "",
  };
}

type FormState = ReturnType<typeof formFromUser>;

/**
 * Account settings — personal details, contact points, billing, and password.
 *
 * Open to every role. This is deliberately *not* the profile: a professional's
 * credentials are edited in the verification editor, and a land owner's plot
 * details belong to the project brief they post.
 */
export default function AccountPage() {
  const router = useRouter();
  const { user, token, setSession } = useSession();

  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Email change (own form — it needs the password).
  const [emailForm, setEmailForm] = useState({ email: "", currentPassword: "" });
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  // Password change.
  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  // The session store hydrates from localStorage, so wait for mount before
  // trusting `user` (same pattern as the other authenticated pages).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (!user) {
      router.replace("/auth");
      return;
    }
    // `f ?? …` so later renders don't clobber what's being typed.
    setForm((f) => f ?? formFromUser(user));
    setEmailForm((f) => (f.email ? f : { ...f, email: user.email }));
  }, [mounted, user, router]);

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setSaved(false);
      setForm((f) => (f ? { ...f, [field]: e.target.value } : f));
    };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !token) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateAccount(token, form);
      setSession(updated, token); // keep the navbar and the rest of the app in sync
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Can't reach the server. Please try again in a moment."
          : err instanceof Error
            ? err.message
            : "Something went wrong"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setEmailMsg(null);
    setEmailBusy(true);
    try {
      const updated = await changeEmail(token, emailForm);
      setSession(updated, token);
      setEmailForm({ email: updated.email, currentPassword: "" });
      setEmailMsg({ ok: true, text: "Email updated. Use it to sign in from now on." });
    } catch (err) {
      setEmailMsg({
        ok: false,
        text: err instanceof Error ? err.message : "Couldn't change your email",
      });
    } finally {
      setEmailBusy(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setPwMsg(null);
    setPwBusy(true);
    try {
      await changePassword(token, pwForm);
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPwMsg({
        ok: true,
        text: "Password changed. Any other device you were signed in on has been signed out.",
      });
    } catch (err) {
      setPwMsg({
        ok: false,
        text: err instanceof Error ? err.message : "Couldn't change your password",
      });
    } finally {
      setPwBusy(false);
    }
  }

  const isProfessional = !!user && PROFESSIONAL_ROLES.includes(user.role);
  // Bank fields only matter for a bank transfer; the wallet number only for
  // bKash/Nagad. Showing all of them at once is just noise.
  const wantsBank = form?.preferredMethod === PaymentMethod.BANK;
  const wantsWallet =
    form?.preferredMethod === PaymentMethod.BKASH || form?.preferredMethod === PaymentMethod.NAGAD;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      {/* pt-28 clears the fixed navbar (top-4 + h-14) */}
      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-2xl">
          {!form || !user ? (
            <p className="text-center text-sm text-stone-500 dark:text-slate-500">Loading…</p>
          ) : (
            <>
              {/* Who's signed in */}
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-amber-400 text-xl font-extrabold text-stone-950">
                  {user.name
                    .split(" ")
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase())
                    .join("")}
                </span>
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    Account information
                  </h1>
                  <p className="text-sm text-stone-500 dark:text-slate-400">
                    {user.email} · {roleLabels[user.role] ?? user.role}
                  </p>
                </div>
              </div>

              {isProfessional && (
                <p className="mt-4 rounded-xl border border-white/40 bg-white/40 px-4 py-3 text-sm text-stone-600 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                  These are your account settings. Your public profile — credentials, portfolio and
                  verification — is edited on{" "}
                  <Link
                    href="/profile/professional"
                    className="font-bold text-amber-600 dark:text-amber-400"
                  >
                    your profile page
                  </Link>
                  .
                </p>
              )}

              {/* ---- Personal details + billing (one form, one save) ---- */}
              <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
                <Reveal>
                  <section className={sectionClass}>
                    <div className="relative z-10">
                      <h2 className="text-lg font-bold">Personal information</h2>
                      <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
                        Who you are on Buildora.
                      </p>

                      <div className="mt-6 grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label htmlFor="username" className={labelClass}>
                            Username{" "}
                            <span className="font-medium text-stone-500 dark:text-slate-400">
                              (permanent)
                            </span>
                          </label>
                          <input
                            id="username"
                            type="text"
                            value={user.username}
                            readOnly
                            disabled
                            className={`${inputClass} cursor-not-allowed opacity-70`}
                          />
                        </div>
                        <div>
                          <label htmlFor="name" className={labelClass}>
                            Full name
                          </label>
                          <input
                            id="name"
                            type="text"
                            required
                            minLength={2}
                            autoComplete="name"
                            value={form.name}
                            onChange={set("name")}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="nid" className={labelClass}>
                            NID number{" "}
                            <span className="font-medium text-stone-500 dark:text-slate-400">
                              (for verification)
                            </span>
                          </label>
                          <input
                            id="nid"
                            type="text"
                            placeholder="10, 13 or 17 digits"
                            value={form.nid}
                            onChange={set("nid")}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="avatarUrl" className={labelClass}>
                            Photo URL{" "}
                            <span className="font-medium text-stone-500 dark:text-slate-400">
                              (optional)
                            </span>
                          </label>
                          <input
                            id="avatarUrl"
                            type="url"
                            placeholder="https://…"
                            value={form.avatarUrl}
                            onChange={set("avatarUrl")}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="company" className={labelClass}>
                            Company / organisation{" "}
                            <span className="font-medium text-stone-500 dark:text-slate-400">
                              (optional)
                            </span>
                          </label>
                          <input
                            id="company"
                            type="text"
                            value={form.company}
                            onChange={set("company")}
                            className={inputClass}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="bio" className={labelClass}>
                            About you{" "}
                            <span className="font-medium text-stone-500 dark:text-slate-400">
                              (optional)
                            </span>
                          </label>
                          <textarea
                            id="bio"
                            rows={3}
                            maxLength={500}
                            placeholder="A few lines about yourself."
                            value={form.bio}
                            onChange={set("bio")}
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </div>
                  </section>
                </Reveal>

                <Reveal delay={80}>
                  <section className={sectionClass}>
                    <div className="relative z-10">
                      <h2 className="text-lg font-bold">Contact numbers &amp; email</h2>
                      <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
                        Where we reach you about projects, payments, and permits.
                      </p>

                      <div className="mt-6 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label htmlFor="phone" className={labelClass}>
                            Primary phone
                          </label>
                          <input
                            id="phone"
                            type="tel"
                            autoComplete="tel"
                            placeholder="01XXXXXXXXX"
                            value={form.phone}
                            onChange={set("phone")}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="altPhone" className={labelClass}>
                            Alternate phone{" "}
                            <span className="font-medium text-stone-500 dark:text-slate-400">
                              (optional)
                            </span>
                          </label>
                          <input
                            id="altPhone"
                            type="tel"
                            placeholder="Office or site contact"
                            value={form.altPhone}
                            onChange={set("altPhone")}
                            className={inputClass}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="recoveryEmail" className={labelClass}>
                            Recovery email{" "}
                            <span className="font-medium text-stone-500 dark:text-slate-400">
                              (optional — receipts and account recovery)
                            </span>
                          </label>
                          <input
                            id="recoveryEmail"
                            type="email"
                            placeholder="another@example.com"
                            value={form.recoveryEmail}
                            onChange={set("recoveryEmail")}
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </div>
                  </section>
                </Reveal>

                <Reveal delay={160}>
                  <section className={sectionClass}>
                    <div className="relative z-10">
                      <h2 className="text-lg font-bold">Billing information</h2>
                      <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
                        Used to pre-fill escrow deposits and payouts. We never store card numbers.
                      </p>

                      <div className="mt-6 grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label htmlFor="billingName" className={labelClass}>
                            Billed to{" "}
                            <span className="font-medium text-stone-500 dark:text-slate-400">
                              (if different from your name)
                            </span>
                          </label>
                          <input
                            id="billingName"
                            type="text"
                            value={form.billingName}
                            onChange={set("billingName")}
                            className={inputClass}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="addressLine1" className={labelClass}>
                            Address
                          </label>
                          <input
                            id="addressLine1"
                            type="text"
                            autoComplete="address-line1"
                            placeholder="House, road"
                            value={form.addressLine1}
                            onChange={set("addressLine1")}
                            className={inputClass}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="addressLine2" className={labelClass}>
                            Address line 2{" "}
                            <span className="font-medium text-stone-500 dark:text-slate-400">
                              (optional)
                            </span>
                          </label>
                          <input
                            id="addressLine2"
                            type="text"
                            autoComplete="address-line2"
                            placeholder="Area, thana"
                            value={form.addressLine2}
                            onChange={set("addressLine2")}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="city" className={labelClass}>
                            City / district
                          </label>
                          <input
                            id="city"
                            type="text"
                            placeholder="Dhaka"
                            value={form.city}
                            onChange={set("city")}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="postcode" className={labelClass}>
                            Post code
                          </label>
                          <input
                            id="postcode"
                            type="text"
                            placeholder="1207"
                            value={form.postcode}
                            onChange={set("postcode")}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="country" className={labelClass}>
                            Country
                          </label>
                          <input
                            id="country"
                            type="text"
                            placeholder="Bangladesh"
                            value={form.country}
                            onChange={set("country")}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="tin" className={labelClass}>
                            TIN{" "}
                            <span className="font-medium text-stone-500 dark:text-slate-400">
                              (optional)
                            </span>
                          </label>
                          <input
                            id="tin"
                            type="text"
                            value={form.tin}
                            onChange={set("tin")}
                            className={inputClass}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label htmlFor="preferredMethod" className={labelClass}>
                            Preferred payment method
                          </label>
                          <select
                            id="preferredMethod"
                            value={form.preferredMethod}
                            onChange={set("preferredMethod")}
                            className={inputClass}
                          >
                            <option value="">No preference</option>
                            {Object.values(PaymentMethod).map((m) => (
                              <option key={m} value={m}>
                                {methodLabels[m]}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Only the fields the chosen method actually needs. */}
                        {wantsWallet && (
                          <div className="sm:col-span-2">
                            <label htmlFor="mobileWalletNumber" className={labelClass}>
                              {methodLabels[form.preferredMethod as PaymentMethod]} account number
                            </label>
                            <input
                              id="mobileWalletNumber"
                              type="tel"
                              placeholder="01XXXXXXXXX"
                              value={form.mobileWalletNumber}
                              onChange={set("mobileWalletNumber")}
                              className={inputClass}
                            />
                          </div>
                        )}

                        {wantsBank && (
                          <>
                            <div>
                              <label htmlFor="bankAccountName" className={labelClass}>
                                Account name
                              </label>
                              <input
                                id="bankAccountName"
                                type="text"
                                value={form.bankAccountName}
                                onChange={set("bankAccountName")}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label htmlFor="bankAccountNumber" className={labelClass}>
                                Account number
                              </label>
                              <input
                                id="bankAccountNumber"
                                type="text"
                                value={form.bankAccountNumber}
                                onChange={set("bankAccountNumber")}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label htmlFor="bankName" className={labelClass}>
                                Bank
                              </label>
                              <input
                                id="bankName"
                                type="text"
                                placeholder="e.g. BRAC Bank"
                                value={form.bankName}
                                onChange={set("bankName")}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label htmlFor="bankBranch" className={labelClass}>
                                Branch
                              </label>
                              <input
                                id="bankBranch"
                                type="text"
                                value={form.bankBranch}
                                onChange={set("bankBranch")}
                                className={inputClass}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </section>
                </Reveal>

                {error && <p className={errClass}>{error}</p>}
                {saved && <p className={okClass}>Account information saved.</p>}

                <button type="submit" disabled={saving} className={buttonClass}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </form>

              {/* ---- Login email (separate: needs the password) ---- */}
              <Reveal delay={40}>
                <section className={`${sectionClass} mt-6`}>
                  <div className="relative z-10">
                    <h2 className="text-lg font-bold">Login email</h2>
                    <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
                      This is the address you sign in with. Changing it needs your password.
                    </p>

                    <form onSubmit={handleEmail} className="mt-6 flex flex-col gap-4">
                      <div>
                        <label htmlFor="loginEmail" className={labelClass}>
                          New email address
                        </label>
                        <input
                          id="loginEmail"
                          type="email"
                          required
                          autoComplete="email"
                          value={emailForm.email}
                          onChange={(e) => {
                            setEmailMsg(null);
                            setEmailForm((f) => ({ ...f, email: e.target.value }));
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label htmlFor="emailPassword" className={labelClass}>
                          Current password
                        </label>
                        <input
                          id="emailPassword"
                          type="password"
                          required
                          autoComplete="current-password"
                          value={emailForm.currentPassword}
                          onChange={(e) => {
                            setEmailMsg(null);
                            setEmailForm((f) => ({ ...f, currentPassword: e.target.value }));
                          }}
                          className={inputClass}
                        />
                      </div>

                      {emailMsg && (
                        <p className={emailMsg.ok ? okClass : errClass}>{emailMsg.text}</p>
                      )}

                      <button type="submit" disabled={emailBusy} className={buttonClass}>
                        {emailBusy ? "Updating…" : "Update email"}
                      </button>
                    </form>
                  </div>
                </section>
              </Reveal>

              {/* ---- Password ---- */}
              <Reveal delay={80}>
                <section className={`${sectionClass} mt-6`}>
                  <div className="relative z-10">
                    <h2 className="text-lg font-bold">Password</h2>
                    <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
                      Changing your password signs you out everywhere else.
                    </p>

                    <form onSubmit={handlePassword} className="mt-6 flex flex-col gap-4">
                      <div>
                        <label htmlFor="currentPassword" className={labelClass}>
                          Current password
                        </label>
                        <input
                          id="currentPassword"
                          type="password"
                          required
                          autoComplete="current-password"
                          value={pwForm.currentPassword}
                          onChange={(e) => {
                            setPwMsg(null);
                            setPwForm((f) => ({ ...f, currentPassword: e.target.value }));
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label htmlFor="newPassword" className={labelClass}>
                          New password
                        </label>
                        <input
                          id="newPassword"
                          type="password"
                          required
                          minLength={8}
                          autoComplete="new-password"
                          placeholder="At least 8 characters"
                          value={pwForm.newPassword}
                          onChange={(e) => {
                            setPwMsg(null);
                            setPwForm((f) => ({ ...f, newPassword: e.target.value }));
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label htmlFor="confirmPassword" className={labelClass}>
                          Confirm new password
                        </label>
                        <input
                          id="confirmPassword"
                          type="password"
                          required
                          minLength={8}
                          autoComplete="new-password"
                          value={pwForm.confirmPassword}
                          onChange={(e) => {
                            setPwMsg(null);
                            setPwForm((f) => ({ ...f, confirmPassword: e.target.value }));
                          }}
                          className={inputClass}
                        />
                      </div>

                      {pwMsg && <p className={pwMsg.ok ? okClass : errClass}>{pwMsg.text}</p>}

                      <button type="submit" disabled={pwBusy} className={buttonClass}>
                        {pwBusy ? "Changing…" : "Change password"}
                      </button>
                    </form>
                  </div>
                </section>
              </Reveal>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
