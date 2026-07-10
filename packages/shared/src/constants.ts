export const APP_NAME = "Buildora";
export const APP_TAGLINE = "The construction super-platform for Bangladesh";

/** Commission on architect/engineer design fees paid through escrow (plan §9.1). */
export const DESIGN_COMMISSION_RATE = { MIN: 0.1, MAX: 0.15 } as const;

/** Commission on marketplace material orders (plan §9.1). */
export const MARKETPLACE_COMMISSION_RATE = { MIN: 0.05, MAX: 0.08 } as const;

/** Concept brief fee range in BDT (plan §4.1 step 04). */
export const CONCEPT_FEE_BDT = { MIN: 500, MAX: 1000 } as const;

/** Included revision rounds per design contract (plan §3.1). */
export const DESIGN_REVISION_ROUNDS = 3;

/** Commission rate applied to escrow releases until tiers exist. */
export const DEFAULT_COMMISSION_RATE = 0.1;

/** 1 katha = 720 sq ft ≈ 66.89 m² — used to turn plot size into floor area. */
export const KATHA_TO_SQM = 66.89;

export const DEFAULT_PAGE_SIZE = 20;
