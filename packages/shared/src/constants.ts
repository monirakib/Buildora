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

export const DEFAULT_PAGE_SIZE = 20;
