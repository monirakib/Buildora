"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AtSign,
  BadgeCheck,
  Building2,
  Camera,
  Check,
  ChevronRight,
  CreditCard,
  IdCard,
  Landmark,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Minus,
  Moon,
  Palette,
  PenLine,
  Phone,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  User,
  Wallet,
} from "lucide-react";
import { PaymentMethod, UserRole, VerificationStatus, type SessionUser } from "@buildora/shared";
import { changeEmail, changePassword, logoutUser, updateAccount, uploadImage } from "@/lib/api";
import { smoothScrollToId } from "@/lib/smoothScroll";
import { useSession } from "@/store/useSession";
import { useTheme } from "@/store/useTheme";
import { Navbar } from "@/components/landing/Navbar";
import { Reveal } from "@/components/landing/Reveal";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

/** Small caps label, the way the settings mock-up letters its fields. */
const labelClass =
  "mb-1.5 block text-[0.68rem] font-bold tracking-[0.12em] text-stone-500 uppercase dark:text-slate-400";

/** The eyebrow above each card title ("PROFILE", "BILLING", …). */
const eyebrowClass =
  "text-[0.68rem] font-bold tracking-[0.16em] text-stone-500 uppercase dark:text-slate-400";

/** Liquid-glass surface, matching the navbar and auth cards. */
const glassClass =
  "relative overflow-hidden rounded-3xl border border-white/40 bg-white/30 shadow-2xl shadow-black/10 backdrop-blur-2xl backdrop-saturate-150 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-40 before:bg-linear-to-b before:from-white/40 before:to-transparent before:content-[''] dark:border-white/15 dark:bg-white/10 dark:shadow-black/40 dark:before:from-white/15";

const sectionClass = `${glassClass} scroll-mt-28 p-6 sm:p-8`;

const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 shadow-lg transition hover:scale-[1.02] hover:bg-amber-300 disabled:scale-100 disabled:opacity-50";

/** Quiet secondary action — "Discard", "Upload", the row buttons. */
const ghostButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full border border-stone-300/80 bg-white/60 px-5 py-2.5 text-sm font-bold text-stone-700 backdrop-blur transition hover:bg-white/90 disabled:opacity-40 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10";

/** Inset panel used for the photo row, the security rows and the theme tiles. */
const innerPanelClass =
  "rounded-2xl border border-white/50 bg-white/45 dark:border-white/10 dark:bg-white/5";

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

const verificationLabels: Record<VerificationStatus, string> = {
  [VerificationStatus.PENDING_VERIFICATION]: "Not submitted yet",
  [VerificationStatus.DOCUMENTS_SUBMITTED]: "Documents submitted",
  [VerificationStatus.UNDER_REVIEW]: "Under review",
  [VerificationStatus.APPROVED]: "Platform verified",
  [VerificationStatus.REJECTED]: "Needs attention",
};

const PROFESSIONAL_ROLES: UserRole[] = [
  UserRole.ARCHITECT,
  UserRole.STRUCTURAL_ENGINEER,
  UserRole.CONTRACTOR,
  UserRole.SUPPLIER,
];

