import type { PhaseKey } from "./phases";

/** Every tab the hub can show. The four phase keys plus three cross-cutting ones. */
export type TabKey = "overview" | PhaseKey | "diary" | "documents";

/** Sidebar/tab wording, in journey order. */
export const TAB_LABELS: Record<TabKey, string> = {
  overview: "Overview",
  architect: "Architect",
  engineer: "Engineer",
  rajuk: "RAJUK",
  contractor: "Contractor",
  diary: "Site diary",
  documents: "Documents",
};

/** Journey order — the order tabs are rendered in. */
export const TAB_ORDER: TabKey[] = [
  "overview",
  "architect",
  "engineer",
  "rajuk",
  "contractor",
  "diary",
  "documents",
];

/** Narrows an arbitrary `?tab=` value to a real tab, or undefined. */
export function parseTab(raw: string | null): TabKey | undefined {
  return TAB_ORDER.find((t) => t === raw);
}
