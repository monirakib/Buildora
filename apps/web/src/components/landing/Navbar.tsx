"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRole, type SessionUser } from "@buildora/shared";
import { smoothScrollToId } from "@/lib/smoothScroll";
import { logoutUser } from "@/lib/api";
import { useSession } from "@/store/useSession";
import { useNotifications } from "@/store/useNotifications";
import { NotificationBell } from "@/components/notifications/NotificationBell";
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

/**
 * Desktop mega-menu groups (Turner/McCarthy-style): each primary item opens a
 * panel of described links plus a featured CTA card. Anchor hrefs ("/#…") get
 * the swoop-scroll treatment; the rest are normal page links.
 */
const megaMenu = [
  {
    label: "Platform",
    links: [
      { href: "/#features", label: "Features", desc: "Escrow, permits, bidding, site diary" },
      { href: "/#how-it-works", label: "How it works", desc: "Four steps from plot to keys" },
      { href: "/#vision", label: "Why Buildora", desc: "Verified, protected, tracked" },
    ],
    featured: {
      title: "Ready to build?",
      body: "Post a brief and meet verified professionals.",
      href: "/auth",
      cta: "Start your project",
    },
  },
  {
    label: "Land owners",
    links: [
      {
        href: "/projects/new",
        label: "Post a project brief",
        desc: "Land, budget and floors in minutes",
      },
      { href: "/architects", label: "Find architects", desc: "Browse verified portfolios" },
      { href: "/engineers", label: "Find engineers", desc: "Browse verified structural engineers" },
      { href: "/contractors", label: "Find contractors", desc: "Browse verified contractors" },
      { href: "/marketplace", label: "Marketplace", desc: "Order materials straight to your site" },
      { href: "/permits", label: "Permit tools", desc: "DAP zone checks & RAJUK fees" },
      { href: "/dashboard", label: "Your dashboard", desc: "Projects, messages, requests" },
    ],
    featured: {
      title: "Your plot, your rules",
      body: "Stay in control from design to handover.",
      href: "/auth",
      cta: "Create an account",
    },
  },
  {
    label: "Professionals",
    links: [
      {
        href: "/auth?role=professional",
        label: "Join Buildora",
        desc: "Architects, engineers, contractors, suppliers",
      },
      {
        href: "/profile/professional",
        label: "Get verified",
        desc: "Earn the Platform Verified badge",
      },
      { href: "/briefs", label: "Open briefs", desc: "Find your next client" },
      {
        href: "/marketplace/sell",
        label: "Sell materials",
        desc: "List products on the marketplace",
      },
      { href: "/inquiries", label: "Requests", desc: "Inquiries and replies in one place" },
    ],
    featured: {
      title: "Grow your practice",
      body: "Serious clients. Escrow-protected fees.",
      href: "/auth?role=professional",
      cta: "Get verified",
    },
  },
];

/**
 * Drops focus after a click inside the menu.
 *
 * The panel is shown by `group-focus-within`, so anything left focused inside
 * it keeps the panel open — after clicking a link you'd jump to the section
 * with the menu still hanging over the page. Blurring hands focus back to the
 * document and the panel closes on its own.
 */
function blurOnClick(e: React.MouseEvent<HTMLElement>) {
  e.currentTarget.blur();
}

/** One mega-menu item: label + hover/focus dropdown panel. Pure CSS
 *  (group-hover + focus-within) — no state, works with keyboard tabbing.
 *
 *  The label opens the panel on hover only; it is deliberately inert on click.
 *  `onMouseDown` preventing its default is what makes that work: a mouse click
 *  never focuses the button, so it can't pin the panel open via
 *  `group-focus-within`. Tabbing to it still focuses it as normal, which is
 *  how keyboard users open the panel — so this costs nothing in access. */
