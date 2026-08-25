import { PermitType } from "./enums";

/**
 * One required document for a permit type. `key` matches
 * `PermitDocument.key` on the application's uploaded `documents`, so the UI
 * can tell which required items are still missing.
 *
 * This list is a general reference guide compiled from RAJUK's publicly known
 * building-permit requirements — it is not an official RAJUK-published
 * checklist. Exact requirements vary by plot size, building height, and
 * land-use category, and can change; always confirm against RAJUK/ECPS
 * directly. `required: false` marks items that only apply to some buildings
 * (e.g. multi-storied), shown in the UI as "if applicable".
 */
export interface PermitChecklistItem {
  key: string;
  label: string;
  note?: string;
  required: boolean;
}

/** Land Use Clearance — confirms the plot's zoning before design proceeds. */
const PLANNING_PERMIT_CHECKLIST: PermitChecklistItem[] = [
  { key: "land_deed", label: "Deed of ownership (Dolil)", required: true },
  {
    key: "khatian",
    label: "Khatian (record of rights)",
    note: "CS/SA/RS/BS or City Jorip, whichever applies",
    required: true,
  },
  {
    key: "mutation_certificate",
    label: "Mutation certificate",
    note: "Proves the khatian is updated to the applicant's name",
    required: true,
  },
  {
    key: "land_tax_receipt",
    label: "Up-to-date land tax receipt",
    note: "Current year's Bhumi Kar receipt",
    required: true,
  },
  { key: "mouza_map", label: "Mouza / plot location map", required: true },
  {
    key: "site_survey_plan",
    label: "Site survey plan",
    note: "Prepared by a licensed surveyor, with dimensions",
    required: true,
  },
  { key: "applicant_nid", label: "Applicant's NID", required: true },
  {
    key: "application_form",
    label: "RAJUK application form",
    note: "The prescribed Planning Permit / Land Use Clearance form",
    required: true,
  },
];

/** Building Construction Permit — the actual building approval. */
const CONSTRUCTION_PERMIT_CHECKLIST: PermitChecklistItem[] = [
  {
    key: "planning_permit_certificate",
    label: "Approved Planning Permit",
    note: "Proof the land-use clearance step is already done",
    required: true,
  },
  { key: "land_deed", label: "Deed of ownership (Dolil)", required: true },
  { key: "khatian", label: "Khatian (record of rights)", required: true },
  { key: "mutation_certificate", label: "Mutation certificate", required: true },
  { key: "land_tax_receipt", label: "Up-to-date land tax receipt", required: true },
  {
    key: "non_encumbrance_certificate",
    label: "Non-encumbrance certificate",
    note: "Confirms no outstanding claim/mortgage",
    required: true,
  },
  { key: "site_survey_plan", label: "Site survey plan", required: true },
  {
    key: "architectural_drawings",
    label: "Architectural drawings",
    note: "Floor plans, elevations, sections — signed by an IAB-registered architect",
    required: true,
  },
  {
    key: "structural_design",
    label: "Structural design & calculations",
    note: "Signed by an IEB-registered structural engineer",
    required: true,
  },
  {
    key: "soil_test_report",
    label: "Soil test report",
    note: "Geotechnical investigation",
    required: true,
  },
  {
    key: "fire_noc",
    label: "Fire Service NOC",
    note: "Required for multi-storied buildings above the threshold RAJUK sets",
    required: false,
  },
  {
    key: "environmental_clearance",
    label: "Environmental clearance",
    note: "Required for categories the Department of Environment flags (larger projects)",
    required: false,
  },
  { key: "applicant_nid", label: "Applicant's NID", required: true },
  {
    key: "application_form",
    label: "RAJUK application form",
    note: "The prescribed Building Construction Permit form",
    required: true,
  },
];

export const PERMIT_CHECKLISTS: Record<PermitType, PermitChecklistItem[]> = {
  [PermitType.PLANNING_PERMIT]: PLANNING_PERMIT_CHECKLIST,
  [PermitType.CONSTRUCTION_PERMIT]: CONSTRUCTION_PERMIT_CHECKLIST,
};
