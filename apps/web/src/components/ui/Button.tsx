"use client";

import { Loader2 } from "lucide-react";
import { useMagnetic } from "@/lib/useMagnetic";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variantClass: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "px-4 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3 text-sm",
};

/**
 * A tick that draws itself in.
 *
 * `pathLength="1"` normalises the path so the dash values are a fraction of
 * its length whatever size it renders at; the keyframe in globals.css runs the
 * offset from 1 to 0, which reveals the stroke from its start to its end.
 */
export function DrawnCheck({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path
        d="M20 6 9 17l-5-5"
        pathLength={1}
        strokeDasharray={1}
        style={{ animation: "draw-check 0.4s cubic-bezier(0.23, 1, 0.32, 1) 0.08s both" }}
      />
    </svg>
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** A spinner replaces the icon and the button stops accepting clicks. */
  loading?: boolean;
  /**
   * The "it worked" state: the label gives way to a drawn tick and
   * `successLabel`. Flip it on for a second or two after the action lands
   * (see `useFlash`), then let it fall back to the normal label.
   */
  success?: boolean;
  successLabel?: string;
  icon?: React.ReactNode;
  /** Stretch to the container's width. */
  block?: boolean;
  /** Leans toward the cursor as it approaches. For the one main action on a screen. */
  magnetic?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

/**
 * The app's button, with its three states built in.
 *
 * The three faces (idle, loading, success) are stacked in one grid cell rather
 * than swapped in and out, so the button is always as wide as its widest
 * label. A button that changes width when its text changes shoves everything
 * beside it, and that jolt is what makes a state change feel like a glitch
 * instead of a response.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  success = false,
  successLabel = "Done",
  icon,
  block = false,
  className = "",
  children,
  disabled,
  type = "button",
  magnetic = false,
  ref,
  ...rest
}: ButtonProps) {
  const magnet = useMagnetic<HTMLButtonElement>({ radius: magnetic ? 90 : 0 });
  const face = success ? "success" : loading ? "loading" : "idle";
  const layer = "col-start-1 row-start-1 flex items-center justify-center gap-2";
  const hidden = "pointer-events-none opacity-0";
  const shift = "transition-[opacity,translate] duration-200 ease-out";

  return (
    <button
      ref={(node) => {
        magnet.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-state={face}
      className={`${variantClass[variant]} ${sizeClass[size]} ${block ? "flex w-full" : ""} ${className}`}
      {...rest}
    >
      <span className="grid">
        <span
          className={`${layer} ${shift} ${face === "idle" ? "" : `${hidden} -translate-y-1`}`}
          aria-hidden={face !== "idle"}
        >
          {icon}
          {children}
        </span>
        <span
          className={`${layer} ${shift} ${face === "loading" ? "" : hidden}`}
          aria-hidden={face !== "loading"}
        >
          <Loader2 className="h-4 w-4 animate-spin-smooth" />
          {children}
        </span>
        <span
          className={`${layer} ${shift} ${face === "success" ? "" : `${hidden} translate-y-1`}`}
          aria-hidden={face !== "success"}
        >
          {face === "success" && <DrawnCheck />}
          {successLabel}
        </span>
      </span>
    </button>
  );
}
