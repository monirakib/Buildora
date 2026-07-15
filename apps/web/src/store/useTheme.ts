import { create } from "zustand";
import type { ThemeMode } from "@/lib/frames";

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

function applyMode(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", mode === "night");
  try {
    localStorage.setItem("buildora-theme", mode);
  } catch {
    // Storage unavailable (private mode) — theme just won't persist.
  }
}

/**
 * The inline script in layout.tsx sets the `.dark` class before hydration;
 * the store initializer reads it back so React state matches the DOM.
 */
export const useTheme = create<ThemeState>()((set) => ({
  mode:
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "night"
      : "day",
  setMode: (mode) => {
    applyMode(mode);
    set({ mode });
  },
  toggle: () =>
    set((state) => {
      const mode: ThemeMode = state.mode === "day" ? "night" : "day";
      applyMode(mode);
      return { mode };
    }),
}));