function MegaMenuItem({ group }: { group: (typeof megaMenu)[number] }) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-haspopup="true"
        onMouseDown={(e) => e.preventDefault()}
        className="flex cursor-default items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/80 transition group-hover:text-white group-focus-within:text-white"
      >
        {group.label}
        {/* Chevron flips while the panel is open */}
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* pt-3 bridges the hover gap between the bar and the panel */}
      <div className="invisible absolute left-1/2 top-full -translate-x-1/2 translate-y-2 pt-3 opacity-0 transition duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div className="grid w-136 grid-cols-[1fr_13rem] gap-5 rounded-2xl border border-white/10 bg-stone-950/90 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl">
          {/* Link column */}
          <div className="flex flex-col gap-1">
            {group.links.map((l) =>
              l.href.startsWith("/#") ? (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={(e) => {
                    onAnchorClick(e);
                    blurOnClick(e);
                  }}
                  className="rounded-xl px-3 py-2.5 transition hover:bg-white/5"
                >
                  <span className="block text-sm font-bold text-white transition group-hover:text-white">
                    {l.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-white/50">{l.desc}</span>
                </a>
              ) : (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={blurOnClick}
                  className="rounded-xl px-3 py-2.5 transition hover:bg-white/5"
                >
                  <span className="block text-sm font-bold text-white">{l.label}</span>
                  <span className="mt-0.5 block text-xs text-white/50">{l.desc}</span>
                </Link>
              )
            )}
          </div>

          {/* Featured CTA card (the Turner “Become a Subcontractor” move) */}
          <Link
            href={group.featured.href}
            onClick={blurOnClick}
            className="flex flex-col justify-between rounded-xl bg-amber-400 p-4 text-stone-950 transition hover:bg-amber-300"
          >
            <div>
              <p className="text-sm font-extrabold">{group.featured.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-stone-800">{group.featured.body}</p>
            </div>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-extrabold">
              {group.featured.cta}
              <span aria-hidden>→</span>
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}

/** "Monir Akib" → "MA" — fallback when the user hasn't uploaded a photo. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
}

/** "STRUCTURAL_ENGINEER" → "structural engineer" (capitalised via CSS). */
/** Architects, engineers, contractors and suppliers — the roles with a profile. */
function isProfessionalRole(role: UserRole): boolean {
  return (
    role === UserRole.ARCHITECT ||
    role === UserRole.STRUCTURAL_ENGINEER ||
    role === UserRole.CONTRACTOR ||
    role === UserRole.SUPPLIER
  );
}

function roleLabelOf(role: UserRole): string {
  return role.replace(/_/g, " ").toLowerCase();
}

function Avatar({ user, className }: { user: SessionUser; className: string }) {
  const url = user.profile?.avatarUrl;
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- tiny avatar, remote host unknown
    <img src={url} alt="" className={`${className} rounded-full object-cover`} />
  ) : (
    <span
      className={`${className} grid place-items-center rounded-full bg-amber-400 text-[0.65em] font-extrabold tracking-wide text-stone-950`}
    >
      {initialsOf(user.name)}
    </span>
  );
}

/**
 * Signed-in account chip: avatar + first name in the bar, with a hover/focus
 * dropdown (same CSS-only pattern as the mega-menu) holding the full identity,
 * quick links, and Log out.
 */
