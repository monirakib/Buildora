"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginUser, registerLandOwner, registerProfessional } from "@/lib/api";
import { useSession } from "@/store/useSession";
import { useTheme } from "@/store/useTheme";
import { Navbar } from "@/components/landing/Navbar";
import { IabCheckField } from "@/components/verify/IabCheckField";

/** The three panes of the unified auth page — one login for every role, plus a
 *  signup each for land owners and professionals. */
type Mode = "login" | "owner" | "pro";

// The six full-page backdrops, keyed by pane + theme. All are rendered at once
// and cross-faded via opacity so switching pane or theme is smooth and the
// images are preloaded (no flash on first switch).
const authBackgrounds = [
  { mode: "login", theme: "day", src: "/auth-bg/login-day.png" },
  { mode: "login", theme: "night", src: "/auth-bg/login-night.png" },
  { mode: "owner", theme: "day", src: "/auth-bg/signup-day.png" },
  { mode: "owner", theme: "night", src: "/auth-bg/signup-night.png" },
  { mode: "pro", theme: "day", src: "/auth-bg/signup-professional-day.png" },
  { mode: "pro", theme: "night", src: "/auth-bg/signup-professional-night.png" },
] as const;

// Kicker / headline / sub-line for each pane.
const heroCopy: Record<Mode, { kicker: string; title: string; sub: string }> = {
  login: {
    kicker: "Welcome back",
    title: "Log in to Buildora.",
    sub: "One login for land owners and professionals alike.",
  },
  owner: {
    kicker: "For land owners",
    title: "Start your project.",
    sub: "Create an account to post your project brief and meet verified professionals.",
  },
  pro: {
    kicker: "For professionals",
    title: "Grow your practice.",
    sub: "Architects, engineers, contractors and suppliers: meet serious clients, get paid through protected escrow, and carry a badge people trust.",
  },
};

// The four professional actors, mirroring the API's PROFESSIONAL_ROLES.
const roleOptions = [
  { value: "ARCHITECT", label: "Architect" },
  { value: "STRUCTURAL_ENGINEER", label: "Structural engineer" },
  { value: "CONTRACTOR", label: "Contractor" },
  { value: "SUPPLIER", label: "Material supplier" },
] as const;

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const labelClass = "mb-1.5 block text-sm font-semibold";

const hintClass = "mt-1.5 text-xs font-medium text-stone-600 dark:text-slate-400";

const optionalTag = (
  <span className="font-medium text-stone-500 dark:text-slate-400">(optional)</span>
);

/**
 * Liquid-glass surface — translucent tint, heavy frosted blur + saturation, a
 * bright inset edge, and a soft top sheen (::before). Matches the navbar and
 * side-menu glass. `relative`/`overflow-hidden` contain the sheen; wrap inner
 * content in `relative z-10` so it sits above it.
 */
const glassCardClass =
  "relative overflow-hidden rounded-3xl border border-white/40 bg-white/30 shadow-2xl shadow-black/10 backdrop-blur-2xl backdrop-saturate-150 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-40 before:bg-linear-to-b before:from-white/40 before:to-transparent before:content-[''] dark:border-white/15 dark:bg-white/10 dark:shadow-black/40 dark:before:from-white/15";

/**
 * Password field with a show/hide eye toggle. `visible` is controlled by the
 * parent so all password inputs on the form reveal together.
 */
