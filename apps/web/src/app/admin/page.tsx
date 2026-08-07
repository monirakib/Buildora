"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminOverview } from "@buildora/shared";
import { getAdminOverview } from "@/lib/apiAdmin";
import { useSession } from "@/store/useSession";
import { AdminShell } from "@/components/admin/AdminShell";
import { ColumnChart, HBars, StatTile, TrendChart } from "@/components/admin/charts";
import {
  bdtCompact,
  bdtFull,
  compact,
  ROLE_LABELS,
  statusLabel,
  timeAgo,
} from "@/components/admin/format";

/** Card wrapper every dashboard panel shares. */
function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-stone-200/80 bg-white/70 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-white/6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-extrabold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  signup: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </>
  ),
  order: (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  project: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
      <path d="M2 21h20" />
      <path d="M8 7h2M8 11h2M8 15h2" />
    </>
  ),
  verification: (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

export default function AdminOverviewPage() {
  const token = useSession((s) => s.token);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getAdminOverview(token)
      .then(setOverview)
      .catch((e: Error) => setError(e.message));
  }, [token]);

  // Week-over-week deltas from the daily series (last 7 vs the 7 before).
  const sum = (points: { count: number; totalBdt?: number }[], money = false) =>
    points.reduce((acc, p) => acc + (money ? (p.totalBdt ?? 0) : p.count), 0);
  const signups = overview?.signupsByDay ?? [];
  const orders = overview?.ordersByDay ?? [];
  const signupsThisWeek = sum(signups.slice(-7));
  const signupsPrevWeek = sum(signups.slice(-14, -7));
  const gmvThisWeek = sum(orders.slice(-7), true);
  const gmvPrevWeek = sum(orders.slice(-14, -7), true);

  const placedOrders = overview?.ordersByStatus.find((o) => o.status === "PLACED")?.count ?? 0;

  return (
    <AdminShell title="Overview" subtitle="Live platform analytics, straight from the database">
      {error && (
        <div className="mb-6 rounded-2xl border border-red-300/60 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {!overview && !error && (
        // Skeleton while the aggregations run
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl border border-stone-200/80 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-white/6"
            />
          ))}
        </div>
      )}

      {overview && (
        <div className="min-w-0 space-y-5">
          {/* ---- KPI row ---- */}
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Total users"
              value={compact(overview.totals.users)}
              delta={signupsThisWeek - signupsPrevWeek}
              deltaLabel={`vs prev week · ${signupsThisWeek} joined`}
              spark={signups.slice(-12).map((p) => p.count)}
            />
            <StatTile
              label="Active sessions"
              value={compact(overview.totals.activeSessions)}
              sub={`${overview.totals.logins24h} logins in the last 24h`}
            />
            <StatTile
              label="Escrow held"
              value={bdtCompact(overview.finance.escrowHeldBdt)}
              sub={`${bdtCompact(overview.finance.commissionBdt)} commission earned`}
            />
            <StatTile
              label="Marketplace value"
              value={bdtCompact(overview.finance.marketplaceGmvBdt)}
              delta={gmvThisWeek - gmvPrevWeek}
              deltaLabel="৳ vs prev week"
              spark={orders.slice(-12).map((p) => p.totalBdt ?? 0)}
            />
          </div>

          {/* ---- Trends ---- */}
          <div className="grid gap-5 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <Card title="New signups — last 30 days">
                <TrendChart data={overview.signupsByDay} />
              </Card>
            </div>
            <Card
              title="Users by role"
              action={
                <Link
                  href="/admin/users"
                  className="text-xs font-bold text-amber-600 hover:underline dark:text-amber-400"
                >
                  Manage →
                </Link>
              }
            >
              <HBars
                rows={overview.usersByRole.map((r) => ({
                  label: ROLE_LABELS[r.role],
                  value: r.count,
                }))}
              />
              <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-500 dark:border-white/5 dark:text-stone-400">
                {overview.totals.verifiedProfessionals} of {overview.totals.professionals}{" "}
                professionals are platform-verified
              </p>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <Card
                title="Marketplace orders — last 30 days"
                action={
                  <Link
                    href="/admin/market"
                    className="text-xs font-bold text-amber-600 hover:underline dark:text-amber-400"
                  >
                    Open marketplace →
                  </Link>
                }
              >
                <ColumnChart data={overview.ordersByDay} />
              </Card>
            </div>
            <Card title="Projects by stage">
              {overview.projectsByStatus.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400 dark:text-stone-500">
                  No projects yet
                </p>
              ) : (
                <HBars
                  rows={overview.projectsByStatus.map((r) => ({
                    label: statusLabel(r.status),
                    value: r.count,
                  }))}
                />
              )}
              <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-500 dark:border-white/5 dark:text-stone-400">
                {overview.totals.proposals} proposals · {overview.totals.contracts} contracts ·{" "}
                {overview.totals.inquiries} inquiries
              </p>
            </Card>
          </div>

          {/* ---- Feed + attention + finance ---- */}
          <div className="grid gap-5 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <Card title="Recent activity">
                {overview.activity.length === 0 ? (
                  <p className="py-8 text-center text-sm text-stone-400 dark:text-stone-500">
                    Nothing yet — activity shows up as people use the platform
                  </p>
                ) : (
                  <ul className="divide-y divide-stone-100 dark:divide-white/5">
                    {overview.activity.map((item, i) => (
                      <li key={i} className="flex items-center gap-3 py-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-500 dark:bg-white/5 dark:text-stone-400">
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            {ACTIVITY_ICONS[item.kind]}
                          </svg>
                        </span>
                        <p className="min-w-0 flex-1 truncate text-sm">{item.text}</p>
                        <span className="shrink-0 text-xs text-stone-400 dark:text-stone-500">
                          {timeAgo(item.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="min-w-0 space-y-5">
              <Card title="Needs attention">
                <div className="space-y-2">
                  <Link
                    href="/supervisor"
                    className="flex items-center justify-between rounded-xl bg-stone-50 px-3.5 py-3 text-sm font-semibold transition hover:bg-stone-100 dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    <span>Verifications to review</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                        overview.totals.pendingVerifications > 0
                          ? "bg-amber-400 text-stone-950"
                          : "bg-stone-200 text-stone-600 dark:bg-white/10 dark:text-stone-300"
                      }`}
                    >
                      {overview.totals.pendingVerifications}
                    </span>
                  </Link>
                  <Link
                    href="/admin/market"
                    className="flex items-center justify-between rounded-xl bg-stone-50 px-3.5 py-3 text-sm font-semibold transition hover:bg-stone-100 dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    <span>Orders awaiting sellers</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                        placedOrders > 0
                          ? "bg-amber-400 text-stone-950"
                          : "bg-stone-200 text-stone-600 dark:bg-white/10 dark:text-stone-300"
                      }`}
                    >
                      {placedOrders}
                    </span>
                  </Link>
                  <div className="flex items-center justify-between rounded-xl bg-stone-50 px-3.5 py-3 text-sm font-semibold dark:bg-white/5">
                    <span>Active listings</span>
                    <span className="text-xs font-extrabold text-stone-600 dark:text-stone-300">
                      {overview.totals.activeProducts} / {overview.totals.products}
                    </span>
                  </div>
                </div>
              </Card>

              <Card title="Design-fee finance">
                <dl className="space-y-2.5 text-sm">
                  {[
                    ["Concept fees paid", overview.finance.conceptFeesBdt],
                    ["Held in escrow", overview.finance.escrowHeldBdt],
                    ["Released to architects", overview.finance.releasedToArchitectsBdt],
                    ["Platform commission", overview.finance.commissionBdt],
                  ].map(([label, amount]) => (
                    <div key={label as string} className="flex items-center justify-between">
                      <dt className="text-stone-500 dark:text-stone-400">{label}</dt>
                      <dd className="font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {bdtFull(amount as number)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