function UserChip({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const firstName = user.name.split(" ")[0];
  return (
    <div className="group relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-label={`Account: ${user.name}`}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 py-1 pl-1 pr-1.5 text-white backdrop-blur transition group-hover:border-white/40 group-hover:bg-white/20 group-focus-within:border-white/40 sm:pr-3"
      >
        <Avatar user={user} className="h-7 w-7 text-base" />
        <span className="hidden max-w-28 truncate text-sm font-bold sm:block">{firstName}</span>
        {/* Chevron flips while the panel is open */}
        <svg
          viewBox="0 0 24 24"
          className="hidden h-3.5 w-3.5 text-white/70 transition-transform duration-300 group-hover:rotate-180 sm:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* pt-3 bridges the hover gap between the bar and the panel */}
      <div className="invisible absolute right-0 top-full translate-y-2 pt-3 opacity-0 transition duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div className="w-64 overflow-hidden rounded-2xl border border-white/10 bg-stone-950/90 shadow-2xl shadow-black/40 backdrop-blur-xl">
          {/* Identity header */}
          <div className="flex items-center gap-3 border-b border-white/10 p-4">
            <Avatar user={user} className="h-10 w-10 text-lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-white">{user.name}</p>
              <p className="truncate text-xs text-white/50">{user.email}</p>
              <p className="mt-0.5 text-[0.65rem] font-bold tracking-widest text-amber-400 uppercase">
                {roleLabelOf(user.role)}
              </p>
            </div>
          </div>

          <div className="p-1.5">
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-white/5 hover:text-white"
            >
              {/* Four-tile dashboard grid */}
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 text-white/50"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              Dashboard
            </Link>
            {/* Only professionals have a profile of their own — credentials,
                portfolio, verification. For everyone else "Profile" would just
                bounce to account settings, so it isn't shown. */}
            {isProfessionalRole(user.role) && (
              <Link
                href="/profile/professional"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-white/5 hover:text-white"
              >
                {/* Person silhouette */}
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-white/50"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Profile
              </Link>
            )}
            <Link
              href="/account"
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-white/5 hover:text-white"
            >
              {/* Settings cog */}
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 text-white/50"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
              </svg>
              Account information
            </Link>
          </div>

          <div className="border-t border-white/10 p-1.5">
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-red-500/15 hover:text-red-300"
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
          </div>
        </div>
      </div>
    </div>
  );
}

export function Navbar({ showGetStarted = true }: { showGetStarted?: boolean }) {
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);
  const clearSession = useSession((s) => s.clearSession);

  // The session store hydrates from localStorage on the client, so only trust
  // `user` after mount — otherwise the server render (always logged-out) and
  // the first client render could disagree and cause a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const loggedIn = mounted && !!user;

  const [menuOpen, setMenuOpen] = useState(false);

  // Revoke the session server-side (fire-and-forget — the local session is
  // already gone either way), then leave immediately for the landing page.
  // Hard navigation, not router.push: protected pages react to the cleared
  // session by bouncing to /auth, and that client-side redirect would win the
  // race against a soft push. A document load also resets all in-memory state.
  function handleLogout() {
    if (token) logoutUser(token).catch(() => {});
    // Close the notification socket and drop the feed before the session goes,
    // so the next person to sign in on this browser starts empty.
    useNotifications.getState().disconnect();
    clearSession();
    setMenuOpen(false);
    window.location.assign("/");
  }

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
      {/* Floating glass pill, now carrying the mega-menu items */}
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

        {/* Primary items with mega-menu panels — desktop only; the drawer
            covers mobile */}
        <div className="hidden items-center gap-1 lg:flex">
          {megaMenu.map((group) => (
            <MegaMenuItem key={group.label} group={group} />
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {/* Bell only exists for a signed-in user — it renders null otherwise */}
          {loggedIn && <NotificationBell tone="dark" />}
          {loggedIn && user ? (
            <UserChip user={user} onLogout={handleLogout} />
          ) : (
            showGetStarted && (
              <a
                href="/#cta"
                onClick={onAnchorClick}
                className="hidden rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-stone-950 shadow-lg transition hover:scale-[1.03] hover:bg-amber-300 sm:block"
              >
                Get started
              </a>
            )
          )}
        </div>
      </nav>

      <SideMenu
        open={menuOpen}
        user={loggedIn ? user : null}
        onClose={() => setMenuOpen(false)}
        onLogout={handleLogout}
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
  user,
  onClose,
  onLogout,
}: {
  open: boolean;
  user: SessionUser | null;
  onClose: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const loggedIn = !!user;
  const role = user?.role ?? null;
  const isLandOwner = role === UserRole.LAND_OWNER;
  const isAdmin = role === UserRole.ADMIN;
  const isProfessional = loggedIn && !isLandOwner && !isAdmin;
  const isSeller = role === UserRole.SUPPLIER || role === UserRole.CONTRACTOR;
  const itemClass =
    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 hover:text-stone-900 dark:text-white/85 dark:hover:bg-white/10 dark:hover:text-white";

  // The menu is built as data rather than a wall of JSX conditionals. Nine
  // different role combinations used to be expressed as nine `{cond && <Link>}`
  // blocks in one flat list, which is how it drifted out of any sensible
  // order — new links kept landing wherever there was room. Describing the
  // sections instead means the grouping *is* the source, and adding a link is
  // one line in the right group.
  const sections: { title: string; items: { href: string; label: string; anchor?: boolean }[] }[] =
    [];

  // The landing-page anchors. A visitor is here to look around, so these lead;
  // for someone signed in they're the least useful thing in the menu, so they
  // go last (appended after everything else, below).
  const aboutSection = {
    title: "About Buildora",
    items: links.map((link) => ({ ...link, anchor: true })),
  };

  if (loggedIn) {
    sections.push({
      title: "Your work",
      items: [
        { href: "/dashboard", label: "Dashboard" },
        ...(!isAdmin ? [{ href: "/projects", label: "Projects" }] : []),
        ...(isProfessional ? [{ href: "/briefs", label: "Open briefs" }] : []),
        // Only contractors bid — a supplier sells materials, they don't build.
        ...(role === UserRole.CONTRACTOR ? [{ href: "/tenders", label: "Tenders to bid on" }] : []),
        ...(isLandOwner ? [{ href: "/architects", label: "Find an architect" }] : []),
        ...(isLandOwner ? [{ href: "/engineers", label: "Find an engineer" }] : []),
        ...(isLandOwner ? [{ href: "/contractors", label: "Find a contractor" }] : []),
        ...(isSeller ? [{ href: "/marketplace/sell", label: "My listings" }] : []),
        ...(isLandOwner || isSeller
          ? [{ href: "/marketplace/orders", label: "Market orders" }]
          : []),
      ],
    });

    sections.push({
      title: "Conversations",
      items: [
        { href: "/messages", label: "Messages" },
        ...(!isAdmin
          ? [
              { href: "/meetings", label: "Meetings" },
              { href: "/inquiries", label: "Requests" },
            ]
          : []),
      ],
    });
  }

  // Public tools — these work signed out, which is why they sit outside the
  // logged-in block.
  sections.push({
    title: "Tools",
    items: [
      { href: "/marketplace", label: "Marketplace" },
      { href: "/permits", label: "Permit tools" },
    ],
  });

  if (isAdmin) {
    sections.push({
      title: "Administration",
      items: [
        { href: "/admin", label: "Admin console" },
        { href: "/supervisor", label: "Verification queue" },
        { href: "/admin/permits", label: "Permit data" },
      ],
    });
  }

  if (loggedIn) {
    sections.push({
      title: "Account",
      items: [
        ...(isProfessionalRole(user.role)
          ? [{ href: "/profile/professional", label: "Profile" }]
          : []),
        { href: "/account", label: "Account information" },
      ],
    });
    sections.push(aboutSection);
  } else {
    sections.unshift(aboutSection);
  }

  // One section open at a time. That's what keeps the whole menu inside the
  // drawer no matter who's signed in: an admin sees four headers and one
  // group's links, never all fourteen destinations at once.
  const [openSection, setOpenSection] = useState<string | null>(null);

  // Which section holds the page you're on. An exact href wins over a prefix
  // match so /marketplace/orders opens "Your work" (where that link lives)
  // rather than "Tools" (which has the broader /marketplace).
  const exactMatch = sections.find((s) =>
    s.items.some((item) => !item.anchor && item.href === pathname)
  );
  const prefixMatch = sections.find((s) =>
    s.items.some((item) => !item.anchor && pathname.startsWith(`${item.href}/`))
  );
  const activeSection = (exactMatch ?? prefixMatch)?.title ?? sections[0]?.title ?? null;

  // Opening the drawer expands wherever you already are, so the links you're
  // most likely to want next are the ones showing. Re-runs on every open, so
  // it follows you around the app rather than remembering a stale choice.
  useEffect(() => {
    if (open) setOpenSection(activeSection);
  }, [open, activeSection]);

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

        {/* overflow-y-auto is a safety net, not the plan: with one section open
            at a time the menu fits, but a very short window (a phone in
            landscape) could still run out of room. The bar itself stays hidden
            — `scrollbar-none` is the standard rule, the ::-webkit- one covers
            Safari older than 18.2. */}
        <nav className="relative z-10 mt-6 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
          <Link href="/" onClick={onClose} className={itemClass}>
            Home
          </Link>

          {sections.map((section) => {
            const isOpen = openSection === section.title;
            const panelId = `menu-section-${section.title.replace(/\s+/g, "-").toLowerCase()}`;

            return (
              <div key={section.title}>
                <button
                  type="button"
                  onClick={() => setOpenSection(isOpen ? null : section.title)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className={`w-full justify-between ${itemClass} ${
                    isOpen ? "bg-stone-100 dark:bg-white/10" : ""
                  }`}
                >
                  {section.title}
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden
                    className={`h-4 w-4 shrink-0 transition-transform duration-300 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {/* Animating to a height nobody measured: the outer grid goes
                    from 0fr to 1fr, which the browser resolves against the
                    content's own height. A max-height guess would either clip a
                    long section or coast through empty space on a short one. */}
                <div
                  id={panelId}
                  className={`grid transition-all duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="flex flex-col gap-0.5 border-l border-black/10 pt-1 pb-1 pl-3 ml-3 dark:border-white/15">
                      {section.items.map((item) =>
                        item.anchor ? (
                          // Landing-page anchors keep the swoop-scroll behaviour.
                          <a
                            key={item.href}
                            href={item.href}
                            onClick={(e) => {
                              onAnchorClick(e);
                              onClose();
                            }}
                            // tabIndex -1 while collapsed: the links are still in
                            // the DOM (that's what lets them animate), and without
                            // this a keyboard user would tab into a hidden panel.
                            tabIndex={isOpen ? undefined : -1}
                            className={itemClass}
                          >
                            {item.label}
                          </a>
                        ) : (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={onClose}
                            tabIndex={isOpen ? undefined : -1}
                            className={`${itemClass} ${
                              pathname === item.href
                                ? "bg-amber-400/15 text-stone-900 dark:text-white"
                                : ""
                            }`}
                          >
                            {item.label}
                          </Link>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="relative z-10 mt-auto border-t border-black/10 pt-4 dark:border-white/15">
          {user ? (
            <>
              {/* Who's signed in — tap-through to account settings */}
              <Link
                href="/account"
                onClick={onClose}
                className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-stone-100 dark:hover:bg-white/10"
              >
                <Avatar user={user} className="h-9 w-9 text-base" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-extrabold text-stone-900 dark:text-white">
                    {user.name}
                  </span>
                  <span className="block truncate text-xs text-stone-500 capitalize dark:text-white/50">
                    {roleLabelOf(user.role)}
                  </span>
                </span>
              </Link>
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
            </>
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
                Sign in / Sign up
              </Link>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