function PasswordInput({
  id,
  value,
  onChange,
  visible,
  onToggleVisible,
  minLength,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  visible: boolean;
  onToggleVisible: () => void;
  minLength: number;
  autoComplete: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        className={`${inputClass} pr-11`}
      />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-stone-400 transition hover:text-stone-700 dark:hover:text-slate-200"
      >
        {visible ? (
          /* eye-off */
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          /* eye */
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

/** Thin uppercase divider used to group the long signup form into sections. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center gap-3">
      <span className="text-[11px] font-bold tracking-[0.16em] whitespace-nowrap text-stone-500 uppercase dark:text-slate-400">
        {children}
      </span>
      <span aria-hidden className="h-px flex-1 bg-stone-300/70 dark:bg-white/10" />
    </div>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const { user, setSession, clearSession } = useSession();
  const theme = useTheme((s) => s.mode);

  const [mode, setMode] = useState<Mode>("login");
  // One superset form — the login pane uses identifier/password; the owner
  // signup the common fields; the professional signup adds role + credentials.
  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    // Login accepts either an email or a username, so it has its own field
    // (kept separate from the strict signup email above).
    identifier: "",
    phone: "",
    password: "",
    confirmPassword: "",
    // Professional signup only
    role: "",
    company: "",
    licenseAuthority: "",
    licenseNumber: "",
    // Filled in by the IAB directory lookup, not typed.
    membershipStatus: "",
    membershipCategory: "",
    specialties: "",
    yearsExperience: "",
    website: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // The session store hydrates from localStorage on the client, so the
  // signed-in card is only shown after mount to keep server and first client
  // render identical (avoids a hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // Old professional entry links land on the professional signup pane.
    // (Read from window to avoid a Suspense boundary for useSearchParams.)
    if (new URLSearchParams(window.location.search).get("role") === "professional") {
      setMode("pro");
    }
  }, []);

  const set =
    (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [field]: e.target.value });

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setShowPassword(false);
    setForm((f) => ({ ...f, password: "", confirmPassword: "" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode !== "login" && form.password !== form.confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    try {
      const result =
        mode === "login"
          ? await loginUser({ identifier: form.identifier, password: form.password })
          : mode === "owner"
            ? await registerLandOwner({
                name: form.name,
                username: form.username,
                email: form.email,
                phone: form.phone || undefined,
                password: form.password,
              })
            : await registerProfessional({
                role: form.role,
                name: form.name,
                username: form.username,
                email: form.email,
                phone: form.phone,
                password: form.password,
                company: form.company,
                licenseAuthority: form.licenseAuthority,
                licenseNumber: form.licenseNumber,
                membershipStatus: form.membershipStatus,
                membershipCategory: form.membershipCategory,
                specialties: form.specialties,
                yearsExperience: form.yearsExperience,
                website: form.website,
              });
      setSession(result.user, result.token);
      // Land in the app hub, which branches by role (find-an-architect etc.).
      router.push("/dashboard");
    } catch (err) {
      // fetch throws a TypeError when the API itself is unreachable.
      if (err instanceof TypeError) {
        setError("Can't reach the server. Please try again in a moment.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  }

  // Before mount the theme store may not agree with the pre-hydration DOM, so
  // default to "day" until mounted (matches the server render and avoids a
  // hydration mismatch; the correct image fades in immediately after mount).
  const activeTheme = mounted ? theme : "day";
  const copy = heroCopy[mode];
  const modeIndex = (["login", "owner", "pro"] as const).indexOf(mode);
  const isSignup = mode !== "login";

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Full-page backdrops — all six are layered and cross-faded so both the
          pane switch and the day↔night switch transition smoothly. */}
      <div className="fixed inset-0 -z-10 bg-stone-100 dark:bg-stone-950">
        {authBackgrounds.map((bg) => {
          const active = bg.mode === mode && bg.theme === activeTheme;
          return (
            <div
              key={bg.src}
              aria-hidden
              /*
                `linear`, and it has to be. This is a crossfade: the outgoing
                image ramps 1→0 while the incoming one ramps 0→1, and the two
                only sum to a constant if both ramps are straight lines. Under
                any eased curve both layers sit near 0.5 at the midpoint, the
                combined opacity dips below full, and you see a grey flash
                halfway through the swap — the artefact that reads as "the
                images blinked" rather than "one became the other".
              */
              className={`absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-linear ${
                active ? "opacity-100" : "opacity-0"
              }`}
              style={{ backgroundImage: `url(${bg.src})` }}
            />
          );
        })}
        {/* Scrim over the background image to keep the glass cards + text legible.
            TWEAK HERE: bg-white/20 = day-mode whiteness (higher = more opaque,
            lower = more transparent); dark:bg-black/40 = night-mode darkness. */}
        <div className="absolute inset-0 bg-white/20 dark:bg-black/40" />
      </div>

      {/* Same floating glass navbar as the landing page, minus the redundant CTA */}
      <Navbar showGetStarted={false} />

      {/* pt-28 clears the fixed navbar (top-4 + h-14) */}
      <main className="flex flex-1 items-center justify-center px-5 pt-28 pb-16 sm:px-8">
        <div className="w-full max-w-md">
          {mounted && user ? (
            /* Already signed in — no need to show the form again */
            <div className={`${glassCardClass} p-8 text-center`}>
              <div className="relative z-10">
                <p className="animate-rise-in text-[0.7rem] font-bold tracking-[0.22em] text-stone-500 uppercase dark:text-slate-400">
                  Signed in
                </p>
                <h1 className="display-title animate-rise-in [animation-delay:70ms] mt-3 text-3xl">
                  Welcome back, {user.name.split(" ")[0]}
                </h1>
                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">{user.email}</p>
                <div className="mt-8 flex flex-col gap-3">
                  <Link href="/dashboard" className="rounded-full btn-primary px-8 py-3 text-sm">
                    Go to dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={clearSession}
                    className="rounded-full border border-white/40 bg-white/20 px-8 py-3 text-sm font-bold backdrop-blur transition hover:border-amber-500 hover:text-amber-700 dark:border-white/15 dark:bg-white/5 dark:hover:border-amber-400 dark:hover:text-amber-300"
                  >
                    Log out
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="animate-rise-in text-[0.7rem] font-bold tracking-[0.22em] text-stone-500 uppercase dark:text-slate-400">
                {copy.kicker}
              </p>
              <h1 className="display-title mt-3 text-4xl text-stone-900 [text-shadow:0_1px_10px_rgba(255,255,255,0.6)] sm:text-5xl dark:text-white dark:[text-shadow:0_1px_12px_rgba(0,0,0,0.5)]">
                {copy.title}
              </h1>
              <p className="mt-3 font-medium text-stone-800 [text-shadow:0_1px_8px_rgba(255,255,255,0.7)] dark:text-slate-200 dark:[text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
                {copy.sub}
              </p>

              <div className={`${glassCardClass} mt-8 p-6 sm:p-8`}>
                <div className="relative z-10">
                  {/* Three-way segmented toggle with a sliding pill: one login,
                      then a signup each for land owners and professionals. */}
                  <div className="relative grid grid-cols-3 rounded-full border border-stone-200/70 bg-white/50 p-1 backdrop-blur dark:border-transparent dark:bg-white/10">
                    <span
                      aria-hidden
                      className="absolute top-1 bottom-1 left-1 w-[calc(33.333%-0.25rem)] rounded-full bg-stone-900 shadow transition-transform duration-300 dark:bg-amber-400"
                      style={{ transform: `translateX(${modeIndex * 100}%)` }}
                    />
                    {(
                      [
                        { value: "login", label: "Log in" },
                        { value: "owner", label: "Land owner" },
                        { value: "pro", label: "Professional" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => switchMode(m.value)}
                        className={`relative z-10 rounded-full py-2 text-[13px] font-bold transition-colors duration-300 ${
                          mode === m.value
                            ? "text-white dark:text-slate-950"
                            : "text-stone-600 hover:text-stone-900 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  {isSignup && (
                    <p className="mt-3 text-center text-xs font-semibold text-stone-500 dark:text-slate-400">
                      {mode === "owner"
                        ? "Signing up as a land owner"
                        : "Signing up as a professional"}
                    </p>
                  )}

                  <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                    {/* ---- Login pane ---- */}
                    {mode === "login" && (
                      <div>
                        <label htmlFor="identifier" className={labelClass}>
                          Email or username
                        </label>
                        <input
                          id="identifier"
                          type="text"
                          required
                          autoComplete="username"
                          value={form.identifier}
                          onChange={set("identifier")}
                          className={inputClass}
                        />
                      </div>
                    )}

                    {/* ---- Professional signup: profession picker ---- */}
                    {mode === "pro" && (
                      <>
                        <div>
                          <span className={labelClass}>Your profession</span>
                          {/* Radio cards — each label wraps a visually hidden native
                              radio, so `required` and keyboard selection work for
                              free; `has-checked:` styles the selected card. */}
                          <div className="grid grid-cols-2 gap-2">
                            {roleOptions.map((r) => (
                              <label
                                key={r.value}
                                className="flex cursor-pointer items-center justify-center rounded-xl border border-stone-300/80 bg-white/60 px-3 py-2.5 text-center text-sm font-semibold text-stone-600 backdrop-blur transition select-none hover:border-stone-400 has-checked:border-amber-500 has-checked:bg-amber-400/15 has-checked:text-stone-950 has-focus-visible:ring-2 has-focus-visible:ring-amber-400/40 dark:border-white/15 dark:bg-white/5 dark:text-slate-400 dark:hover:border-white/30 dark:has-checked:border-amber-400 dark:has-checked:bg-amber-400/10 dark:has-checked:text-amber-200"
                              >
                                <input
                                  type="radio"
                                  name="role"
                                  required
                                  value={r.value}
                                  checked={form.role === r.value}
                                  onChange={set("role")}
                                  className="sr-only"
                                />
                                {r.label}
                              </label>
                            ))}
                          </div>
                        </div>
                        <SectionLabel>About you</SectionLabel>
                      </>
                    )}

                    {/* ---- Shared signup fields (both signups) ---- */}
                    {isSignup && (
                      <>
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
                          <label htmlFor="username" className={labelClass}>
                            Username
                          </label>
                          <input
                            id="username"
                            type="text"
                            required
                            minLength={3}
                            maxLength={20}
                            pattern="[A-Za-z0-9_]+"
                            autoComplete="username"
                            value={form.username}
                            onChange={set("username")}
                            className={inputClass}
                          />
                          <p className={hintClass}>
                            Letters, numbers and underscores. This is permanent and can&apos;t be
                            changed later.
                          </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label htmlFor="email" className={labelClass}>
                              Email
                            </label>
                            <input
                              id="email"
                              type="email"
                              required
                              autoComplete="email"
                              value={form.email}
                              onChange={set("email")}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label htmlFor="phone" className={labelClass}>
                              Phone {optionalTag}
                            </label>
                            <input
                              id="phone"
                              type="tel"
                              autoComplete="tel"
                              value={form.phone}
                              onChange={set("phone")}
                              className={inputClass}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* ---- Professional signup: firm + credentials ---- */}
                    {mode === "pro" && (
                      <>
                        <div>
                          <label htmlFor="company" className={labelClass}>
                            Firm / company
                          </label>
                          <input
                            id="company"
                            type="text"
                            required
                            minLength={2}
                            autoComplete="organization"
                            value={form.company}
                            onChange={set("company")}
                            className={inputClass}
                          />
                        </div>

                        {/* Credentials — optional now, required before the account
                            can be submitted for verification review. The section
                            label marks everything below as optional. */}
                        <SectionLabel>Credentials &amp; experience, optional</SectionLabel>

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
                          {/* Architects get the live IAB directory lookup; the
                              other roles have no such public register, so they
                              just type the number. */}
                          {form.role === "ARCHITECT" ? (
                            <IabCheckField
                              value={form.licenseNumber}
                              onChange={(licenseNumber) =>
                                setForm((f) => ({ ...f, licenseNumber }))
                              }
                              accountName={form.name}
                              inputClass={inputClass}
                              labelClass={labelClass}
                              // Signup fills the name in from the directory so
                              // the account starts out matching the record —
                              // it stays editable, and they can see whose
                              // record they just pulled up.
                              onResult={(member) =>
                                setForm((f) => ({
                                  ...f,
                                  name: member.name,
                                  // Offered, not imposed. Sign up under any
                                  // address you like — the API keeps IAB's as
                                  // the secondary contact if you change it.
                                  email: member.email ?? f.email,
                                  membershipStatus: member.status ?? "",
                                  membershipCategory: member.category ?? "",
                                  licenseAuthority: f.licenseAuthority || "IAB",
                                }))
                              }
                            />
                          ) : (
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
                          )}
                        </div>

                        {form.role === "ARCHITECT" && form.membershipCategory && (
                          <p className="-mt-2 text-xs text-stone-500 dark:text-slate-500">
                            Filled in from the IAB directory:{" "}
                            <strong>{form.membershipCategory}</strong>, standing{" "}
                            <strong>{form.membershipStatus}</strong>. Your name and email were set
                            to the directory&apos;s, edit them above if you&apos;d rather use
                            different ones. If you change the email, IAB&apos;s is kept on your
                            account as a secondary contact.
                          </p>
                        )}

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

                        <div className="grid gap-4 sm:grid-cols-2">
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

                        {/* Marks the end of the optional section — passwords below
                            are required again. */}
                        <SectionLabel>Account security</SectionLabel>
                      </>
                    )}

                    <div>
                      <label htmlFor="password" className={labelClass}>
                        Password
                      </label>
                      <PasswordInput
                        id="password"
                        value={form.password}
                        onChange={set("password")}
                        visible={showPassword}
                        onToggleVisible={() => setShowPassword((v) => !v)}
                        minLength={isSignup ? 8 : 1}
                        autoComplete={isSignup ? "new-password" : "current-password"}
                      />
                      {isSignup && <p className={hintClass}>At least 8 characters.</p>}
                    </div>

                    {isSignup && (
                      <div>
                        <label htmlFor="confirmPassword" className={labelClass}>
                          Confirm password
                        </label>
                        <PasswordInput
                          id="confirmPassword"
                          value={form.confirmPassword}
                          onChange={set("confirmPassword")}
                          visible={showPassword}
                          onToggleVisible={() => setShowPassword((v) => !v)}
                          minLength={8}
                          autoComplete="new-password"
                        />
                      </div>
                    )}

                    {error && <p className="alert alert-danger">{error}</p>}

                    {mode === "pro" && (
                      <p className="rounded-xl border border-amber-500/25 bg-amber-400/10 px-4 py-2.5 text-xs font-medium text-stone-700 dark:border-amber-300/15 dark:text-slate-300">
                        Your account starts unverified. Submit your documents afterwards to earn the
                        Platform Verified badge.
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="mt-1 rounded-full btn-primary px-8 py-3 text-sm disabled:opacity-60"
                    >
                      {loading ? "Please wait…" : isSignup ? "Create account" : "Log in"}
                    </button>
                  </form>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
