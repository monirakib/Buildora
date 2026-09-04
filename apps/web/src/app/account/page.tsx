"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AtSign,
  BadgeCheck,
  Camera,
  Check,
  CreditCard,
  Landmark,
  Laptop,
  Loader2,
  Lock,
  LogOut,
  type LucideIcon,
  MapPin,
  Minus,
  Monitor,
  Moon,
  BellRing,
  Palette,
  Phone,
  Shield,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  Wallet,
} from "lucide-react";
import {
  PaymentMethod,
  UserRole,
  VerificationStatus,
  type AccountSession,
  type SessionUser,
} from "@buildora/shared";
import {
  changeEmail,
  changePassword,
  listSessions,
  revokeSessions,
  updateAccount,
  uploadImage,
} from "@/lib/api";
import { useSession } from "@/store/useSession";
import { useTheme } from "@/store/useTheme";
import { NidCheckPanel } from "@/components/app/NidCheckPanel";
import { AccountShell, initialsOf, type NavGroup } from "@/components/account/AccountShell";
import { EmailVerifyBanner } from "@/components/account/EmailVerifyBanner";
import { NotificationsSection } from "@/components/account/NotificationsSection";
import {
  ActionRow,
  Card,
  EmptyState,
  FieldRow,
  List,
  Meter,
  Modal,
  StatTile,
  StatusPill,
  Tabs,
  ToastStack,
  dangerButtonClass,
  ghostButtonClass,
  inputClass,
  primaryButtonClass,
  useToasts,
} from "@/components/account/ui";

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
  // Only ever a *record* of how something was paid, never a payout preference —
  // the picker below offers the three real channels and not this one.
  [PaymentMethod.SSLCOMMERZ]: "Online payment",
};

const verificationLabels: Record<VerificationStatus, string> = {
  [VerificationStatus.PENDING_VERIFICATION]: "Not submitted",
  [VerificationStatus.DOCUMENTS_SUBMITTED]: "Submitted",
  [VerificationStatus.UNDER_REVIEW]: "Under review",
  [VerificationStatus.APPROVED]: "Verified",
  [VerificationStatus.REJECTED]: "Needs attention",
};

const PROFESSIONAL_ROLES: UserRole[] = [
  UserRole.ARCHITECT,
  UserRole.STRUCTURAL_ENGINEER,
  UserRole.CONTRACTOR,
  UserRole.SUPPLIER,
];

type SectionId = "profile" | "contact" | "security" | "billing" | "notifications" | "appearance";

/** One side of the NID card: a file picker, or a thumbnail once uploaded. */
function NidPhotoField({
  label,
  value,
  disabled,
  onPick,
  onClear,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onPick: (file: File | undefined) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-stone-600 dark:text-slate-400">{label}</p>
      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */}
          <img
            src={value}
            alt={`NID ${label.toLowerCase()}`}
            className="h-16 w-24 rounded-lg border border-white/40 object-cover dark:border-white/10"
          />
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-bold text-stone-500 transition hover:text-rose-600 dark:text-slate-400"
          >
            Remove
          </button>
        </div>
      ) : (
        <label className="flex h-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-stone-300 text-xs font-semibold text-stone-500 transition hover:border-amber-500 hover:text-amber-700 dark:border-white/20 dark:text-slate-400">
          <input
            type="file"
            accept="image/*"
            disabled={disabled}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // allow re-picking the same file
              onPick(file);
            }}
          />
          {disabled ? "Uploading…" : "Upload photo"}
        </label>
      )}
    </div>
  );
}

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
    // Identity evidence — the NID pre-screen reads the front image and compares
    // the birth date against a 17-digit NID's built-in year.
    nidFrontUrl: p?.nidFrontUrl ?? "",
    nidBackUrl: p?.nidBackUrl ?? "",
    dateOfBirth: p?.dateOfBirth ?? "",
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
 * The details that count towards a complete account, grouped by the section
 * they're edited in. Only optional fields are listed — `name` is required at
 * signup, so counting it would inflate every score by the same amount.
 */
const COMPLETENESS: Record<"profile" | "contact" | "billing", (keyof FormState)[]> = {
  profile: ["avatarUrl", "nid", "nidFrontUrl", "dateOfBirth", "company", "bio"],
  contact: ["phone", "altPhone", "recoveryEmail"],
  billing: ["billingName", "addressLine1", "city", "postcode", "country", "preferredMethod"],
};