/** Left rail entries — each one jumps to the card with the matching id. */
const sections = [
  { id: "profile", label: "Profile", Icon: User },
  { id: "contact", label: "Contact", Icon: Phone },
  { id: "security", label: "Security", Icon: ShieldCheck },
  { id: "billing", label: "Billing", Icon: CreditCard },
  { id: "appearance", label: "Appearance", Icon: Palette },
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

/** "Monir Akib" → "MA", for when there's no profile photo. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
}

/** Card shell: eyebrow + title + optional right-hand slot, on glass. */
function Card({
  id,
  eyebrow,
  title,
  description,
  action,
  delay,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  /** Rendered top-right, opposite the title. */
  action?: React.ReactNode;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <Reveal delay={delay}>
      <section id={id} className={sectionClass}>
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={eyebrowClass}>{eyebrow}</p>
              <h2 className="mt-2 text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h2>
              {description && (
                <p className="mt-1.5 text-sm text-stone-500 dark:text-slate-400">{description}</p>
              )}
            </div>
            {action}
          </div>
          <div className="mt-6">{children}</div>
        </div>
      </section>
    </Reveal>
  );
}

/** One labelled field. `hint` is the grey "(optional)" note beside the label. */
function Field({
  htmlFor,
  label,
  hint,
  className = "",
  children,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
        {hint && (
          <span className="ml-1.5 font-medium tracking-normal normal-case text-stone-400 dark:text-slate-500">
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

/**
 * A row in the security card: icon, title, sub-line, and an action on the
 * right — the list layout from the settings mock-up.
 */
function SecurityRow({
  Icon,
  title,
  sub,
  actionLabel,
  onAction,
  danger,
}: {
  Icon: typeof Lock;
  title: string;
  sub: string;
  actionLabel: string;
  onAction: () => void;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
          danger
            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
            : "bg-amber-400/20 text-amber-700 dark:text-amber-300"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="truncate text-xs text-stone-500 dark:text-slate-400">{sub}</p>
      </div>
      <button
        type="button"
        onClick={onAction}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${
          danger
            ? "text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
            : "text-amber-700 hover:bg-amber-400/15 dark:text-amber-300"
        }`}
      >
        {actionLabel}
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Account settings — personal details, contact points, billing, security and
 * appearance, laid out as a settings console with a sticky section rail.
 *
 * Open to every role. This is deliberately *not* the profile: a professional's
 * credentials are edited in the verification editor, and a land owner's plot
 * details belong to the project brief they post.
 */
export default function AccountPage() {
  const router = useRouter();
  const { user, token, setSession, clearSession } = useSession();
  const themeMode = useTheme((s) => s.mode);
  const setThemeMode = useTheme((s) => s.setMode);

  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Profile photo upload (goes to Cloudinary through the API, same as the
  // verification uploads; the returned URL is saved with the rest of the form).
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Which security panel is expanded — only one at a time, like the mock-up.
  const [openPanel, setOpenPanel] = useState<"email" | "password" | null>(null);

  // Rail highlight: the card currently nearest the top of the viewport.
  const [activeSection, setActiveSection] = useState("profile");

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

  // Highlight the rail entry for whichever card is in view. The rootMargin
  // ignores the top 120px (the fixed navbar) and the bottom 55%, so the
  // "current" card is the topmost one in the reading area.
  const ready = !!form && !!user;
  useEffect(() => {
    if (!ready) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-120px 0px -55% 0px" }
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ready]);

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setSaved(false);
      setForm((f) => (f ? { ...f, [field]: e.target.value } : f));
    };

  /** Same as `set`, for values that don't come from an input event. */
  function setValue(field: keyof FormState, value: string) {
    setSaved(false);
    setForm((f) => (f ? { ...f, [field]: value } : f));
  }

  async function handlePhoto(file: File | undefined) {
    if (!file || !token) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files can be used as a profile photo");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      setValue("avatarUrl", await uploadImage(token, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

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

  // Revoke the session server-side, then leave for the landing page — the same
  // hard navigation the navbar's Log out does.
  function handleSignOut() {
    if (token) logoutUser(token).catch(() => {});
    clearSession();
    window.location.assign("/");
  }

  const isProfessional = !!user && PROFESSIONAL_ROLES.includes(user.role);
  // Bank fields only matter for a bank transfer; the wallet number only for
  // bKash/Nagad. Showing all of them at once is just noise.
  const wantsBank = form?.preferredMethod === PaymentMethod.BANK;
  const wantsWallet =
    form?.preferredMethod === PaymentMethod.BKASH || form?.preferredMethod === PaymentMethod.NAGAD;

  // "Has anything been typed since the last save?" — the saved form is rebuilt
  // from the session user, so comparing the two objects answers it.
  const dirty = !!form && !!user && JSON.stringify(form) !== JSON.stringify(formFromUser(user));

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      {/* pt-28 clears the fixed navbar (top-4 + h-14) */}
      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        {!form || !user ? (
          <p className="text-center text-sm text-stone-500 dark:text-slate-500">Loading…</p>
        ) : (
          <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
            {/* ---- Section rail: a sidebar on desktop, a chip strip on mobile ---- */}
            <aside className="lg:sticky lg:top-28 lg:self-start">
              <nav className={`${glassClass} p-3`}>
                <div className="relative z-10 flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
                  {sections.map(({ id, label, Icon }) => (
                    <a
                      key={id}
                      href={`#${id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        smoothScrollToId(id);
                      }}
                      className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                        activeSection === id
                          ? "bg-amber-400/25 text-stone-900 dark:bg-amber-400/15 dark:text-amber-200"
                          : "text-stone-600 hover:bg-white/50 hover:text-stone-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </a>
                  ))}
                </div>

                {/* Who's signed in — mirrors the workspace chip in the mock-up */}
                <div className="relative z-10 mt-3 hidden border-t border-black/10 pt-3 lg:block dark:border-white/15">
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-white/50 dark:hover:bg-white/10"
                  >
                    {form.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted
                      <img
                        src={form.avatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-400 text-xs font-extrabold text-stone-950">
                        {initialsOf(user.name)}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-extrabold">{user.name}</span>
                      <span className="block truncate text-[0.7rem] text-stone-500 dark:text-slate-400">
                        {roleLabels[user.role] ?? user.role}
                      </span>
                    </span>
                  </Link>
                </div>
              </nav>
            </aside>

            {/* ---- Content column ---- */}
            <div>
              <header>
                <p className={eyebrowClass}>
                  Settings <span className="mx-1 text-stone-400 dark:text-slate-600">/</span>{" "}
                  Account
                </p>
                <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Your account, finely tuned.
                </h1>
                <p className="mt-2 text-sm text-stone-500 dark:text-slate-400">
                  {user.email} · {roleLabels[user.role] ?? user.role}
                </p>
              </header>

              {isProfessional && (
                <p className="mt-5 rounded-2xl border border-white/40 bg-white/40 px-4 py-3 text-sm text-stone-600 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
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

              {/* Wide screens split the settings in two: a main editing column
                  and a narrower side stack. Below xl everything stacks in
                  reading order, so nothing is lost on a phone. */}
              <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
                {/* ================= Main column ================= */}
                <div className="flex flex-col gap-6">
                  {/* ---- Personal details + contact + billing (one form, one save) ---- */}
                  <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    <Card
                      id="profile"
                      eyebrow="Profile"
                      title="The details people see"
                      description="Who you are on Buildora."
                      action={
                        saved ? (
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                            <Check className="h-3.5 w-3.5" /> Saved
                          </span>
                        ) : undefined
                      }
                    >
                      {/* Profile photo */}
                      <div
                        className={`${innerPanelClass} flex flex-col gap-4 p-4 sm:flex-row sm:items-center`}
                      >
                        <span className="relative shrink-0">
                          {form.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted
                            <img
                              src={form.avatarUrl}
                              alt=""
                              className="h-16 w-16 rounded-full object-cover"
                            />
                          ) : (
                            <span className="grid h-16 w-16 place-items-center rounded-full bg-amber-400 text-xl font-extrabold text-stone-950">
                              {initialsOf(user.name)}
                            </span>
                          )}
                          <span className="absolute -right-1 -bottom-1 grid h-6 w-6 place-items-center rounded-full bg-stone-900 text-white dark:bg-white dark:text-stone-900">
                            {uploading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Camera className="h-3.5 w-3.5" />
                            )}
                          </span>
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold">Profile photo</p>
                          <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
                            A clear, friendly photo helps clients and professionals recognise you.
                            It goes live when you save.
                          </p>
                        </div>

                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = ""; // allow re-picking the same file later
                            handlePhoto(file);
                          }}
                        />
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            disabled={uploading}
                            onClick={() => photoInputRef.current?.click()}
                            className={`${ghostButtonClass} px-4 py-2 text-xs`}
                          >
                            <Upload className="h-3.5 w-3.5" />
                            {uploading ? "Uploading…" : "Upload"}
                          </button>
                          {form.avatarUrl && (
                            <button
                              type="button"
                              onClick={() => setValue("avatarUrl", "")}
                              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-stone-500 transition hover:bg-rose-500/10 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remove
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <Field
                          htmlFor="username"
                          label="Username"
                          hint="(permanent)"
                          className="sm:col-span-2"
                        >
                          <input
                            id="username"
                            type="text"
                            value={user.username}
                            readOnly
                            disabled
                            className={`${inputClass} cursor-not-allowed opacity-70`}
                          />
                        </Field>
                        <Field htmlFor="name" label="Full name">
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
                        </Field>
                        <Field htmlFor="nid" label="NID number" hint="(for verification)">
                          <input
                            id="nid"
                            type="text"
                            placeholder="10, 13 or 17 digits"
                            value={form.nid}
                            onChange={set("nid")}
                            className={inputClass}
                          />
                        </Field>
                        <Field
                          htmlFor="company"
                          label="Company / organisation"
                          hint="(optional)"
                          className="sm:col-span-2"
                        >
                          <input
                            id="company"
                            type="text"
                            value={form.company}
                            onChange={set("company")}
                            className={inputClass}
                          />
                        </Field>
                        <Field
                          htmlFor="bio"
                          label="About you"
                          hint="(optional)"
                          className="sm:col-span-2"
                        >
                          <textarea
                            id="bio"
                            rows={3}
                            maxLength={500}
                            placeholder="A few lines about yourself."
                            value={form.bio}
                            onChange={set("bio")}
                            className={inputClass}
                          />
                        </Field>
                      </div>
                    </Card>

                    <Card
                      id="contact"
                      eyebrow="Contact"
                      title="Where we reach you"
                      description="For project updates, payments, and permit notices."
                      delay={60}
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field htmlFor="phone" label="Primary phone">
                          <div className="relative">
                            <Phone className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-slate-500" />
                            <input
                              id="phone"
                              type="tel"
                              autoComplete="tel"
                              placeholder="01XXXXXXXXX"
                              value={form.phone}
                              onChange={set("phone")}
                              className={`${inputClass} pl-10`}
                            />
                          </div>
                        </Field>
                        <Field htmlFor="altPhone" label="Alternate phone" hint="(optional)">
                          <div className="relative">
                            <Phone className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-slate-500" />
                            <input
                              id="altPhone"
                              type="tel"
                              placeholder="Office or site contact"
                              value={form.altPhone}
                              onChange={set("altPhone")}
                              className={`${inputClass} pl-10`}
                            />
                          </div>
                        </Field>
                        <Field
                          htmlFor="recoveryEmail"
                          label="Recovery email"
                          hint="(receipts and account recovery)"
                          className="sm:col-span-2"
                        >
                          <div className="relative">
                            <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-slate-500" />
                            <input
                              id="recoveryEmail"
                              type="email"
                              placeholder="another@example.com"
                              value={form.recoveryEmail}
                              onChange={set("recoveryEmail")}
                              className={`${inputClass} pl-10`}
                            />
                          </div>
                        </Field>
                      </div>
                    </Card>

                    <Card
                      id="billing"
                      eyebrow="Billing"
                      title="Where invoices go"
                      description="Used to pre-fill escrow deposits and payouts. We never store card numbers."
                      delay={60}
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          htmlFor="billingName"
                          label="Billed to"
                          hint="(if different from your name)"
                          className="sm:col-span-2"
                        >
                          <input
                            id="billingName"
                            type="text"
                            value={form.billingName}
                            onChange={set("billingName")}
                            className={inputClass}
                          />
                        </Field>
                        <Field htmlFor="addressLine1" label="Address" className="sm:col-span-2">
                          <div className="relative">
                            <MapPin className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-slate-500" />
                            <input
                              id="addressLine1"
                              type="text"
                              autoComplete="address-line1"
                              placeholder="House, road"
                              value={form.addressLine1}
                              onChange={set("addressLine1")}
                              className={`${inputClass} pl-10`}
                            />
                          </div>
                        </Field>
                        <Field
                          htmlFor="addressLine2"
                          label="Address line 2"
                          hint="(optional)"
                          className="sm:col-span-2"
                        >
                          <input
                            id="addressLine2"
                            type="text"
                            autoComplete="address-line2"
                            placeholder="Area, thana"
                            value={form.addressLine2}
                            onChange={set("addressLine2")}
                            className={inputClass}
                          />
                        </Field>
                        <Field htmlFor="city" label="City / district">
                          <input
                            id="city"
                            type="text"
                            placeholder="Dhaka"
                            value={form.city}
                            onChange={set("city")}
                            className={inputClass}
                          />
                        </Field>
                        <Field htmlFor="postcode" label="Post code">
                          <input
                            id="postcode"
                            type="text"
                            placeholder="1207"
                            value={form.postcode}
                            onChange={set("postcode")}
                            className={inputClass}
                          />
                        </Field>
                        <Field htmlFor="country" label="Country">
                          <input
                            id="country"
                            type="text"
                            placeholder="Bangladesh"
                            value={form.country}
                            onChange={set("country")}
                            className={inputClass}
                          />
                        </Field>
                        <Field htmlFor="tin" label="TIN" hint="(optional)">
                          <input
                            id="tin"
                            type="text"
                            value={form.tin}
                            onChange={set("tin")}
                            className={inputClass}
                          />
                        </Field>
                      </div>
                    </Card>

                    {error && <p className={errClass}>{error}</p>}

                    {/* Save bar — sticks to the bottom of the viewport while you
                    work through the cards, so Save is never off-screen.
                    Deliberately outside <Reveal>: its transform would break
                    `sticky`. */}
                    <div
                      className={`${glassClass} sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-3`}
                    >
                      <p className="relative z-10 text-sm font-semibold text-stone-500 dark:text-slate-400">
                        {dirty
                          ? "You have unsaved changes"
                          : saved
                            ? "Account information saved."
                            : "Everything is up to date"}
                      </p>
                      <div className="relative z-10 flex gap-2">
                        <button
                          type="button"
                          disabled={!dirty || saving}
                          onClick={() => {
                            setForm(formFromUser(user));
                            setError(null);
                            setSaved(false);
                          }}
                          className={ghostButtonClass}
                        >
                          Discard
                        </button>
                        <button
                          type="submit"
                          disabled={saving || !dirty}
                          className={primaryButtonClass}
                        >
                          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                          {saving ? "Saving…" : "Save changes"}
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* ---- Sign-in & security ---- */}
                  <Card
                    id="security"
                    eyebrow="Sign-in & security"
                    title="Protected by you"
                    description="The address you sign in with, and the password that guards it."
                    action={
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-600 dark:text-emerald-300">
                        <ShieldCheck className="h-4.5 w-4.5" />
                      </span>
                    }
                  >
                    <div
                      className={`${innerPanelClass} divide-y divide-black/5 dark:divide-white/10`}
                    >
                      <SecurityRow
                        Icon={AtSign}
                        title="Login email"
                        sub={user.email}
                        actionLabel={openPanel === "email" ? "Close" : "Update"}
                        onAction={() => setOpenPanel(openPanel === "email" ? null : "email")}
                      />
                      {openPanel === "email" && (
                        <form onSubmit={handleEmail} className="flex flex-col gap-4 p-4">
                          <p className="text-xs text-stone-500 dark:text-slate-400">
                            This is the address you sign in with. Changing it needs your password.
                          </p>
                          <Field htmlFor="loginEmail" label="New email address">
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
                          </Field>
                          <Field htmlFor="emailPassword" label="Current password">
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
                          </Field>
                          {emailMsg && (
                            <p className={emailMsg.ok ? okClass : errClass}>{emailMsg.text}</p>
                          )}
                          <button
                            type="submit"
                            disabled={emailBusy}
                            className={`${primaryButtonClass} self-start`}
                          >
                            {emailBusy ? "Updating…" : "Update email"}
                          </button>
                        </form>
                      )}

                      <SecurityRow
                        Icon={Lock}
                        title="Password"
                        sub="Changing it signs you out on every other device"
                        actionLabel={openPanel === "password" ? "Close" : "Update"}
                        onAction={() => setOpenPanel(openPanel === "password" ? null : "password")}
                      />
                      {openPanel === "password" && (
                        <form onSubmit={handlePassword} className="flex flex-col gap-4 p-4">
                          <Field htmlFor="currentPassword" label="Current password">
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
                          </Field>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field htmlFor="newPassword" label="New password">
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
                            </Field>
                            <Field htmlFor="confirmPassword" label="Confirm new password">
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
                            </Field>
                          </div>
                          {pwMsg && <p className={pwMsg.ok ? okClass : errClass}>{pwMsg.text}</p>}
                          <button
                            type="submit"
                            disabled={pwBusy}
                            className={`${primaryButtonClass} self-start`}
                          >
                            {pwBusy ? "Changing…" : "Change password"}
                          </button>
                        </form>
                      )}
                    </div>
                  </Card>
                </div>

                {/* ================= Side column ================= */}
                <div className="flex flex-col gap-6">
                  {/* ---- Role card: the dark "plan" panel from the mock-up, but
                        carrying real account standing ---- */}
                  <Reveal>
                    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-stone-950 p-6 text-white shadow-2xl shadow-black/30 sm:p-8">
                      {/* Warm glow behind the top-right corner */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-amber-400/25 blur-3xl"
                      />
                      <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-[0.68rem] font-bold tracking-[0.16em] text-white/50 uppercase">
                            Your role on Buildora
                          </p>
                          <h2 className="mt-2 text-2xl font-extrabold tracking-tight">
                            {roleLabels[user.role] ?? user.role}
                          </h2>
                          <p className="mt-1.5 text-sm text-white/60">
                            Signed in as @{user.username}
                          </p>
                        </div>
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10">
                          <IdCard className="h-5 w-5 text-amber-300" />
                        </span>
                      </div>

                      {/* Verification standing only means something for the
                        professional roles — land owners never submit documents. */}
                      {isProfessional && (
                        <div className="relative z-10 mt-6 flex flex-wrap items-center gap-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                              user.verificationStatus === VerificationStatus.APPROVED
                                ? "bg-emerald-400/20 text-emerald-300"
                                : user.verificationStatus === VerificationStatus.REJECTED
                                  ? "bg-rose-400/20 text-rose-300"
                                  : "bg-amber-400/20 text-amber-200"
                            }`}
                          >
                            <BadgeCheck className="h-3.5 w-3.5" />
                            {verificationLabels[user.verificationStatus]}
                          </span>
                        </div>
                      )}

                      <Link
                        href={
                          isProfessional
                            ? "/profile/professional"
                            : user.role === UserRole.ADMIN
                              ? "/admin"
                              : "/projects/new"
                        }
                        className="relative z-10 mt-6 flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold transition hover:bg-white/15"
                      >
                        <span className="inline-flex items-center gap-2">
                          {isProfessional ? (
                            <>
                              <PenLine className="h-4 w-4 text-amber-300" />
                              Manage your public profile
                            </>
                          ) : user.role === UserRole.ADMIN ? (
                            <>
                              <ShieldCheck className="h-4 w-4 text-amber-300" />
                              Open the admin console
                            </>
                          ) : (
                            <>
                              <Building2 className="h-4 w-4 text-amber-300" />
                              Post a project brief
                            </>
                          )}
                        </span>
                        <ChevronRight className="h-4 w-4 text-white/60" />
                      </Link>
                    </div>
                  </Reveal>

                  {/* ---- Payment method. Sits outside the account <form> — every
                        value is React state, so the Save button in the main
                        column still sends these along. ---- */}
                  <Card
                    id="payment"
                    eyebrow="Billing"
                    title="Payment method"
                    description="How you prefer to send and receive money."
                    delay={40}
                  >
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                      {[
                        { value: PaymentMethod.BKASH, label: "bKash", Icon: Wallet },
                        { value: PaymentMethod.NAGAD, label: "Nagad", Icon: Wallet },
                        { value: PaymentMethod.BANK, label: "Bank transfer", Icon: Landmark },
                        { value: "", label: "No preference", Icon: Minus },
                      ].map(({ value, label, Icon }) => (
                        <button
                          key={value || "none"}
                          type="button"
                          onClick={() => setValue("preferredMethod", value)}
                          aria-pressed={form.preferredMethod === value}
                          className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-bold transition ${
                            form.preferredMethod === value
                              ? "border-amber-400 bg-amber-400/20 text-stone-900 dark:text-amber-100"
                              : "border-white/50 bg-white/45 text-stone-600 hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                          }`}
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-stone-900/10 dark:bg-white/10">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1 truncate">{label}</span>
                          {form.preferredMethod === value && (
                            <Check className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Only the fields the chosen method actually needs. */}
                    {wantsWallet && (
                      <div className="mt-4">
                        <Field
                          htmlFor="mobileWalletNumber"
                          label={`${methodLabels[form.preferredMethod as PaymentMethod]} account number`}
                        >
                          <div className="relative">
                            <Wallet className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-slate-500" />
                            <input
                              id="mobileWalletNumber"
                              type="tel"
                              placeholder="01XXXXXXXXX"
                              value={form.mobileWalletNumber}
                              onChange={set("mobileWalletNumber")}
                              className={`${inputClass} pl-10`}
                            />
                          </div>
                        </Field>
                      </div>
                    )}

                    {wantsBank && (
                      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                        <Field htmlFor="bankAccountName" label="Account name">
                          <input
                            id="bankAccountName"
                            type="text"
                            value={form.bankAccountName}
                            onChange={set("bankAccountName")}
                            className={inputClass}
                          />
                        </Field>
                        <Field htmlFor="bankAccountNumber" label="Account number">
                          <input
                            id="bankAccountNumber"
                            type="text"
                            value={form.bankAccountNumber}
                            onChange={set("bankAccountNumber")}
                            className={inputClass}
                          />
                        </Field>
                        <Field htmlFor="bankName" label="Bank">
                          <input
                            id="bankName"
                            type="text"
                            placeholder="e.g. BRAC Bank"
                            value={form.bankName}
                            onChange={set("bankName")}
                            className={inputClass}
                          />
                        </Field>
                        <Field htmlFor="bankBranch" label="Branch">
                          <input
                            id="bankBranch"
                            type="text"
                            value={form.bankBranch}
                            onChange={set("bankBranch")}
                            className={inputClass}
                          />
                        </Field>
                      </div>
                    )}
                  </Card>

                  {/* ---- Appearance ---- */}
                  <Card
                    id="appearance"
                    eyebrow="Preferences"
                    title="How Buildora looks"
                    description="Saved in this browser, applied the moment you pick."
                    delay={60}
                  >
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      {[
                        {
                          mode: "day" as const,
                          label: "Day",
                          sub: "Warm stone and daylight",
                          Icon: Sun,
                        },
                        {
                          mode: "night" as const,
                          label: "Night",
                          sub: "Deep slate, easier after dark",
                          Icon: Moon,
                        },
                      ].map(({ mode, label, sub, Icon }) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setThemeMode(mode)}
                          aria-pressed={themeMode === mode}
                          className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
                            themeMode === mode
                              ? "border-amber-400 bg-amber-400/20"
                              : "border-white/50 bg-white/45 hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                          }`}
                        >
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-900/10 text-stone-700 dark:bg-white/10 dark:text-amber-200">
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold">{label}</span>
                            <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                              {sub}
                            </span>
                          </span>
                          {themeMode === mode && (
                            <Check className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                          )}
                        </button>
                      ))}
                    </div>
                  </Card>

                  {/* Quiet, deliberately last: revokes this login server-side and
                    drops you back on the landing page. */}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="inline-flex items-center gap-2 self-start rounded-full px-3 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out of this device
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
