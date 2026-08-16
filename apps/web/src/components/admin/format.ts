import { UserRole } from "@buildora/shared";

/** 1284 → "1.3K" — for stat tiles and bar tips. */
export function compact(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** 1250000 → "৳12.5L" won't happen — we use western compact: "৳1.3M". */
export function bdtCompact(n: number): string {
  return `৳${compact(n)}`;
}

/** Full amount with Bangladeshi lakh/crore grouping: 1234567 → "৳12,34,567". */
export function bdtFull(n: number): string {
  return `৳${n.toLocaleString("en-IN")}`;
}

/** ISO date → "12 Jul". */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** ISO date → "12 Jul 2026". */
export function mediumDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** ISO date → "3m ago" / "2h ago" / "5d ago" / "12 Jun". */
export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 14) return `${Math.floor(seconds / 86400)}d ago`;
  return shortDate(iso);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.LAND_OWNER]: "Land owner",
  [UserRole.ARCHITECT]: "Architect",
  [UserRole.STRUCTURAL_ENGINEER]: "Structural engineer",
  [UserRole.CONTRACTOR]: "Contractor",
  [UserRole.SUPPLIER]: "Supplier",
  [UserRole.ADMIN]: "Admin",
  // Exhaustive by requirement, not because it belongs on screen. A key
  // custodian has no profile and never appears in the directory or the charts;
  // this is only here so a stray value renders as a name rather than a blank.
  [UserRole.SUPER_ADMIN]: "Key custodian",
};

/** "UNDER_CONSTRUCTION" → "Under construction" — for any status enum. */
export function statusLabel(status: string): string {
  const words = status.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
