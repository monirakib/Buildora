"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InquiryStatus, UserRole, type Inquiry } from "@buildora/shared";
import { listMyInquiries } from "@/lib/api";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { professionalCopy } from "@/components/professionals/roleCopy";

const statusStyles: Record<InquiryStatus, string> = {
  [InquiryStatus.SENT]: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  [InquiryStatus.READ]: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  [InquiryStatus.ACCEPTED]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  [InquiryStatus.DECLINED]: "bg-stone-500/15 text-stone-600 dark:text-slate-400",
};

const statusLabels: Record<InquiryStatus, string> = {
  [InquiryStatus.SENT]: "Sent",
  [InquiryStatus.READ]: "Seen",
  [InquiryStatus.ACCEPTED]: "Accepted",
  [InquiryStatus.DECLINED]: "Declined",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function InquiriesPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (!user || !token) {
      router.replace("/auth");
      return;
    }
    (async () => {
      try {
        setInquiries(await listMyInquiries(token));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load your requests");
      } finally {
        setLoading(false);
      }
    })();
  }, [mounted, user, token, router]);

  const isLandOwner = user?.role === UserRole.LAND_OWNER;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <p className="text-sm font-bold tracking-[0.2em] text-amber-800 uppercase dark:text-amber-400">
            {isLandOwner ? "Your requests" : "Client requests"}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {isLandOwner ? "Professionals you've contacted" : "Land owners who reached out"}
          </h1>

          <div className="mt-8">
            {loading ? (
              <p className="text-sm text-stone-500 dark:text-slate-500">Loading…</p>
            ) : error ? (
              <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                {error}
              </p>
            ) : inquiries.length === 0 ? (
              <div className="rounded-2xl border border-white/50 bg-white/55 p-8 text-center backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                <p className="text-stone-600 dark:text-slate-400">
                  {isLandOwner ? "You haven't contacted anyone yet." : "No client requests yet."}
                </p>
                {isLandOwner && (
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <Link
                      href="/architects"
                      className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300"
                    >
                      Find an architect
                    </Link>
                    <Link
                      href="/engineers"
                      className="rounded-full border border-stone-300/80 px-6 py-2.5 text-sm font-bold text-stone-700 transition hover:border-amber-500 hover:text-amber-700 dark:border-white/15 dark:text-slate-300 dark:hover:text-amber-400"
                    >
                      Find an engineer
                    </Link>
                    <Link
                      href="/contractors"
                      className="rounded-full border border-stone-300/80 px-6 py-2.5 text-sm font-bold text-stone-700 transition hover:border-amber-500 hover:text-amber-700 dark:border-white/15 dark:text-slate-300 dark:hover:text-amber-400"
                    >
                      Find a contractor
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <ul className="flex flex-col gap-4">
                {inquiries.map((q) => {
                  // Land owner sees who they contacted; professional sees who contacted them.
                  const other = isLandOwner ? q.professional : q.landOwner;
                  const otherCompany = isLandOwner ? q.professional.company : undefined;
                  return (
                    <li
                      key={q.id}
                      className="rounded-2xl border border-white/50 bg-white/55 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold">{other.name}</p>
                          {otherCompany && (
                            <p className="text-sm text-stone-600 dark:text-slate-400">
                              {otherCompany}
                            </p>
                          )}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusStyles[q.status]}`}
                        >
                          {statusLabels[q.status]}
                        </span>
                      </div>
                      <p className="mt-3 text-sm whitespace-pre-line text-stone-700 dark:text-slate-300">
                        {q.message}
                      </p>
                      <p className="mt-3 text-xs text-stone-500 dark:text-slate-500">
                        {formatDate(q.createdAt)}
                        {isLandOwner && (
                          <>
                            {" · "}
                            <Link
                              href={`/${professionalCopy(q.professional.role).basePath}/${q.professional.id}`}
                              className="font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-400"
                            >
                              View profile
                            </Link>
                          </>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
