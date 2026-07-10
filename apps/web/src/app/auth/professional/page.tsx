"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginUser, registerProfessional } from "@/lib/api";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";

type Mode = "signup" | "login";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const labelClass = "mb-1.5 block text-sm font-semibold";

const hintClass = "mt-1.5 text-xs font-medium text-stone-600 dark:text-slate-400";

const optionalTag = (
  <span className="font-medium text-stone-500 dark:text-slate-400">(optional)</span>
);

/** Same liquid-glass surface as the rest of the app. */
const glassCardClass =
  "relative overflow-hidden rounded-3xl border border-white/40 bg-white/30 shadow-2xl shadow-black/10 backdrop-blur-2xl backdrop-saturate-150 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-40 before:bg-linear-to-b before:from-white/40 before:to-transparent before:content-[''] dark:border-white/15 dark:bg-white/10 dark:shadow-black/40 dark:before:from-white/15";

// The four professional actors, mirroring the API's PROFESSIONAL_ROLES.
const roleOptions = [
  { value: "ARCHITECT", label: "Architect" },
  { value: "STRUCTURAL_ENGINEER", label: "Structural engineer" },
  { value: "CONTRACTOR", label: "Contractor" },
  { value: "SUPPLIER", label: "Material supplier" },
] as const;

const emptyForm = {
  role: "",
  name: "",
  username: "",
  email: "",
  phone: "",
  company: "",
  licenseAuthority: "",
  licenseNumber: "",
  specialties: "",
  yearsExperience: "",
  website: "",
  identifier: "",
  password: "",
  confirmPassword: "",
};

/** Password field with a show/hide eye toggle. */
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

