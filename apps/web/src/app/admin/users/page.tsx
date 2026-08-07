"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserRole, VerificationStatus, type AdminUserRow } from "@buildora/shared";
import { listAdminUsers, revokeUserSessions, setUserRole } from "@/lib/apiAdmin";
import { useSession } from "@/store/useSession";
import { AdminShell } from "@/components/admin/AdminShell";
import { mediumDate, ROLE_LABELS, timeAgo } from "@/components/admin/format";

// Short labels so the row fits a laptop screen without scrolling.
const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  [VerificationStatus.PENDING_VERIFICATION]: "Unverified",
  [VerificationStatus.DOCUMENTS_SUBMITTED]: "Docs submitted",
  [VerificationStatus.UNDER_REVIEW]: "Under review",
  [VerificationStatus.APPROVED]: "Approved",
  [VerificationStatus.REJECTED]: "Rejected",
};

const VERIFICATION_STYLES: Record<VerificationStatus, string> = {
  [VerificationStatus.APPROVED]:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  [VerificationStatus.UNDER_REVIEW]:
    "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  [VerificationStatus.REJECTED]: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  [VerificationStatus.PENDING_VERIFICATION]:
    "bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-400",
  [VerificationStatus.DOCUMENTS_SUBMITTED]:
    "bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-400",
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

export default function AdminUsersPage() {
  const token = useSession((s) => s.token);
  const me = useSession((s) => s.user);

  const [search, setSearch] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Transient feedback after an action ("Role updated — signed out everywhere")
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminUsers(token, { search, role, page });
      setRows(res.items);
      setTotal(res.total);
      setPageSize(res.pageSize);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, search, role, page]);

  // Debounce typing; role/page changes apply immediately (same effect, small delay is fine).
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function changeRole(row: AdminUserRow, next: UserRole) {
    if (!token || next === row.role) return;
    const ok = window.confirm(
      `Change ${row.name}'s role from ${ROLE_LABELS[row.role]} to ${ROLE_LABELS[next]}?\n\nThey will be signed out everywhere and must log in again.`
    );
    if (!ok) return;
    try {
      await setUserRole(token, row.id, next);
      setRows((rs) =>
        rs.map((r) => (r.id === row.id ? { ...r, role: next, activeSessions: 0 } : r))
      );
      showToast(`${row.name} is now ${ROLE_LABELS[next]} — signed out everywhere`);
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  async function signOutEverywhere(row: AdminUserRow) {
    if (!token) return;
    const ok = window.confirm(`Sign ${row.name} out of all devices?`);
    if (!ok) return;
    try {
      const revoked = await revokeUserSessions(token, row.id);
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, activeSessions: 0 } : r)));
      showToast(
        revoked === 0
          ? `${row.name} had no live sessions`
          : `Ended ${revoked} live ${revoked === 1 ? "session" : "sessions"} for ${row.name}`
      );
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <AdminShell title="Users & roles" subtitle="Every account, its role, and its live sessions">
      {/* ---- Filter row ---- */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4-4" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, username, email…"
            className="w-full rounded-xl border border-stone-300/80 bg-white/70 backdrop-blur py-2.5 pr-4 pl-10 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5"
          />
        </div>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value as UserRole | "");
            setPage(1);
          }}
          className="rounded-xl border border-stone-300/80 bg-white/70 backdrop-blur px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-amber-500 dark:border-white/15 dark:bg-white/5"
        >
          <option value="">All roles</option>
          {Object.values(UserRole).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <span className="ml-auto text-sm text-stone-500 dark:text-stone-400">
          {total} {total === 1 ? "account" : "accounts"}
        </span>
      </div>

      {error && (
        <div className="mb-5 rounded-2xl border border-red-300/60 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ---- Table (scrolls horizontally on small screens) ---- */}
      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-white/6">
        <table className="w-full min-w-200 text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200/80 text-xs font-bold tracking-wider text-stone-500 uppercase dark:border-white/10 dark:text-stone-400">
              <th className="px-5 py-3.5">User</th>
              <th className="px-3 py-3.5">Contact</th>
              <th className="px-3 py-3.5">Role</th>
              <th className="px-3 py-3.5">Verification</th>
              <th className="px-3 py-3.5">Last active</th>
              <th className="px-3 py-3.5">Joined</th>
              <th className="px-3 py-3.5 text-right">Sessions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-white/5">
            {loading &&
              rows.length === 0 &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-5 py-4">
                    <div className="h-8 animate-pulse rounded-lg bg-stone-100 dark:bg-white/5" />
                  </td>
                </tr>
              ))}

            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-12 text-center text-stone-400 dark:text-stone-500"
                >
                  No accounts match this filter
                </td>
              </tr>
            )}

            {rows.map((row) => {
              const isSelf = row.id === me?.id;
              return (
                <tr key={row.id} className="transition hover:bg-stone-50 dark:hover:bg-white/2.5">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {row.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.avatarUrl}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-400/90 text-xs font-extrabold text-stone-950">
                          {initialsOf(row.name)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-bold">
                          {row.name}
                          {isSelf && (
                            <span className="ml-2 rounded-md bg-stone-100 px-1.5 py-0.5 text-[0.65rem] font-extrabold text-stone-500 dark:bg-white/10 dark:text-stone-400">
                              you
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                          @{row.username}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <p className="truncate text-stone-600 dark:text-stone-300">{row.email}</p>
                    {row.phone && (
                      <p className="text-xs text-stone-400 dark:text-stone-500">{row.phone}</p>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    <select
                      value={row.role}
                      disabled={isSelf}
                      title={isSelf ? "You can't change your own role" : "Change role"}
                      onChange={(e) => changeRole(row, e.target.value as UserRole)}
                      className="rounded-lg border border-stone-300/80 bg-white/70 backdrop-blur px-2.5 py-1.5 text-xs font-bold outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-stone-800"
                    >
                      {Object.values(UserRole).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3.5">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-[0.7rem] font-bold whitespace-nowrap ${VERIFICATION_STYLES[row.verificationStatus]}`}
                    >
                      {VERIFICATION_LABELS[row.verificationStatus]}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 whitespace-nowrap text-stone-600 dark:text-stone-300">
                    {row.lastActiveAt ? (
                      <span className="inline-flex items-center gap-1.5">
                        {/* Green dot = has a live session right now */}
                        {row.activeSessions > 0 && (
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        )}
                        {timeAgo(row.lastActiveAt)}
                      </span>
                    ) : (
                      <span className="text-stone-400 dark:text-stone-500">never</span>
                    )}
                  </td>
                  <td className="px-3 py-3.5 whitespace-nowrap text-stone-600 dark:text-stone-300">
                    {mediumDate(row.createdAt)}
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => signOutEverywhere(row)}
                      disabled={row.activeSessions === 0}
                      title={
                        row.activeSessions === 0
                          ? "No live sessions"
                          : `End ${row.activeSessions} live ${row.activeSessions === 1 ? "session" : "sessions"}`
                      }
                      className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-bold text-stone-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-stone-300 dark:hover:border-red-500/40 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                    >
                      Sign out ({row.activeSessions})
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---- Pagination ---- */}
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-stone-500 dark:text-stone-400">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-stone-200 px-3.5 py-2 font-bold transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={to >= total}
            className="rounded-lg border border-stone-200 px-3.5 py-2 font-bold transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
          >
            Next →
          </button>
        </div>
      </div>

      {/* ---- Toast ---- */}
      {toast && (
        <div
          role="status"
          className="fixed right-5 bottom-5 z-50 rounded-xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl dark:bg-white dark:text-stone-950"
        >
          {toast}
        </div>
      )}
    </AdminShell>
  );
}