/** How much of the account is filled in, overall and per section. */
function completenessOf(form: FormState) {
  const missing = { profile: 0, contact: 0, billing: 0 };
  let filled = 0;
  let total = 0;

  for (const [section, fields] of Object.entries(COMPLETENESS)) {
    for (const field of fields) {
      total += 1;
      if (form[field].trim()) filled += 1;
      else missing[section as keyof typeof missing] += 1;
    }
  }

  return { filled, total, missing, percent: total === 0 ? 0 : (filled / total) * 100 };
}

/**
 * Turns a User-Agent string into something a person recognises, e.g.
 * "Chrome on Windows". Deliberately a handful of checks rather than a parsing
 * library: it only has to be good enough to tell your own logins apart.
 *
 * Order matters. Every browser on iOS is Safari underneath and says so in its
 * User-Agent, so the iOS-specific markers (CriOS, FxiOS, EdgiOS, OPiOS) have to
 * be tested before the plain Safari check or they all come out as "Safari".
 * Chromium browsers that deliberately impersonate Chrome — Brave, Vivaldi —
 * can't be told apart here, and show up as Chrome.
 */
function describeDevice(userAgent?: string): { name: string; Icon: LucideIcon } {
  if (!userAgent) return { name: "Unknown device", Icon: Monitor };

  const browser = /Edg\/|EdgiOS\//.test(userAgent)
    ? "Edge"
    : /OPR\/|OPiOS\//.test(userAgent)
      ? "Opera"
      : /Firefox\/|FxiOS\//.test(userAgent)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";

  const mobile = /Android|iPhone|iPad|Mobile/.test(userAgent);
  const platform = /Windows/.test(userAgent)
    ? "Windows"
    : /iPhone|iPad|iPod/.test(userAgent)
      ? "iOS"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Android/.test(userAgent)
          ? "Android"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "another platform";

  return { name: `${browser} on ${platform}`, Icon: mobile ? Smartphone : Laptop };
}

/** "3 minutes ago" from an ISO timestamp. */
function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Account console — the settings for personal details, contact points,
 * security, billing and appearance, laid out as a dashboard: a sidebar spine
 * on the left, this account's standing across the top, and one section of
 * editable lists at a time.
 *
 * Open to every role. This is deliberately *not* the public profile: a
 * professional's credentials are edited in the verification editor, and a land
 * owner's plot details belong to the project brief they post.
 */
