"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronsLeft, ChevronsRight, HelpCircle } from "lucide-react";
import type { SessionUser } from "@buildora/shared";
import { Navbar } from "@/components/landing/Navbar";
import { avatarAt } from "@/lib/imageUrl";

/** One entry in the sidebar. `badge` is the little count/dot beside the label. */
export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** Number of things in this section still wanting attention; 0 hides it. */
  badge?: number;
}

export interface NavGroup {
  heading: string;
  items: NavItem[];
}

/** "Monir Akib" → "MA", for when there's no profile photo. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
}

/**
 * Chrome for the account console: the site navbar on top, a sidebar spine on
 * the left, and a content plane.
 *
 * The sidebar deliberately stops at *navigating this page*. Everything global —
 * the brand, notifications, the theme switch, the account menu with its Log out
 * — belongs to the navbar, which is on every page. Repeating any of it here
 * would give the same action two homes, and the one in the sidebar would be the
 * one nobody expects.
 */
export function AccountShell({
  user,
  avatarUrl,
  roleLabel,
  groups,
  active,
  onSelect,
  title,
  subtitle,
  notice,
  children,
}: {
  user: SessionUser;
  /** Live value from the form, so a just-uploaded photo shows immediately. */
  avatarUrl?: string;
  roleLabel: string;
  groups: NavGroup[];
  active: string;
  onSelect: (id: string) => void;
  title: string;
  subtitle?: string;
  /** Card dropped into the empty space at the foot of the sidebar. */
  notice?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Collapsed sidebar keeps the icons and drops the labels — which is exactly
  // why every entry has a recognisable icon in the first place.
  const [collapsed, setCollapsed] = useState(false);

  const allItems = groups.flatMap((group) => group.items);

  /**
   * Who you're editing. Text, not a menu: the navbar's account chip already
   * owns the identity menu, so this only has to answer "whose settings are
   * these?" — which matters on a page full of personal fields.
   */
  function identity({ compact }: { compact: boolean }) {
    return (
      <div
        className={`flex items-center gap-2.5 py-2 ${compact ? "justify-center px-0" : "px-2"}`}
        title={compact ? user.name : undefined}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted
          <img
            src={avatarAt(avatarUrl, 64)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-400 text-xs font-extrabold text-stone-950">
            {initialsOf(user.name)}
          </span>
        )}
        {!compact && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold">{user.name}</span>
            <span className="block truncate text-[0.7rem] text-stone-500 dark:text-slate-400">
              {roleLabel}
            </span>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen text-stone-900 dark:text-slate-100">
      <Navbar />

      {/* ================= Sidebar (desktop) ================= */}
      {/* Starts below the floating navbar pill (top-4 + h-14) rather than
          running underneath it. */}
      <aside
        className={`fixed bottom-0 left-0 top-24 z-30 hidden flex-col border-r border-white/50 bg-white/70 backdrop-blur-2xl transition-[width] duration-300 lg:flex dark:border-white/10 dark:bg-slate-950/60 ${
          collapsed ? "w-19" : "w-64"
        }`}
      >
        <div className="px-3 pt-3">{identity({ compact: collapsed })}</div>

        <div className="mx-3 mt-2 border-t border-black/5 dark:border-white/10" />

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
          {groups.map((group) => (
            <div key={group.heading}>
              {!collapsed && (
                <p className="px-3 pb-1.5 text-[0.62rem] font-extrabold tracking-[0.18em] text-stone-400 uppercase dark:text-slate-500">
                  {group.heading}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = item.id === active;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={collapsed ? item.label : undefined}
                      onClick={() => onSelect(item.id)}
                      className={`relative flex w-full items-center gap-3 rounded-xl py-2.5 text-sm font-semibold transition ${
                        collapsed ? "justify-center px-0" : "px-3"
                      } ${
                        isActive
                          ? "bg-amber-400/20 text-stone-900 dark:bg-amber-400/15 dark:text-amber-100"
                          : "text-stone-600 hover:bg-stone-900/5 hover:text-stone-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
                      }`}
                    >
                      {/* Accent bar marks the current section */}
                      {isActive && (
                        <span className="absolute left-0 h-5 w-1 rounded-r-full bg-amber-500 dark:bg-amber-400" />
                      )}
                      <span className={isActive ? "text-amber-700 dark:text-amber-300" : ""}>
                        {item.icon}
                      </span>
                      {!collapsed && (
                        <>
                          <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                          {!!item.badge && (
                            <span className="shrink-0 rounded-full bg-amber-400 px-1.5 py-0.5 text-[0.62rem] font-extrabold text-stone-950 tabular-nums">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                      {/* Collapsed: the count has no room, so a dot says "look here" */}
                      {collapsed && !!item.badge && (
                        <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Notice card fills the space the nav leaves over */}
        {notice && !collapsed && <div className="px-3 pb-3">{notice}</div>}

        <div className="space-y-0.5 border-t border-black/5 px-3 py-2 dark:border-white/10">
          <Link
            href="/permits"
            title="Help centre"
            className={`flex items-center gap-3 rounded-xl py-2.5 text-sm font-semibold text-stone-500 transition hover:bg-stone-900/5 hover:text-stone-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white ${
              collapsed ? "justify-center px-0" : "px-3"
            }`}
          >
            <HelpCircle className="h-4.5 w-4.5 shrink-0" />
            {!collapsed && "Help centre"}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className={`flex w-full items-center gap-3 rounded-xl py-2.5 text-sm font-semibold text-stone-400 transition hover:bg-stone-900/5 hover:text-stone-700 dark:text-slate-500 dark:hover:bg-white/5 dark:hover:text-slate-200 ${
              collapsed ? "justify-center px-0" : "px-3"
            }`}
          >
            {collapsed ? (
              <ChevronsRight className="h-4.5 w-4.5" />
            ) : (
              <>
                <ChevronsLeft className="h-4.5 w-4.5" />
                Collapse
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ================= Content plane ================= */}
      {/* pt-28 clears the fixed navbar; the left padding tracks the sidebar. */}
      <div
        className={`min-w-0 pb-16 pt-28 transition-[padding] duration-300 ${
          collapsed ? "lg:pl-19" : "lg:pl-64"
        }`}
      >
        <div className="px-4 sm:px-6 lg:px-8">
          {/* Section strip — the sidebar's job on a phone. A scrolling row of
              pills rather than a drawer, because the navbar already owns the
              only hamburger on the page. */}
          <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:hidden">
            {allItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition ${
                  item.id === active
                    ? "bg-stone-900 text-white dark:bg-white dark:text-stone-950"
                    : "bg-white/70 text-stone-600 hover:text-stone-900 dark:bg-white/10 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                {item.label}
                {!!item.badge && (
                  <span
                    className={`rounded-full px-1.5 text-[0.6rem] font-extrabold tabular-nums ${
                      item.id === active
                        ? "bg-white/20 text-current dark:bg-stone-900/15"
                        : "bg-amber-400 text-stone-950"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <header className="mb-5">
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
            {subtitle && (
              <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">{subtitle}</p>
            )}
          </header>

          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
