"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Info, X } from "lucide-react";
import { surfaceClass, surfaceHeaderClass } from "@/components/ui/surface";

/**
 * The building blocks the account console is assembled from.
 *
 * A dashboard is really only four kinds of thing — lists, cards, user inputs
 * and tabs — plus the overlays that let you *act* on what's displayed (modals,
 * popovers, toasts). Everything here is one of those, so the pages themselves
 * stay layout-only and the styling lives in one place.
 */

/* ------------------------------------------------------------------ *
 * Shared class strings
 * ------------------------------------------------------------------ */

/**
 * Dashboard type is smaller and more tightly spaced than a landing page's:
 * a lot more has to fit on one screen, so the steps between sizes are small.
 */
export const eyebrowClass =
  "text-[0.68rem] font-bold tracking-[0.16em] text-stone-500 uppercase dark:text-slate-400";

export const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-3.5 py-2 text-sm text-stone-900 placeholder-stone-400 transition outline-none focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

/**
 * Card surface — now shared with the rest of the app rather than defined here.
 * Re-exported so the console's own components keep their short local name.
 */
export const cardClass = surfaceClass;

export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-stone-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none";

export const ghostButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full border border-stone-300/80 bg-white/60 px-4 py-2 text-sm font-bold text-stone-700 transition hover:bg-white disabled:opacity-40 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10";

export const dangerButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-500 disabled:opacity-40";

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

