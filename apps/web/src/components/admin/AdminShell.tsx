"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserRole } from "@buildora/shared";
import { logoutUser } from "@/lib/api";
import { useSession } from "@/store/useSession";
import { useNotifications } from "@/store/useNotifications";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ThemeToggle } from "@/components/landing/ThemeToggle";

/** Small stroke icons for the sidebar — one path set each, inherits color. */
function NavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    market: (
      <>
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </>
    ),
    verify: (
      <>
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    permits: (
      <>
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <path d="M8 13h8M8 17h5" />
      </>
    ),
    site: (
      <>
        <path d="M4 20V8.5L12 3l8 5.5V20" />
      </>
    ),
    announce: (
      <>
        <path d="m3 11 18-5v12L3 14v-3Z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </>
    ),
    keys: (
      <>
        <circle cx="7.5" cy="15.5" r="4.5" />
        <path d="m10.6 12.4 6.9-6.9M17.5 5.5l2 2M14.5 8.5l2 2" />
      </>
    ),
    pricing: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 15a2.5 2.5 0 0 0 2.5 2h.5a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h.5a2.5 2.5 0 0 1 2.5 2" />
        <path d="M12 6v1M12 17v1" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4.5 w-4.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

// Console pages live in the shell; review tools are the existing standalone
// admin pages, linked from here so everything is reachable from one place.
const NAV = [
  {
    heading: "Console",
    items: [
      { href: "/admin", icon: "overview", label: "Overview" },
      { href: "/admin/users", icon: "users", label: "Users & roles" },
      { href: "/admin/market", icon: "market", label: "Marketplace" },
      { href: "/admin/pricing", icon: "pricing", label: "Material pricing" },
      { href: "/admin/broadcasts", icon: "announce", label: "Announcements" },
      { href: "/admin/keys", icon: "keys", label: "Encryption keys" },
    ],
  },
  {
    heading: "Review",
    items: [
      { href: "/supervisor", icon: "verify", label: "Verification queue" },
      { href: "/admin/permits", icon: "permits", label: "Permit data" },
    ],
  },
];

/**
 * Chrome for every admin console page: guarded (admin only), dark command-bar
 * sidebar on desktop, sticky top bar + pill nav on mobile, and a themed
 * content plane. Children render inside the plane.
 */
export function AdminShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);
  const clearSession = useSession((s) => s.clearSession);

  // Session hydrates from localStorage after mount; only then decide access.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    if (!user) router.replace("/auth");
    else if (user.role !== UserRole.ADMIN) router.replace("/dashboard");
  }, [mounted, user, router]);

  function handleLogout() {
    if (token) logoutUser(token).catch(() => {});
    useNotifications.getState().disconnect();
    clearSession();
    window.location.assign("/");
  }

  if (!mounted || !user || user.role !== UserRole.ADMIN) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading console…</p>
      </div>
    );
  }

  const isActive = (href: string) => pathname === href;

  // The console paints no background of its own: the site backdrop
  // (AmbientBackground, mounted in the root layout) shows through here the same
  // as everywhere else. Only the sidebar and the cards paint a surface.
  return (
    <div className="flex min-h-screen text-stone-900 dark:text-stone-100">
      {/* ---- Sidebar (desktop) — deliberately dark in both themes ---- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-stone-950/95 backdrop-blur-xl lg:flex dark:bg-black/50">
        <Link href="/admin" className="flex items-center gap-2.5 px-5 pt-5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400 shadow">
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none">
              <path
                d="M4 20V8.5L12 3l8 5.5V20"
                stroke="#1c1917"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-lg font-extrabold tracking-tight text-white">Buildora</span>
          <span className="ml-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[0.6rem] font-extrabold tracking-widest text-amber-300 uppercase">
            Admin
          </span>
        </Link>

        <nav className="mt-8 flex-1 space-y-7 overflow-y-auto px-3">
          {NAV.map((group) => (
            <div key={group.heading}>
              <p className="px-3 text-[0.65rem] font-extrabold tracking-[0.2em] text-white/35 uppercase">
                {group.heading}
              </p>
              <div className="mt-2 space-y-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      isActive(item.href)
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {/* Amber accent bar marks the active page */}
                    {isActive(item.href) && (
                      <span className="absolute left-0 h-5 w-1 rounded-r-full bg-amber-400" />
                    )}
                    <span className={isActive(item.href) ? "text-amber-300" : ""}>
                      <NavIcon name={item.icon} />
                    </span>
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-1 border-t border-white/10 p-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/60 transition hover:bg-white/5 hover:text-white"
          >
            <NavIcon name="site" />
            Back to site
          </Link>
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-400 text-xs font-extrabold text-stone-950">
              {user.name
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0])
                .join("")
                .toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-white">{user.name}</span>
              <span className="block truncate text-xs text-white/40">{user.email}</span>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/50 transition hover:bg-red-500/15 hover:text-red-300"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ---- Content plane ---- */}
      <div className="min-w-0 flex-1 lg:pl-64">
        {/* Top bar: mobile brand + page heading + theme toggle */}
        <header className="sticky top-0 z-30 border-b border-white/40 bg-white/60 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-white/4">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              {/* Mobile brand chip (sidebar is hidden) */}
              <Link
                href="/admin"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-400 lg:hidden"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                  <path
                    d="M4 20V8.5L12 3l8 5.5V20"
                    stroke="#1c1917"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-extrabold tracking-tight">{title}</h1>
                {subtitle && (
                  <p className="hidden truncate text-xs text-stone-500 sm:block dark:text-stone-400">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <NotificationBell tone="surface" />
              <ThemeToggle />
            </div>
          </div>

          {/* Mobile pill nav — horizontal scroll, mirrors the sidebar */}
          <nav className="flex gap-1.5 overflow-x-auto px-4 pb-3 lg:hidden">
            {NAV.flatMap((g) => g.items).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition ${
                  isActive(item.href)
                    ? "bg-stone-900 text-white dark:bg-white dark:text-stone-950"
                    : "bg-white text-stone-600 hover:text-stone-900 dark:bg-white/10 dark:text-stone-300 dark:hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
