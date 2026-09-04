import { create } from "zustand";

export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  /** An optional button on the toast, e.g. "View cart". */
  action?: { label: string; onClick: () => void };
  /** True once the exit animation has started; the row is dropped after it. */
  leaving?: boolean;
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, tone?: ToastTone, action?: ToastItem["action"]) => void;
  dismiss: (id: number) => void;
}

/** Matches the exit duration of `.toast-item[data-leaving]` in globals.css. */
const EXIT_MS = 200;
const LIFETIME_MS = 4000;

/**
 * App-wide toasts. Anything, anywhere, can call `toast.success("Saved")`; the
 * `<Toaster />` in the root layout draws them.
 *
 * Leaving is two steps: flag the toast so the CSS can play its exit, then
 * drop it. Removing it in one go would unmount the node on the same tick and
 * there would be nothing left on screen to animate.
 */
export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, tone = "success", action) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, message, tone, action }] }));
    setTimeout(() => get().dismiss(id), LIFETIME_MS);
  },
  dismiss: (id) => {
    if (!get().toasts.some((t) => t.id === id && !t.leaving)) return;
    set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), EXIT_MS);
  },
}));

/** Shorthand so callers read as `toast.success("…")`. */
export const toast = {
  success: (message: string, action?: ToastItem["action"]) =>
    useToast.getState().push(message, "success", action),
  error: (message: string, action?: ToastItem["action"]) =>
    useToast.getState().push(message, "error", action),
  info: (message: string, action?: ToastItem["action"]) =>
    useToast.getState().push(message, "info", action),
};
