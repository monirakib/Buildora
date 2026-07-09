"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { smoothScrollToId } from "@/lib/smoothScroll";
import { useSession } from "@/store/useSession";
import { ThemeToggle } from "./ThemeToggle";

/**
 * On the landing page, intercepts the click and swoops to the section.
 * From any other page (e.g. /auth), lets the browser navigate to /#section.
 */
function onAnchorClick(e: React.MouseEvent<HTMLAnchorElement>) {
  if (window.location.pathname !== e.currentTarget.pathname) return;
  e.preventDefault();
  smoothScrollToId(e.currentTarget.hash.slice(1));
}

const links = [
  { href: "/#features", label: "Platform" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#vision", label: "Why Buildora" },
];

export function Navbar({ showGetStarted = true }: { showGetStarted?: boolean }) {
  const user = useSession((s) => s.user);
  const clearSession = useSession((s) => s.clearSession);

  // The session store hydrates from localStorage on the client, so only trust
  // `user` after mount — otherwise the server render (always logged-out) and
  // the first client render could disagree and cause a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const loggedIn = mounted && !!user;

  const [menuOpen, setMenuOpen] = useState(false);

  // While the drawer is open: lock body scroll and let Escape close it.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4 sm:px-6">
      <nav className="animate-fade-down mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/35 px-4 shadow-2xl shadow-black/20 backdrop-blur-xl sm:px-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="grid h-9 w-9 place-items-center rounded-lg text-white/90 transition hover:bg-white/10 hover:text-white"
          >
            {/* Three-line hamburger */}
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>

          <a href="/#top" onClick={onAnchorClick} className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/95 shadow">
              {/* Minimal house-frame mark */}
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
          </a>
        </div>

        <div className="hidden items-center gap-7 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={onAnchorClick}
              className="text-sm font-semibold text-white/80 transition hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {loggedIn && (
            <Link
              href="/profile"
              aria-label="Your profile"
              title="Your profile"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur transition hover:border-white/40 hover:bg-white/25"
            >
              {/* Person silhouette */}
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </Link>
          )}
          {showGetStarted &&
            (loggedIn ? (
              <button
                type="button"
                onClick={clearSession}
                className="hidden items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-2 text-sm font-bold text-white backdrop-blur transition hover:border-red-400/60 hover:bg-red-500/20 hover:text-red-300 sm:flex"
              >
                {/* Door frame with an arrow leaving it */}
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
                Log out
              </button>
            ) : (
              <a
                href="/#cta"
                onClick={onAnchorClick}
                className="hidden rounded-full bg-white px-5 py-2 text-sm font-bold text-stone-900 shadow-lg transition hover:scale-[1.03] hover:bg-stone-100 sm:block"
              >
                Get started
              </a>
            ))}
        </div>
      </nav>

      <SideMenu
        open={menuOpen}
        loggedIn={loggedIn}
        onClose={() => setMenuOpen(false)}
        onLogout={() => {
          clearSession();
          setMenuOpen(false);
        }}
      />
    </header>
  );
}

/**
 * Left slide-in navigation drawer opened by the hamburger. Backdrop click,
 * Escape (handled in Navbar), or a link tap closes it. Section anchors reuse
 * the same swoop-scroll behaviour as the top nav.
 */
function SideMenu({
  open,
  loggedIn,
  onClose,
  onLogout,
}: {
  open: boolean;
  loggedIn: boolean;
  onClose: () => void;
  onLogout: () => void;
}) {
  const itemClass =
    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 hover:text-stone-900 dark:text-white/85 dark:hover:bg-white/10 dark:hover:text-white";

  return (
    <>
      {/* Backdrop — a light dim so the glass panel reads as translucent */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity duration-300 dark:bg-black/40 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Panel — liquid-glass: heavy blur + saturation over a translucent tint,
          a bright inset edge, and a soft top sheen (the ::before below) */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col overflow-hidden border-r border-white/40 bg-white/30 p-5 shadow-2xl shadow-black/20 backdrop-blur-2xl backdrop-saturate-150 transition-transform duration-300 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-40 before:bg-linear-to-b before:from-white/40 before:to-transparent before:content-[''] dark:border-white/15 dark:bg-white/10 dark:shadow-black/40 dark:before:from-white/15 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative z-10 flex items-center justify-between">
          <span className="text-lg font-extrabold tracking-tight text-stone-900 dark:text-white">
            Buildora
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="relative z-10 mt-6 flex flex-col gap-1">
          <Link href="/" onClick={onClose} className={itemClass}>
            Home
          </Link>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => {
                onAnchorClick(e);
                onClose();
              }}
              className={itemClass}
            >
              {link.label}
            </a>
          ))}
          {loggedIn && (
            <>
              <Link href="/dashboard" onClick={onClose} className={itemClass}>
                Dashboard
              </Link>
              <Link href="/architects" onClick={onClose} className={itemClass}>
                Find an architect
              </Link>
              <Link href="/inquiries" onClick={onClose} className={itemClass}>
                Requests
              </Link>
              <Link href="/profile" onClick={onClose} className={itemClass}>
                Profile
              </Link>
            </>
          )}
        </nav>

        <div className="relative z-10 mt-auto border-t border-black/10 pt-4 dark:border-white/15">
          {loggedIn ? (
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-stone-700 transition hover:bg-red-500/10 hover:text-red-600 dark:text-white/85 dark:hover:bg-red-500/15 dark:hover:text-red-300"
            >
              {/* Door frame with an arrow leaving it */}
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
              Log out
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <Link
                href="/auth"
                onClick={onClose}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/40 px-4 py-3 text-sm font-bold text-stone-900 shadow-sm backdrop-blur transition hover:bg-white/60 dark:border-white/20 dark:bg-white/15 dark:text-white dark:hover:bg-white/25"
              >
                {/* House-frame mark */}
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 20V8.5L12 3l8 5.5V20" />
                </svg>
                Sign in as land owner
              </Link>
              <Link
                href="/auth/professional"
                onClick={onClose}
                className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-black/5 px-4 py-3 text-sm font-bold text-stone-700 backdrop-blur transition hover:bg-black/10 hover:text-stone-900 dark:border-white/15 dark:bg-white/5 dark:text-white/85 dark:hover:bg-white/10 dark:hover:text-white"
              >
                {/* Briefcase mark */}
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="7" width="18" height="13" rx="2" />
                  <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Sign in as professional
              </Link>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
