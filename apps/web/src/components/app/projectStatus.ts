import { ProjectStatus } from "@buildora/shared";

/** Human labels for each project stage, shared by the projects pages. */
export const projectStatusLabels: Record<ProjectStatus, string> = {
  [ProjectStatus.DRAFT]: "Draft",
  [ProjectStatus.BRIEF_POSTED]: "Brief posted",
  [ProjectStatus.CONCEPT_STAGE]: "Concept stage",
  [ProjectStatus.DESIGN_IN_PROGRESS]: "Design in progress",
  [ProjectStatus.PERMIT_STAGE]: "Permit stage",
  [ProjectStatus.BIDDING]: "Bidding",
  [ProjectStatus.UNDER_CONSTRUCTION]: "Under construction",
  [ProjectStatus.COMPLETED]: "Completed",
  [ProjectStatus.ARCHIVED]: "Archived",
};

/** Badge colours per stage (amber = waiting, sky = active, emerald = done). */
export const projectStatusStyles: Record<ProjectStatus, string> = {
  [ProjectStatus.DRAFT]: "bg-stone-500/15 text-stone-600 dark:text-slate-400",
  [ProjectStatus.BRIEF_POSTED]: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  [ProjectStatus.CONCEPT_STAGE]: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  [ProjectStatus.DESIGN_IN_PROGRESS]: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  [ProjectStatus.PERMIT_STAGE]: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  [ProjectStatus.BIDDING]: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  [ProjectStatus.UNDER_CONSTRUCTION]: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  [ProjectStatus.COMPLETED]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  [ProjectStatus.ARCHIVED]: "bg-stone-500/15 text-stone-600 dark:text-slate-400",
};

/** The stages in journey order — used to draw the progress timeline. */
export const projectStatusOrder: ProjectStatus[] = [
  ProjectStatus.DRAFT,
  ProjectStatus.BRIEF_POSTED,
  ProjectStatus.CONCEPT_STAGE,
  ProjectStatus.DESIGN_IN_PROGRESS,
  ProjectStatus.PERMIT_STAGE,
  ProjectStatus.UNDER_CONSTRUCTION,
  ProjectStatus.COMPLETED,
];

export const buildingTypeLabels: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  MIXED_USE: "Mixed use",
};

/** "12,00,000 BDT"-style money formatting (en-IN grouping ≈ lakh/crore). */
export function formatBdt(amount: number): string {
  return `${amount.toLocaleString("en-IN")} BDT`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