export default function AccountPage() {
  const router = useRouter();
  const { user, token, setSession } = useSession();
  const themeMode = useTheme((s) => s.mode);
  const setThemeMode = useTheme((s) => s.setMode);
  const { toasts, pushToast, dismissToast } = useToasts();

  const [section, setSection] = useState<SectionId>("profile");
  const [billingTab, setBillingTab] = useState<"address" | "payout">("address");

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  // Profile photo upload (goes to Cloudinary through the API, same as the
  // verification uploads; the returned URL is saved with the rest of the form).
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Security dialogs — blocking, because each one has to be finished or cancelled.
  const [dialog, setDialog] = useState<"email" | "password" | null>(null);
  const [emailForm, setEmailForm] = useState({ email: "", currentPassword: "" });
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Active logins, plus which rows are ticked.
  const [sessions, setSessions] = useState<AccountSession[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [revoking, setRevoking] = useState(false);

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

  const loadSessions = useCallback(async () => {
    if (!token) return;
    try {
      setSessions(await listSessions(token));
    } catch {
      // Not fatal — the rest of the console still works, so show an empty
      // list rather than blocking the page on it.
      setSessions([]);
    }
  }, [token]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => (f ? { ...f, [field]: e.target.value } : f));
    };

  /** Same as `set`, for values that don't come from an input event. */
  function setValue(field: keyof FormState, value: string) {
    setForm((f) => (f ? { ...f, [field]: value } : f));
  }

  async function handlePhoto(file: File | undefined) {
    if (!file || !token) return;
    if (!file.type.startsWith("image/")) {
      pushToast("Only image files can be used as a profile photo", "error");
      return;
    }
    setUploading(true);
    try {
      setValue("avatarUrl", await uploadImage(token, file));
      pushToast("Photo uploaded, save to make it live");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  /**
   * Uploads one side of the NID card. Same route as the profile photo — the
   * API stores it on Cloudinary and hands back the URL, which the NID check
   * then reads once the form is saved.
   */
  async function handleNidPhoto(side: "nidFrontUrl" | "nidBackUrl", file: File | undefined) {
    if (!file || !token) return;
    if (!file.type.startsWith("image/")) {
      pushToast("Your NID card has to be an image file", "error");
      return;
    }
    setUploading(true);
    try {
      setValue(side, await uploadImage(token, file));
      pushToast("NID photo uploaded, save, then run the check");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!form || !token) return;
    setSaving(true);
    try {
      const updated = await updateAccount(token, form);
      setSession(updated, token); // keep the rest of the app in sync
      pushToast("Account information saved.");
    } catch (err) {
      pushToast(
        err instanceof TypeError
          ? "Can't reach the server. Please try again in a moment."
          : err instanceof Error
            ? err.message
            : "Something went wrong",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setEmailError(null);
    setEmailBusy(true);
    try {
      const updated = await changeEmail(token, emailForm);
      setSession(updated, token);
      setEmailForm({ email: updated.email, currentPassword: "" });
      setDialog(null);
      // The dialog covered the page while this ran, so confirm it afterwards.
      pushToast("Email updated. Use it to sign in from now on.");
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Couldn't change your email");
    } finally {
      setEmailBusy(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setPwError(null);
    setPwBusy(true);
    try {
      await changePassword(token, pwForm);
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setDialog(null);
      pushToast("Password changed. Every other login has been signed out.");
      loadSessions(); // those other logins are gone now
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Couldn't change your password");
    } finally {
      setPwBusy(false);
    }
  }

  /**
   * Sign out the ticked logins. The rows disappear immediately rather than
   * after the round trip — the request almost always succeeds, and waiting for
   * it just makes the console feel slow. If it does fail, the rows come back
   * and a toast says why.
   */
  async function handleRevokeSelected() {
    if (!token || selected.length === 0 || !sessions) return;
    const ids = selected;
    const previous = sessions;

    setSessions(previous.filter((s) => !ids.includes(s.id)));
    setSelected([]);
    setRevoking(true);
    try {
      await revokeSessions(token, ids);
      pushToast(`Signed out ${ids.length} login${ids.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setSessions(previous); // put them back — nothing actually changed
      pushToast(err instanceof Error ? err.message : "Couldn't sign those logins out", "error");
    } finally {
      setRevoking(false);
    }
  }

  // Signing out lives in the navbar's account menu, on every page — so there's
  // deliberately no sign-out handler here.

  if (!mounted || !user || !form) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="text-sm text-stone-500 dark:text-slate-400">Loading your account…</p>
      </div>
    );
  }

  const isProfessional = PROFESSIONAL_ROLES.includes(user.role);
  // Bank fields only matter for a bank transfer; the wallet number only for
  // bKash/Nagad. Showing all of them at once is just noise.
  const wantsBank = form.preferredMethod === PaymentMethod.BANK;
  const wantsWallet =
    form.preferredMethod === PaymentMethod.BKASH || form.preferredMethod === PaymentMethod.NAGAD;

  // "What's been typed since the last save?" — the saved form is rebuilt from
  // the session user, so comparing the two field by field answers it, and the
  // count is what the unsaved-changes bar reports.
  const saved = formFromUser(user);
  const changedFields = (Object.keys(form) as (keyof FormState)[]).filter(
    (field) => form[field] !== saved[field]
  );
  const dirty = changedFields.length > 0;

  const progress = completenessOf(form);
  const otherSessions = sessions?.filter((s) => !s.current) ?? [];
  const allOthersSelected = otherSessions.length > 0 && selected.length === otherSessions.length;

  const navGroups: NavGroup[] = [
    {
      heading: "Account",
      items: [
        {
          id: "profile",
          label: "Profile",
          icon: <User className="h-4.5 w-4.5" />,
          badge: progress.missing.profile,
        },
        {
          id: "contact",
          label: "Contact",
          icon: <Phone className="h-4.5 w-4.5" />,
          badge: progress.missing.contact,
        },
        { id: "security", label: "Security", icon: <ShieldCheck className="h-4.5 w-4.5" /> },
        {
          id: "billing",
          label: "Billing",
          icon: <CreditCard className="h-4.5 w-4.5" />,
          badge: progress.missing.billing,
        },
      ],
    },
    {
      heading: "Preferences",
      items: [
        {
          id: "notifications",
          label: "Notifications",
          icon: <BellRing className="h-4.5 w-4.5" />,
        },
        { id: "appearance", label: "Appearance", icon: <Palette className="h-4.5 w-4.5" /> },
      ],
    },
  ];

  const sectionTitles: Record<SectionId, { title: string; subtitle: string }> = {
    profile: { title: "Profile", subtitle: "The details people see on Buildora" },
    contact: { title: "Contact", subtitle: "For project updates, payments and permit notices" },
    security: { title: "Security", subtitle: "How you sign in, and where you're signed in" },
    billing: { title: "Billing", subtitle: "Where invoices go and how you're paid" },
    notifications: {
      title: "Notifications",
      subtitle: "How Buildora reaches you when you're away",
    },
    appearance: { title: "Appearance", subtitle: "Saved in this browser" },
  };

  /** The nudge card at the foot of the sidebar — only when there's a real one. */
  const notice =
    isProfessional && user.verificationStatus !== VerificationStatus.APPROVED ? (
      <Link
        href="/profile/professional"
        className="block rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 transition hover:bg-amber-400/20"
      >
        <p className="flex items-center gap-1.5 text-xs font-extrabold text-amber-800 dark:text-amber-200">
          <BadgeCheck className="h-3.5 w-3.5" />
          Get verified
        </p>
        <p className="mt-1 text-[0.7rem] leading-relaxed text-stone-600 dark:text-slate-400">
          Verified professionals appear first in the directory. Finish your credentials to apply.
        </p>
      </Link>
    ) : progress.filled < progress.total ? (
      <div className="rounded-2xl border border-white/50 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
        <p className="text-xs font-extrabold">Almost there</p>
        <p className="mt-1 text-[0.7rem] leading-relaxed text-stone-600 dark:text-slate-400">
          {progress.total - progress.filled} more detail
          {progress.total - progress.filled === 1 ? "" : "s"} and your account is complete.
        </p>
      </div>
    ) : null;

  return (
    <AccountShell
      user={user}
      avatarUrl={form.avatarUrl}
      roleLabel={roleLabels[user.role] ?? user.role}
      groups={navGroups}
      active={section}
      onSelect={(id) => setSection(id as SectionId)}
      title={sectionTitles[section].title}
      subtitle={sectionTitles[section].subtitle}
      notice={notice}
    >
      {/* Above everything, and in every section: an unconfirmed address means
          no email reaches this account at all. Renders nothing once confirmed. */}
      {token && (
        <EmailVerifyBanner
          token={token}
          email={user.email}
          verified={user.emailVerified}
          onToast={pushToast}
        />
      )}

      {/* ============ What matters most, across the top ============ */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Profile completeness"
          value={`${Math.round(progress.percent)}%`}
          foot={`${progress.filled} of ${progress.total} details added`}
        >
          <Meter percent={progress.percent} label="Profile completeness" />
        </StatTile>

        <StatTile
          label="Active logins"
          value={sessions === null ? "-" : `${sessions.length}`}
          icon={<Monitor className="h-4 w-4" />}
          foot={
            sessions === null
              ? "Loading…"
              : sessions.length === 1
                ? "This login only"
                : `${otherSessions.length} other login${otherSessions.length === 1 ? "" : "s"}`
          }
        />

        {isProfessional ? (
          <StatTile
            label="Verification"
            value={verificationLabels[user.verificationStatus]}
            icon={<Shield className="h-4 w-4" />}
            foot={
              user.verificationStatus === VerificationStatus.APPROVED ? (
                <StatusPill tone="good" icon={<BadgeCheck className="h-3.5 w-3.5" />}>
                  Platform verified
                </StatusPill>
              ) : user.verificationStatus === VerificationStatus.REJECTED ? (
                <StatusPill tone="critical" icon={<TriangleAlert className="h-3.5 w-3.5" />}>
                  Action needed
                </StatusPill>
              ) : (
                <StatusPill tone="warning" icon={<Shield className="h-3.5 w-3.5" />}>
                  {roleLabels[user.role] ?? user.role}
                </StatusPill>
              )
            }
          />
        ) : (
          <StatTile
            label="Preferred payout"
            value={
              form.preferredMethod ? methodLabels[form.preferredMethod as PaymentMethod] : "Not set"
            }
            icon={<Wallet className="h-4 w-4" />}
            foot={`Signed in as @${user.username}`}
          />
        )}
      </div>

      {/* ============ The section you picked in the sidebar ============ */}
      <div className="mt-5 grid gap-4">
        {section === "profile" && (
          <>
            <Card title="Profile photo" description="How you appear across the platform.">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
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

                <p className="min-w-0 flex-1 text-xs text-stone-500 dark:text-slate-400">
                  A clear, friendly photo helps clients and professionals recognise you. It goes
                  live when you save.
                </p>

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
                    className={ghostButtonClass}
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
            </Card>

            <Card title="Personal details" description="Who you are on Buildora." bodyClassName="">
              <List>
                <FieldRow label="Username" hint="Permanent, chosen at signup" htmlFor="username">
                  <input
                    id="username"
                    type="text"
                    value={user.username}
                    readOnly
                    disabled
                    className={`${inputClass} cursor-not-allowed opacity-60`}
                  />
                </FieldRow>
                <FieldRow label="Full name" htmlFor="name">
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
                </FieldRow>
                <FieldRow label="NID number" hint="Used for verification" htmlFor="nid">
                  <input
                    id="nid"
                    type="text"
                    inputMode="numeric"
                    placeholder="10, 13 or 17 digits"
                    value={form.nid}
                    onChange={set("nid")}
                    className={inputClass}
                  />
                </FieldRow>
                <FieldRow
                  label="Date of birth"
                  hint="Cross-checked against a 17-digit NID"
                  htmlFor="dateOfBirth"
                >
                  <input
                    id="dateOfBirth"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={set("dateOfBirth")}
                    className={inputClass}
                  />
                </FieldRow>
                <FieldRow label="NID card photos" hint="The front is read automatically">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <NidPhotoField
                      label="Front"
                      value={form.nidFrontUrl}
                      disabled={uploading}
                      onPick={(file) => handleNidPhoto("nidFrontUrl", file)}
                      onClear={() => setValue("nidFrontUrl", "")}
                    />
                    <NidPhotoField
                      label="Back"
                      value={form.nidBackUrl}
                      disabled={uploading}
                      onPick={(file) => handleNidPhoto("nidBackUrl", file)}
                      onClear={() => setValue("nidBackUrl", "")}
                    />
                  </div>
                </FieldRow>
                <FieldRow label="Identity check" hint="Save your changes before running it">
                  <NidCheckPanel
                    nid={form.nid}
                    dateOfBirth={form.dateOfBirth}
                    permanentDistrict={user.profile?.permanentDistrict}
                    permanentPostcode={user.profile?.permanentPostcode}
                    hasCardImage={!!form.nidFrontUrl}
                    saved={user.profile?.nidCheck}
                  />
                  {/* These fields feed verification but don't complete it — the
                      address and declaration steps live in the wizard, and only
                      a submitted request reaches a supervisor. */}
                  <p className="mt-3 text-xs text-stone-500 dark:text-slate-500">
                    Getting verified also needs your registered address and a signed declaration.{" "}
                    <Link
                      href="/verify"
                      className="font-semibold text-amber-700 hover:underline dark:text-amber-400"
                    >
                      Finish verification →
                    </Link>
                  </p>
                </FieldRow>
                <FieldRow label="Company" hint="Optional" htmlFor="company">
                  <input
                    id="company"
                    type="text"
                    placeholder="Firm or organisation"
                    value={form.company}
                    onChange={set("company")}
                    className={inputClass}
                  />
                </FieldRow>
                <FieldRow label="About you" hint="Optional · max 500 characters" htmlFor="bio">
                  <textarea
                    id="bio"
                    rows={3}
                    maxLength={500}
                    placeholder="A few lines about yourself."
                    value={form.bio}
                    onChange={set("bio")}
                    className={inputClass}
                  />
                </FieldRow>
              </List>
            </Card>

            {isProfessional && (
              <p className="text-xs text-stone-500 dark:text-slate-400">
                Your public profile, credentials, portfolio and verification, is edited on{" "}
                <Link
                  href="/profile/professional"
                  className="font-bold text-amber-700 dark:text-amber-400"
                >
                  your profile page
                </Link>
                .
              </p>
            )}
          </>
        )}

        {section === "contact" && (
          <Card
            title="Where we reach you"
            description="For project updates, payments, and permit notices."
            bodyClassName=""
          >
            <List>
              <FieldRow label="Primary phone" htmlFor="phone">
                <div className="relative">
                  <Phone className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-slate-500" />
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="01XXXXXXXXX"
                    value={form.phone}
                    onChange={set("phone")}
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </FieldRow>
              <FieldRow label="Alternate phone" hint="Office or site contact" htmlFor="altPhone">
                <div className="relative">
                  <Phone className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-slate-500" />
                  <input
                    id="altPhone"
                    type="tel"
                    placeholder="Optional"
                    value={form.altPhone}
                    onChange={set("altPhone")}
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </FieldRow>
              <FieldRow
                label="Recovery email"
                hint="Receipts and account recovery"
                htmlFor="recoveryEmail"
              >
                <div className="relative">
                  <AtSign className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-slate-500" />
                  <input
                    id="recoveryEmail"
                    type="email"
                    placeholder="another@example.com"
                    value={form.recoveryEmail}
                    onChange={set("recoveryEmail")}
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </FieldRow>
            </List>
          </Card>
        )}

        {section === "security" && (
          <>
            <Card
              title="Sign-in"
              description="The address you sign in with, and the password that guards it."
              bodyClassName=""
              action={
                <StatusPill tone="good" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
                  Protected
                </StatusPill>
              }
            >
              <List>
                <ActionRow
                  icon={<AtSign className="h-4 w-4" />}
                  title="Login email"
                  sub={user.email}
                  actionLabel="Change"
                  onAction={() => {
                    setEmailError(null);
                    setDialog("email");
                  }}
                />
                <ActionRow
                  icon={<Lock className="h-4 w-4" />}
                  title="Password"
                  sub="Changing it signs you out of every other login"
                  actionLabel="Change"
                  onAction={() => {
                    setPwError(null);
                    setDialog("password");
                  }}
                />
              </List>
            </Card>

            {/* Active logins — a list you can act on, not just read. Ticking
                rows reveals the bulk action, so the button only exists when
                there's something for it to do.

                Called "logins" rather than "devices" on purpose: a row is one
                sign-in, and nothing here fingerprints the machine it came
                from, so the same browser signing in twice is honestly two
                rows rather than one device we'd be guessing at. */}
            <Card
              title="Active logins"
              description="Everywhere your account is currently signed in. Each sign-in is its own entry, so one browser can appear more than once."
              bodyClassName=""
              action={
                selected.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleRevokeSelected}
                    disabled={revoking}
                    className={dangerButtonClass}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out {selected.length} login{selected.length === 1 ? "" : "s"}
                  </button>
                ) : undefined
              }
            >
              {sessions === null ? (
                <p className="px-5 py-6 text-sm text-stone-500 dark:text-slate-400">
                  Loading your logins…
                </p>
              ) : sessions.length === 0 ? (
                <EmptyState
                  icon={<Monitor className="h-5 w-5" />}
                  title="Nothing to show"
                  sub="We couldn't load your active logins just now. Refresh to try again."
                />
              ) : (
                <List>
                  {/* Select-all sits in the list header, where the tick column is */}
                  {otherSessions.length > 1 && (
                    <label className="flex cursor-pointer items-center gap-3 bg-stone-900/2 px-4 py-2 text-xs font-bold text-stone-500 sm:px-5 dark:bg-white/2 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={allOthersSelected}
                        onChange={(e) =>
                          setSelected(e.target.checked ? otherSessions.map((s) => s.id) : [])
                        }
                        className="h-4 w-4 rounded border-stone-300 accent-amber-500"
                      />
                      Select every other login
                    </label>
                  )}

                  {sessions.map((item) => {
                    const { name, Icon } = describeDevice(item.userAgent);
                    const isSelected = selected.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 px-4 py-3 transition sm:px-5 ${
                          isSelected ? "bg-amber-400/10" : ""
                        }`}
                      >
                        {item.current ? (
                          // No tick: you can't sign this one out from here —
                          // that's what the Sign out button is for.
                          <span className="h-4 w-4 shrink-0" />
                        ) : (
                          <input
                            type="checkbox"
                            aria-label={`Select login from ${name}`}
                            checked={isSelected}
                            onChange={(e) =>
                              setSelected((current) =>
                                e.target.checked
                                  ? [...current, item.id]
                                  : current.filter((id) => id !== item.id)
                              )
                            }
                            className="h-4 w-4 shrink-0 rounded border-stone-300 accent-amber-500"
                          />
                        )}
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-stone-900/5 text-stone-600 dark:bg-white/10 dark:text-slate-300">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-bold">
                            <span className="truncate">{name}</span>
                            {item.current && (
                              <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[0.62rem] font-extrabold text-emerald-700 dark:text-emerald-300">
                                This login
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                            Last used {timeAgo(item.lastSeenAt)} · signed in{" "}
                            {timeAgo(item.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </List>
              )}
            </Card>
          </>
        )}

        {section === "billing" && (
          <Card
            title="Billing"
            description="Used to pre-fill escrow deposits and payouts. We never store card numbers."
            bodyClassName=""
            action={
              <Tabs
                tabs={[
                  { id: "address" as const, label: "Address" },
                  { id: "payout" as const, label: "Payout method" },
                ]}
                active={billingTab}
                onChange={setBillingTab}
              />
            }
          >
            {billingTab === "address" ? (
              <List>
                <FieldRow
                  label="Billed to"
                  hint="If different from your name"
                  htmlFor="billingName"
                >
                  <input
                    id="billingName"
                    type="text"
                    value={form.billingName}
                    onChange={set("billingName")}
                    className={inputClass}
                  />
                </FieldRow>
                <FieldRow label="Address" htmlFor="addressLine1">
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-slate-500" />
                    <input
                      id="addressLine1"
                      type="text"
                      autoComplete="address-line1"
                      placeholder="House, road"
                      value={form.addressLine1}
                      onChange={set("addressLine1")}
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </FieldRow>
                <FieldRow label="Address line 2" hint="Optional" htmlFor="addressLine2">
                  <input
                    id="addressLine2"
                    type="text"
                    autoComplete="address-line2"
                    placeholder="Area, thana"
                    value={form.addressLine2}
                    onChange={set("addressLine2")}
                    className={inputClass}
                  />
                </FieldRow>
                <FieldRow label="City / district" htmlFor="city">
                  <input
                    id="city"
                    type="text"
                    placeholder="Dhaka"
                    value={form.city}
                    onChange={set("city")}
                    className={inputClass}
                  />
                </FieldRow>
                <FieldRow label="Post code" htmlFor="postcode">
                  <input
                    id="postcode"
                    type="text"
                    placeholder="1207"
                    value={form.postcode}
                    onChange={set("postcode")}
                    className={inputClass}
                  />
                </FieldRow>
                <FieldRow label="Country" htmlFor="country">
                  <input
                    id="country"
                    type="text"
                    placeholder="Bangladesh"
                    value={form.country}
                    onChange={set("country")}
                    className={inputClass}
                  />
                </FieldRow>
                <FieldRow label="TIN" hint="Optional" htmlFor="tin">
                  <input
                    id="tin"
                    type="text"
                    value={form.tin}
                    onChange={set("tin")}
                    className={inputClass}
                  />
                </FieldRow>
              </List>
            ) : (
              <div className="p-4 sm:p-5">
                <div className="grid gap-2 sm:grid-cols-2">
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
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-bold transition ${
                        form.preferredMethod === value
                          ? "border-amber-400 bg-amber-400/15 text-stone-900 dark:text-amber-100"
                          : "border-stone-300/70 bg-white/50 text-stone-600 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                      }`}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-stone-900/5 dark:bg-white/10">
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
                  <div className="mt-4 max-w-sm">
                    <label
                      htmlFor="mobileWalletNumber"
                      className="mb-1.5 block text-sm font-semibold"
                    >
                      {methodLabels[form.preferredMethod as PaymentMethod]} account number
                    </label>
                    <div className="relative">
                      <Wallet className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-slate-500" />
                      <input
                        id="mobileWalletNumber"
                        type="tel"
                        placeholder="01XXXXXXXXX"
                        value={form.mobileWalletNumber}
                        onChange={set("mobileWalletNumber")}
                        className={`${inputClass} pl-9`}
                      />
                    </div>
                  </div>
                )}

                {wantsBank && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {(
                      [
                        ["bankAccountName", "Account name", ""],
                        ["bankAccountNumber", "Account number", ""],
                        ["bankName", "Bank", "e.g. BRAC Bank"],
                        ["bankBranch", "Branch", ""],
                      ] as const
                    ).map(([field, label, placeholder]) => (
                      <div key={field}>
                        <label htmlFor={field} className="mb-1.5 block text-sm font-semibold">
                          {label}
                        </label>
                        <input
                          id={field}
                          type="text"
                          placeholder={placeholder}
                          value={form[field]}
                          onChange={set(field)}
                          className={inputClass}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {!form.preferredMethod && (
                  <p className="mt-4 text-xs text-stone-500 dark:text-slate-400">
                    Pick a method and we&apos;ll pre-fill it on escrow deposits and payouts.
                  </p>
                )}
              </div>
            )}
          </Card>
        )}

        {section === "notifications" && token && (
          <NotificationsSection
            token={token}
            email={user.email}
            emailVerified={user.emailVerified}
            onToast={pushToast}
          />
        )}

        {section === "appearance" && (
          <Card
            title="How Buildora looks"
            description="Saved in this browser, applied the moment you pick, no save needed."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { mode: "day" as const, label: "Day", sub: "Warm stone and daylight", Icon: Sun },
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
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
                    themeMode === mode
                      ? "border-amber-400 bg-amber-400/15"
                      : "border-stone-300/70 bg-white/50 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                  }`}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-900/5 text-stone-700 dark:bg-white/10 dark:text-amber-200">
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
        )}
      </div>

      {/* Spacer so the floating bar never covers the last row */}
      {dirty && <div className="h-20" />}

      {/* ============ Contextual bar: only while there's something to save ============ */}
      {dirty && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/50 bg-white/90 px-4 py-3 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/90">
            <p className="text-sm font-semibold text-stone-600 dark:text-slate-300">
              {changedFields.length} unsaved change{changedFields.length === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setForm(formFromUser(user))}
                className={ghostButtonClass}
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={primaryButtonClass}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ Blocking dialogs ============ */}
      <Modal
        open={dialog === "email"}
        onClose={() => setDialog(null)}
        title="Change login email"
        description="This is the address you sign in with, so we need your password to change it."
      >
        <form onSubmit={handleEmail} className="flex flex-col gap-4">
          <div>
            <label htmlFor="loginEmail" className="mb-1.5 block text-sm font-semibold">
              New email address
            </label>
            <input
              id="loginEmail"
              type="email"
              required
              autoComplete="email"
              value={emailForm.email}
              onChange={(e) => {
                setEmailError(null);
                setEmailForm((f) => ({ ...f, email: e.target.value }));
              }}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="emailPassword" className="mb-1.5 block text-sm font-semibold">
              Current password
            </label>
            <input
              id="emailPassword"
              type="password"
              required
              autoComplete="current-password"
              value={emailForm.currentPassword}
              onChange={(e) => {
                setEmailError(null);
                setEmailForm((f) => ({ ...f, currentPassword: e.target.value }));
              }}
              className={inputClass}
            />
          </div>
          {emailError && <p className="alert alert-danger px-3 py-2">{emailError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDialog(null)} className={ghostButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={emailBusy} className={primaryButtonClass}>
              {emailBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {emailBusy ? "Updating…" : "Update email"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={dialog === "password"}
        onClose={() => setDialog(null)}
        title="Change password"
        description="Every other login on your account will be signed out."
      >
        <form onSubmit={handlePassword} className="flex flex-col gap-4">
          <div>
            <label htmlFor="currentPassword" className="mb-1.5 block text-sm font-semibold">
              Current password
            </label>
            <input
              id="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              value={pwForm.currentPassword}
              onChange={(e) => {
                setPwError(null);
                setPwForm((f) => ({ ...f, currentPassword: e.target.value }));
              }}
              className={inputClass}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="newPassword" className="mb-1.5 block text-sm font-semibold">
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
                  setPwError(null);
                  setPwForm((f) => ({ ...f, newPassword: e.target.value }));
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-semibold">
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
                  setPwError(null);
                  setPwForm((f) => ({ ...f, confirmPassword: e.target.value }));
                }}
                className={inputClass}
              />
            </div>
          </div>
          {pwError && <p className="alert alert-danger px-3 py-2">{pwError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDialog(null)} className={ghostButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={pwBusy} className={primaryButtonClass}>
              {pwBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {pwBusy ? "Changing…" : "Change password"}
            </button>
          </div>
        </form>
      </Modal>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </AccountShell>
  );
}
