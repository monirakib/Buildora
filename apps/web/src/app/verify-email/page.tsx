"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, CircleAlert, LoaderCircle } from "lucide-react";
import { getMe, verifyEmail } from "@/lib/api";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";

/**
 * Where the "Confirm my email" button in the mail lands.
 *
 * The whole page is one automatic action: read the token out of the URL, hand
 * it to the API, say what happened. There is nothing to fill in — the click on
 * the link was the decision.
 */

type State =
  | { status: "working" }
  | { status: "done"; email: string; alreadyVerified: boolean }
  | { status: "failed"; message: string };

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ status: "working" });

  const sessionToken = useSession((s) => s.token);
  const setSession = useSession((s) => s.setSession);

  // React runs effects twice in development's strict mode, and this token is
  // single-use — the second call would report "already used" over the first
  // one's success. The ref makes it happen exactly once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setState({ status: "failed", message: "This link is missing its token." });
      return;
    }

    verifyEmail(token)
      .then(async (result) => {
        setState({ status: "done", ...result });
        // If this browser is the signed-in one, refresh the stored user so the
        // banner and the settings page stop saying "unverified" straight away.
        if (sessionToken) {
          try {
            setSession(await getMe(sessionToken), sessionToken);
          } catch {
            // Not important enough to spoil a successful confirmation.
          }
        }
      })
      .catch((err: unknown) => {
        setState({
          status: "failed",
          message: err instanceof Error ? err.message : "That link didn't work.",
        });
      });
  }, [token, sessionToken, setSession]);

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-3xl border border-white/50 bg-white/60 p-8 text-center shadow-xl shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
        {state.status === "working" && (
          <>
            <LoaderCircle className="mx-auto h-9 w-9 animate-spin text-amber-500" />
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight">Confirming…</h1>
            <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
              One moment while we check your link.
            </p>
          </>
        )}

        {state.status === "done" && (
          <>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <BadgeCheck className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
              {state.alreadyVerified ? "Already confirmed" : "Email confirmed"}
            </h1>
            <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
              <span className="font-semibold text-stone-800 dark:text-slate-200">
                {state.email}
              </span>{" "}
              {state.alreadyVerified
                ? "was already confirmed, nothing more to do."
                : "is confirmed. Buildora can now email you when a decision, a payment or a booked meeting needs you."}
            </p>

            {/* Where this page is open decides what's useful next. The link is
                usually followed on the phone holding the mailbox, which isn't
                signed in — offering "go to dashboard" there just bounces
                someone to a login screen they didn't ask for. */}
            {sessionToken ? (
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link
                  href="/dashboard"
                  className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 shadow-lg transition hover:scale-[1.03] hover:bg-amber-300"
                >
                  Go to dashboard
                </Link>
                <Link
                  href="/account"
                  className="rounded-full border border-white/60 bg-white/60 px-6 py-2.5 text-sm font-bold transition hover:bg-white/80 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/15"
                >
                  Notification settings
                </Link>
              </div>
            ) : (
              <>
                <p className="mt-4 text-xs leading-relaxed text-stone-500 dark:text-slate-500">
                  You&apos;re not signed in on this device, and you don&apos;t need to be, the
                  confirmation is already saved. If you were signed in somewhere else, that page
                  will catch up on its own.
                </p>
                <div className="mt-7 flex justify-center">
                  <Link
                    href="/auth"
                    className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 shadow-lg transition hover:scale-[1.03] hover:bg-amber-300"
                  >
                    Sign in here
                  </Link>
                </div>
              </>
            )}
          </>
        )}

        {state.status === "failed" && (
          <>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/15 text-red-600 dark:text-red-400">
              <CircleAlert className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
              That link didn&apos;t work
            </h1>
            <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">{state.message}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/account"
                className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 shadow-lg transition hover:scale-[1.03] hover:bg-amber-300"
              >
                Send myself a new one
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        {/* useSearchParams needs a Suspense boundary above it, or the whole
            route opts out of static rendering at build time. */}
        <Suspense fallback={null}>
          <VerifyEmailInner />
        </Suspense>
      </main>
    </div>
  );
}
