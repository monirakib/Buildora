"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginUser, registerLandOwner } from "@/lib/api";
import { useSession } from "@/store/useSession";
import { useTheme } from "@/store/useTheme";
import { Navbar } from "@/components/landing/Navbar";

type Mode = "signup" | "login";

// The four full-page backdrops, keyed by form mode + theme. All are rendered at
// once and cross-faded via opacity so switching mode or theme is smooth and the
// images are preloaded (no flash on first switch).
const authBackgrounds = [
  { mode: "login", theme: "day", src: "/auth-bg/login-day.png" },
  { mode: "login", theme: "night", src: "/auth-bg/login-night.png" },
  { mode: "signup", theme: "day", src: "/auth-bg/signup-day.png" },
  { mode: "signup", theme: "night", src: "/auth-bg/signup-night.png" },
] as const;

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const labelClass = "mb-1.5 block text-sm font-semibold";

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

export default function AuthPage() {
  const router = useRouter();
  const { user, setSession, clearSession } = useSession();
  const theme = useTheme((s) => s.mode);

  const [mode, setMode] = useState<Mode>("login");
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
    // Old professional entry link — professionals have their own page now.
    // (Read from window to avoid a Suspense boundary for useSearchParams.)
    if (new URLSearchParams(window.location.search).get("role") === "professional") {
      router.replace("/auth/professional");
    }
  }, [router]);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
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
          ? await registerLandOwner({
              name: form.name,
              username: form.username,
              email: form.email,
              phone: form.phone || undefined,
              password: form.password,
            })
          : await loginUser({ identifier: form.identifier, password: form.password });
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

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Full-page backdrops — all four are layered and cross-faded so both the
          login↔signup switch and the day↔night switch transition smoothly. */}
      <div className="fixed inset-0 -z-10 bg-stone-100 dark:bg-stone-950">
        {authBackgrounds.map((bg) => {
          const active = bg.mode === mode && bg.theme === activeTheme;
          return (
            <div
              key={bg.src}
              aria-hidden
              className={`absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-in-out ${
                active ? "opacity-100" : "opacity-0"
              }`}
              style={{ backgroundImage: `url(${bg.src})` }}
            />
          );
        })}
        {/* Scrim over the background image to keep the glass cards + text legible.
            TWEAK HERE: bg-white/50 = day-mode whiteness (higher = more opaque,
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
              <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
                Signed in
              </p>
              <h1 className="mt-3 text-2xl font-extrabold tracking-tight">
                Welcome back, {user.name.split(" ")[0]}
              </h1>
              <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">{user.email}</p>
              <div className="mt-8 flex flex-col gap-3">
                <Link
                  href="/dashboard"
                  className="rounded-full bg-amber-400 px-8 py-3 text-sm font-bold text-stone-950 shadow-lg transition hover:scale-[1.02] hover:bg-amber-300"
                >
                  Go to dashboard
                </Link>
                <button
                  type="button"
                  onClick={clearSession}
                  className="rounded-full border border-white/40 bg-white/20 px-8 py-3 text-sm font-bold backdrop-blur transition hover:border-amber-500 hover:text-amber-600 dark:border-white/15 dark:bg-white/5 dark:hover:border-amber-400 dark:hover:text-amber-300"
                >
                  Log out
                </button>
              </div>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
                For land owners
              </p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-stone-900 [text-shadow:0_1px_10px_rgba(255,255,255,0.6)] sm:text-4xl dark:text-white dark:[text-shadow:0_1px_12px_rgba(0,0,0,0.5)]">
                {mode === "signup" ? "Start your project." : "Welcome back."}
              </h1>
              <p className="mt-3 font-medium text-stone-800 [text-shadow:0_1px_8px_rgba(255,255,255,0.7)] dark:text-slate-200 dark:[text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
                {mode === "signup"
                  ? "Create an account to post your project brief and meet verified professionals."
                  : "Log in to continue your building journey."}
              </p>

              <div className={`${glassCardClass} mt-8 p-6 sm:p-8`}>
                <div className="relative z-10">
                {/* Login / signup segmented toggle with a sliding pill,
                    same technique as the ThemeToggle knob */}
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
                  {mode === "signup" && (
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
                  )}

                  {mode === "signup" && (
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
                      <p className="mt-1.5 text-xs font-medium text-stone-600 dark:text-slate-400">
                        Letters, numbers and underscores. This is permanent and can&apos;t be
                        changed later.
                      </p>
                    </div>
                  )}

                  {mode === "signup" ? (
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

                  {mode === "signup" && (
                    <div>
                      <label htmlFor="phone" className={labelClass}>
                        Phone <span className="font-medium text-stone-500 dark:text-slate-400">(optional)</span>
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
                    {mode === "signup" && (
                      <p className="mt-1.5 text-xs font-medium text-stone-600 dark:text-slate-400">
                        At least 8 characters.
                      </p>
                    )}
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

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-1 rounded-full bg-amber-400 px-8 py-3 text-sm font-bold text-stone-950 shadow-lg transition hover:scale-[1.02] hover:bg-amber-300 disabled:scale-100 disabled:opacity-60"
                  >
                    {loading
                      ? "Please wait…"
                      : mode === "signup"
                        ? "Create account"
                        : "Log in"}
                  </button>
                </form>
                </div>
              </div>

              <p className="mt-6 text-center text-sm font-semibold text-stone-900 [text-shadow:0_1px_10px_rgba(255,255,255,0.9)] dark:text-slate-100 dark:[text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">
                Architect, engineer, contractor, or supplier?{" "}
                <Link
                  href="/auth/professional"
                  className="text-amber-600 underline underline-offset-2 hover:text-amber-500 dark:text-amber-400"
                >
                  Sign in as a professional
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