/** One benefit row in the pitch panel. */
function Benefit({ title, text, icon }: { title: string; text: string; icon: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-500/30 bg-amber-400/15 text-amber-700 dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-300">
        {icon}
      </span>
      <div>
        <p className="font-semibold text-stone-900 dark:text-white">{title}</p>
        <p className="mt-0.5 text-sm text-stone-600 dark:text-slate-400">{text}</p>
      </div>
    </li>
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

export default function ProfessionalAuthPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const setSession = useSession((s) => s.setSession);

  const [mode, setMode] = useState<Mode>("signup");
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Session hydrates from localStorage on the client — wait for mount, then
  // send already-signed-in visitors home instead of showing the form.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted && user) router.replace("/dashboard");
  }, [mounted, user, router]);

  const set =
    (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && form.password !== form.confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    try {
      const result =
        mode === "signup"
          ? await registerProfessional({
              role: form.role,
              name: form.name,
              username: form.username,
              email: form.email,
              phone: form.phone,
              password: form.password,
              company: form.company,
              licenseAuthority: form.licenseAuthority,
              licenseNumber: form.licenseNumber,
              specialties: form.specialties,
              yearsExperience: form.yearsExperience,
              website: form.website,
            })
          : await loginUser({ identifier: form.identifier, password: form.password });
      setSession(result.user, result.token);
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

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Blueprint backdrop — a drafting-grid + amber glow instead of the
          land-owner photo backgrounds, so the professional side has its own
          identity. Colors flip with the day/night switch via `dark:`. */}
      <div className="fixed inset-0 -z-10 bg-linear-to-br from-amber-50 via-stone-100 to-stone-200 dark:from-stone-950 dark:via-stone-900 dark:to-stone-950">
        {/* Drafting grid */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.14] dark:opacity-[0.1]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(120,85,15,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,85,15,0.5) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            // Fade the grid toward the bottom edges so it reads like a drafting
            // sheet under the content rather than wallpaper tiling the viewport.
            maskImage: "radial-gradient(120% 90% at 50% 0%, black 35%, transparent 95%)",
            WebkitMaskImage: "radial-gradient(120% 90% at 50% 0%, black 35%, transparent 95%)",
          }}
        />
        {/* Soft amber glows */}
        <div
          aria-hidden
          className="absolute -top-32 right-[-8%] h-[28rem] w-[28rem] rounded-full bg-amber-400/25 blur-3xl dark:bg-amber-400/15"
        />
        <div
          aria-hidden
          className="absolute bottom-[-12%] left-[-6%] h-[24rem] w-[24rem] rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-500/10"
        />
      </div>

      <Navbar showGetStarted={false} />

      {/* pt-28 clears the fixed navbar (top-4 + h-14) */}
      <main className="flex flex-1 items-center px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto grid w-full max-w-6xl items-start gap-10 lg:grid-cols-[1fr_28rem]">
          {/* ------- Pitch panel ------- */}
          <div className="lg:sticky lg:top-28">
            <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
              For professionals
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
              {mode === "signup" ? "Grow your practice on Buildora." : "Welcome back."}
            </h1>
            <p className="mt-3 max-w-xl font-medium text-stone-700 dark:text-slate-300">
              Architects, structural engineers, contractors, and material suppliers — meet serious
              clients, get paid through protected escrow, and carry a badge people trust.
            </p>

            <ul className="mt-8 flex flex-col gap-5">
              <Benefit
                title="Platform Verified badge"
                text="We check your IAB/IEB/RAJUK credentials so clients don't have to guess."
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4.5 w-4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4Z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                }
              />
              <Benefit
                title="Escrow-protected payments"
                text="Fees sit in escrow and release at approved milestones — no chasing invoices."
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4.5 w-4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="10" width="18" height="11" rx="2" />
                    <path d="M7 10V7a5 5 0 0 1 10 0v3" />
                  </svg>
                }
              />
              <Benefit
                title="One workspace, whole lifecycle"
                text="Briefs, designs, RAJUK permits, site diary, and handover — all in one place."
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4.5 w-4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 20V8.5L12 3l8 5.5V20" />
                    <path d="M9 20v-6h6v6" />
                  </svg>
                }
              />
            </ul>

            {/* How verification works — sets the expectation that new accounts
                start unverified until documents are reviewed. */}
            <div className="mt-9 max-w-xl rounded-2xl border border-stone-300/60 bg-white/40 p-5 backdrop-blur dark:border-white/10 dark:bg-white/5">
              <p className="text-sm font-bold tracking-wide text-stone-900 uppercase dark:text-white">
                How verification works
              </p>
              {/* Vertical line (the ol's ::before) connects the numbered dots
                  into a timeline. */}
              <ol className="relative mt-4 flex flex-col gap-4 text-sm text-stone-700 before:absolute before:top-2 before:bottom-2 before:left-3 before:w-px before:bg-stone-300/80 before:content-[''] dark:text-slate-300 dark:before:bg-white/10">
                {[
                  "Create your account with your credentials.",
                  "Submit your documents (NID, IAB/IEB certificate, portfolio).",
                  "Our supervisors review and award your verified badge.",
                ].map((step, i) => (
                  <li key={step} className="relative flex items-start gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-stone-900 text-xs font-bold text-white dark:bg-amber-400 dark:text-stone-950">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* ------- Form card ------- */}
          <div className="w-full max-w-md lg:justify-self-end">
            <div className={`${glassCardClass} p-6 sm:p-8`}>
              <div className="relative z-10">
                {/* Login / signup segmented toggle */}
                <div className="relative grid grid-cols-2 rounded-full border border-stone-200/70 bg-white/50 p-1 backdrop-blur dark:border-transparent dark:bg-white/10">
                  <span
                    aria-hidden
                    className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-stone-900 shadow transition-transform duration-300 dark:bg-amber-400 ${
                      mode === "signup" ? "translate-x-full" : ""
                    }`}
                  />
                  {(["login", "signup"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMode(m);
                        setError(null);
                        setShowPassword(false);
                        setForm((f) => ({ ...f, password: "", confirmPassword: "" }));
                      }}
                      className={`relative z-10 rounded-full py-2 text-sm font-bold transition-colors duration-300 ${
                        mode === m
                          ? "text-white dark:text-slate-950"
                          : "text-stone-600 hover:text-stone-900 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      {m === "login" ? "Log in" : "Sign up"}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                  {mode === "signup" ? (
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
                      <SectionLabel>Credentials &amp; experience — optional</SectionLabel>

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
                  ) : (
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
                      minLength={mode === "signup" ? 8 : 1}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    />
                    {mode === "signup" && <p className={hintClass}>At least 8 characters.</p>}
                  </div>

                  {mode === "signup" && (
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

                  {error && (
                    <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                      {error}
                    </p>
                  )}

                  {mode === "signup" && (
                    <p className="rounded-xl border border-amber-500/25 bg-amber-400/10 px-4 py-2.5 text-xs font-medium text-stone-700 dark:border-amber-300/15 dark:text-slate-300">
                      Your account starts unverified — submit your documents afterwards to earn the
                      Platform Verified badge.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="group mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-amber-400 px-8 py-3 text-sm font-bold text-stone-950 shadow-lg transition hover:scale-[1.02] hover:bg-amber-300 disabled:scale-100 disabled:opacity-60"
                  >
                    {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
                    {!loading && (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12h14" />
                        <path d="m13 6 6 6-6 6" />
                      </svg>
                    )}
                  </button>
                </form>
              </div>
            </div>

            <p className="mt-6 text-center text-sm font-semibold text-stone-800 dark:text-slate-200">
              Building your own home instead?{" "}
              <Link
                href="/auth"
                className="text-amber-600 underline underline-offset-2 hover:text-amber-500 dark:text-amber-400"
              >
                Sign in as a land owner
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