/** A titled panel. `action` sits opposite the title, for this card's own controls. */
export function Card({
  title,
  description,
  action,
  bodyClassName = "p-4 sm:p-5",
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Set to "" when the children are a full-bleed list that draws its own padding. */
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cardClass}>
      <div className={surfaceHeaderClass}>
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * List
 * ------------------------------------------------------------------ */

/**
 * A stacked list. Separation is by divider line rather than by giving every row
 * its own border — the same rows in individual boxes read as clutter once
 * there are more than a handful.
 */
export function List({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-black/5 dark:divide-white/10">{children}</div>;
}

/**
 * One labelled row: name and hint on the left, the control on the right. Below
 * `sm` the two halves stack so nothing is squeezed on a phone.
 */
export function FieldRow({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 px-4 py-3.5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:items-center sm:gap-4 sm:px-5">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-semibold">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A row that opens something — icon, title, sub-line, chevron. */
export function ActionRow({
  icon,
  title,
  sub,
  actionLabel,
  onAction,
  tone = "default",
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  actionLabel: string;
  onAction: () => void;
  tone?: "default" | "danger";
}) {
  const danger = tone === "danger";
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
          danger
            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
            : "bg-amber-400/20 text-amber-700 dark:text-amber-300"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="truncate text-xs text-stone-500 dark:text-slate-400">{sub}</p>
      </div>
      <button
        type="button"
        onClick={onAction}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${
          danger
            ? "text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
            : "text-amber-700 hover:bg-amber-400/15 dark:text-amber-300"
        }`}
      >
        {actionLabel}
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Shown in place of a list that has nothing in it yet. */
export function EmptyState({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-stone-900/5 text-stone-400 dark:bg-white/5 dark:text-slate-500">
        {icon}
      </span>
      <p className="text-sm font-bold">{title}</p>
      <p className="max-w-xs text-xs text-stone-500 dark:text-slate-400">{sub}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Figures — when the thing to show is a number
 * ------------------------------------------------------------------ */

/**
 * One headline number. A single current value is a stat tile, not a one-bar
 * chart: the label says what it is, the value is the figure itself, and the
 * optional `foot` carries the qualifier.
 *
 * The value uses the font's default (proportional) figures — `tabular-nums`
 * gives every digit the width of a zero, which looks loose at this size and is
 * only worth it in a column of numbers that has to line up vertically.
 */
export function StatTile({
  label,
  value,
  foot,
  icon,
  children,
}: {
  label: string;
  value: string;
  foot?: React.ReactNode;
  icon?: React.ReactNode;
  /** Optional extra row under the value — e.g. a meter. */
  children?: React.ReactNode;
}) {
  return (
    <div className={`${cardClass} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-stone-500 dark:text-slate-400">{label}</p>
        {icon && <span className="shrink-0 text-stone-400 dark:text-slate-500">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      {children}
      {foot && <div className="mt-2 text-xs text-stone-500 dark:text-slate-400">{foot}</div>}
    </div>
  );
}

/**
 * A progress meter. The unfilled track is a lighter step of the fill's own hue
 * rather than plain grey, so the bar reads as one scale across its whole width.
 * Ticks at each quarter give the eye something to measure against — a bare bar
 * tells you "some" but never "how much".
 */
export function Meter({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="mt-3">
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="relative h-2 overflow-hidden rounded-full bg-amber-400/20"
      >
        {/* Quarter ticks, drawn under the fill so the filled part stays solid */}
        {[25, 50, 75].map((tick) => (
          <span
            key={tick}
            aria-hidden
            className="absolute top-0 h-full w-px bg-white/70 dark:bg-black/30"
            style={{ left: `${tick}%` }}
          />
        ))}
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-amber-400 transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {/* Numbers on the scale — the ticks mean nothing without them. */}
      <div className="mt-1 flex justify-between text-[0.62rem] font-semibold text-stone-400 tabular-nums dark:text-slate-500">
        <span>0</span>
        <span>50</span>
        <span>100%</span>
      </div>
    </div>
  );
}

/**
 * A state, not a measurement. Status colour is reserved for status and always
 * ships with an icon and a word, so the state is never carried by colour alone.
 */
export function StatusPill({
  tone,
  icon,
  children,
}: {
  tone: "good" | "warning" | "critical" | "neutral";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const tones = {
    good: "bg-emerald-400/15 text-emerald-700 dark:text-emerald-300",
    warning: "bg-amber-400/20 text-amber-800 dark:text-amber-200",
    critical: "bg-rose-400/15 text-rose-700 dark:text-rose-300",
    neutral: "bg-stone-900/5 text-stone-600 dark:bg-white/10 dark:text-slate-300",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */

/**
 * Tabs add views without adding sidebar entries — use them for things that are
 * genuinely two faces of the same page, so the user never loses their place.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 rounded-full bg-stone-900/5 p-1 dark:bg-white/5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
            active === tab.id
              ? "bg-white text-stone-900 shadow-sm dark:bg-white/15 dark:text-white"
              : "text-stone-500 hover:text-stone-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Overlays
 * ------------------------------------------------------------------ */

/*
 * There is no Popover here on purpose. The only things on this page that
 * wanted one — the account menu and the theme switch — are the navbar's job,
 * and it already opens them on hover. What's left is the security work, which
 * is blocking by nature and belongs in the Modal below.
 */

/**
 * Blocking overlay for context that's more involved but still belongs to this
 * page — you finish it or cancel it before doing anything else. Because the
 * page is hidden while it's open, callers confirm the result with a toast.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    // Stop the page behind from scrolling while the dialog owns the screen.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-stone-950/50 p-4 backdrop-blur-sm">
      {/* Backdrop click closes; the dialog itself stops the click bubbling. */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-lg rounded-2xl border border-white/50 bg-white p-5 shadow-2xl shadow-black/30 dark:border-white/15 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold tracking-tight">{title}</h2>
            {description && (
              <p className="mt-1 text-xs text-stone-500 dark:text-slate-400">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-900/5 hover:text-stone-700 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Toasts
 * ------------------------------------------------------------------ */

export interface Toast {
  id: number;
  message: string;
  tone: "success" | "error";
}

/**
 * The console's notification channel: tell the user something happened without
 * taking over the screen. Errors and warnings especially — those are the ones
 * that get missed when a form just silently does nothing.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Timers are cleared on unmount so a toast can't fire setState afterwards.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  function pushToast(message: string, tone: Toast["tone"] = "success") {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    timers.current.push(
      setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4000)
    );
  }

  function dismissToast(id: number) {
    setToasts((current) => current.filter((t) => t.id !== id));
  }

  return { toasts, pushToast, dismissToast };
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-60 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`animate-fade-down pointer-events-auto flex w-full items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold shadow-2xl sm:w-auto sm:max-w-sm ${
            toast.tone === "error"
              ? "bg-rose-600 text-white"
              : "bg-stone-900 text-white dark:bg-white dark:text-stone-950"
          }`}
        >
          <span className="mt-0.5 shrink-0">
            {toast.tone === "error" ? <Info className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
            className="shrink-0 opacity-60 transition hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
