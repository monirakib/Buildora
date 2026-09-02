"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { BidStatus, UserRole } from "@buildora/shared";
import { formatBdt, formatDate } from "@/components/app/projectStatus";
import { Navbar } from "@/components/landing/Navbar";
import { listMyBids, listOpenTenders, type BoardTender, type MyBid } from "@/lib/apiTenders";
import { useSession } from "@/store/useSession";
import { surfaceClass } from "@/components/ui/surface";

const cardClass = `${surfaceClass} p-5 sm:p-6`;

const bidStatusStyles: Record<BidStatus, string> = {
  [BidStatus.SUBMITTED]: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  [BidStatus.SHORTLISTED]: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  [BidStatus.AWARDED]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  [BidStatus.REJECTED]: "bg-stone-500/15 text-stone-600 dark:text-slate-400",
  [BidStatus.WITHDRAWN]: "bg-stone-500/15 text-stone-600 dark:text-slate-400",
};

/** "3d left" / "closed", for a bidding deadline. */
function timeLeft(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "closed";
  const hours = Math.round(ms / 3_600_000);
  return hours < 24 ? `${hours}h left` : `${Math.round(hours / 24)}d left`;
}

/**
 * The contractor's tender board: open work to price, and their own bid history.
 *
 * Only contractors get here — everyone else is sent back to their dashboard,
 * since a tender means nothing to a supplier or an architect.
 */
export default function TendersPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [tenders, setTenders] = useState<BoardTender[]>([]);
  const [myBids, setMyBids] = useState<MyBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !user) {
      router.push("/auth");
      return;
    }
    if (user.role !== UserRole.CONTRACTOR) {
      router.push("/dashboard");
      return;
    }
    (async () => {
      try {
        const [open, mine] = await Promise.all([listOpenTenders(token), listMyBids(token)]);
        setTenders(open);
        setMyBids(mine);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load tenders");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, user, router]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 pt-28 pb-20 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Tenders</h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
          Price the Bill of Quantities line by line. Your bid stays sealed until the owner closes
          bidding, nobody else can see what you quoted.
        </p>

        {error && (
          <p className="mt-6 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        )}

        <section className="mt-8">
          <h2 className="text-xl font-extrabold tracking-tight">Open for bids</h2>
          {loading ? (
            <p className="mt-4 text-sm text-stone-500 dark:text-slate-500">Loading…</p>
          ) : tenders.length === 0 ? (
            <div className={`mt-4 ${cardClass}`}>
              <p className="text-sm text-stone-600 dark:text-slate-400">
                Nothing open right now. New tenders appear here as owners publish them, and
                you&apos;ll get a notification when one does.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {tenders.map((t) => (
                <li key={t.id} className={cardClass}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/tenders/${t.id}`}
                        className="font-bold hover:text-amber-700 dark:hover:text-amber-400"
                      >
                        {t.title}
                      </Link>
                      <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
                        {t.projectTitle} · {t.items.length} work items · posted by {t.owner.name}
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm text-stone-600 dark:text-slate-400">
                        {t.scope}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-3 py-1 text-xs font-bold text-sky-700 dark:text-sky-300">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {timeLeft(t.deadlineAt)}
                      </span>
                      <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
                        closes {formatDate(t.deadlineAt)}
                      </p>
                      {t.alreadyBid && (
                        <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          You&apos;ve bid
                        </p>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/tenders/${t.id}`}
                    className="mt-4 inline-block rounded-full bg-amber-400 px-5 py-2 text-xs font-bold text-stone-950 transition hover:bg-amber-300"
                  >
                    {t.alreadyBid ? "Revise your bid" : "Price this tender"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-extrabold tracking-tight">Your bids</h2>
          {myBids.length === 0 ? (
            <div className={`mt-4 ${cardClass}`}>
              <p className="text-sm text-stone-600 dark:text-slate-400">
                You haven&apos;t bid on anything yet.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {myBids.map((b) => (
                <li key={b.id} className={cardClass}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/tenders/${b.tenderId}`}
                        className="font-bold hover:text-amber-700 dark:hover:text-amber-400"
                      >
                        {b.tenderTitle || "Tender"}
                      </Link>
                      <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
                        {formatBdt(b.totalBdt)} · {b.timelineWeeks} weeks · submitted{" "}
                        {formatDate(b.submittedAt)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${bidStatusStyles[b.status]}`}
                    >
                      {b.status === BidStatus.AWARDED
                        ? "Won"
                        : b.status.charAt(0) + b.status.slice(1).toLowerCase()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
