"use client";

import { useRef } from "react";
import { AlertTriangle, Check } from "lucide-react";
import type { CredentialFormatResult } from "@buildora/shared";

// Shared look for the verification wizard — a scoped dark liquid-glass
// surface (charcoal glass + architectural gold), independent of the site
// theme. Cards track the cursor and light up where it hovers.

/** Text input / select / textarea — frosted fill, gold glow when focused. */
export const input =
  "block w-full rounded-2xl border border-white/60 dark:border-white/[0.16] bg-white/50 dark:bg-white/[0.08] px-4 py-2.5 text-sm text-stone-900 dark:text-white placeholder-stone-400 dark:placeholder-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] backdrop-blur-xl transition-all duration-200 outline-none hover:border-stone-400 dark:hover:border-white/30 focus:border-[#F5B400]/70 focus:bg-white/70 dark:focus:bg-white/[0.12] focus:shadow-[0_0_0_4px_rgba(245,180,0,0.12),0_0_28px_rgba(245,180,0,0.12)] disabled:opacity-50 [color-scheme:light] dark:[color-scheme:dark]";

export const label = "mb-1.5 block text-sm font-semibold text-stone-900 dark:text-slate-100";

/** Frosted inner box for one entry inside a multi-entry step. */
export const entryBox =
  "rounded-3xl border border-white/50 dark:border-white/[0.12] bg-white/40 dark:bg-white/[0.06] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl sm:p-5";

export const addButton =
  "self-start rounded-full border border-white/60 dark:border-white/[0.18] bg-white/50 dark:bg-white/[0.10] px-5 py-2 text-sm font-bold text-stone-900 dark:text-white backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-[#F5B400]/60 hover:text-amber-600 dark:hover:text-[#F5B400] hover:shadow-[0_8px_24px_rgba(245,180,0,0.15)] active:translate-y-0 disabled:opacity-50";

export const removeButton =
  "text-xs font-bold text-stone-500 dark:text-slate-500 transition hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-50";

/**
 * Liquid-glass card. onMouseMove writes the cursor position into two CSS
 * variables (--mx/--my); two overlay layers read them to render an interior
 * spotlight and a border segment that catches the light. Both fade in on
 * hover and cost nothing when the cursor leaves.
 */
export function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      className={`group relative rounded-[32px] border border-white/60 dark:border-white/[0.16] bg-white/60 dark:bg-white/[0.09] shadow-[0_20px_60px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.6)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-[44px] backdrop-saturate-[1.8] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/80 dark:hover:border-white/[0.22] hover:shadow-[0_28px_80px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.7)] dark:hover:shadow-[0_28px_80px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.22)] ${className}`}
    >
      {/* Top sheen — the light source above the glass */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-36 rounded-t-[32px] bg-gradient-to-b from-white/60 dark:from-white/[0.12] to-transparent"
      />

      {/* Interior spotlight following the cursor */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[32px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(480px circle at var(--mx, 50%) var(--my, 0%), rgba(255,255,255,0.08), transparent 65%)",
        }}
      />

      {/* Border light: a radial gradient masked so only a 1px ring shows,
          making the card edge catch the light near the cursor. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[32px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          padding: 1,
          background:
            "radial-gradient(320px circle at var(--mx, 50%) var(--my, 0%), rgba(255,255,255,0.45), rgba(245,180,0,0.25) 45%, transparent 70%)",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />

      <div className="relative p-6 sm:p-8">{children}</div>
    </div>
  );
}

/** Label + control wrapper so every field is laid out the same way. */
export function Field({
  id,
  title,
  required,
  hint,
  children,
}: {
  id?: string;
  title: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {title}
        {required && <span className="ml-1 text-amber-600 dark:text-[#F5B400]">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * A row of toggleable chips — expertise areas, equipment, material categories,
 * delivery districts. Four steps needed the same control, so it lives here
 * rather than being copy-pasted with slightly different gold in each one.
 */
export function ChipGroup({
  options,
  selected,
  onToggle,
  disabled,
}: {
  options: readonly string[];
  selected: readonly string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((option) => {
        const isOn = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(option)}
            aria-pressed={isOn}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${
              isOn
                ? "border-[#F5B400]/70 bg-[#F5B400]/20 text-amber-600 dark:text-[#F5B400] shadow-[0_0_16px_rgba(245,180,0,0.2)] backdrop-blur-xl"
                : "border-white/60 dark:border-white/[0.18] bg-white/50 dark:bg-white/[0.08] text-stone-800 dark:text-slate-200 backdrop-blur-xl hover:border-stone-400 dark:hover:border-white/35"
            }`}
          >
            {isOn && <Check className="h-3.5 w-3.5" />}
            {option}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A credential number with live format feedback.
 *
 * The verdict comes from the same function the API runs at submit time, so what
 * someone is told while typing and what the supervisor eventually sees can't
 * disagree. It's only a shape check — there's no register to look a BIN, TIN or
 * trade licence up in — so the wording stays at "looks right", never "verified".
 */
export function CredentialField({
  id,
  title,
  required,
  hint,
  placeholder,
  value,
  onChange,
  check,
}: {
  id: string;
  title: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  /** The shared validator for this kind of number. */
  check: (raw: string) => CredentialFormatResult;
}) {
  // Nothing typed yet is not a failure — say nothing until there's something
  // to judge.
  const verdict = value.trim() === "" ? null : check(value);

  return (
    <Field id={id} title={title} required={required} hint={hint}>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={input}
      />
      {verdict && (
        <p
          className={`mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold ${
            verdict.ok
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {verdict.ok ? (
            <>
              <Check className="h-3.5 w-3.5" /> Looks like a valid number, a supervisor still checks
              the document.
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5" /> {verdict.issue}
            </>
          )}
        </p>
      )}
    </Field>
  );
}

/** Heading block at the top of each step. */
export function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h2 className="bg-gradient-to-b from-stone-900 to-stone-600 dark:from-white dark:to-slate-300 bg-clip-text text-xl font-extrabold tracking-tight text-transparent sm:text-2xl">
        {title}
      </h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{subtitle}</p>
    </div>
  );
}
