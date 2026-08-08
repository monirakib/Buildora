import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import type { HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  BD_DIVISIONS,
  DEFAULT_PAGE_SIZE,
  EXPERTISE_AREAS,
  UserRole,
  VerificationStatus,
  isDistrictInDivision,
  type Paginated,
  type ProfessionalProfile,
  type PublicProfessional,
  type SessionUser,
} from "@buildora/shared";
import { User, type UserDoc } from "../models/User";
import { keepNidCheck } from "./auth.controller";

/** Public-safe projection of a professional — no email, phone, NID, or license number. */
function toPublicProfessional(user: HydratedDocument<UserDoc>): PublicProfessional {
  // toObject so the embedded education/achievements/portfolio arrays come out
  // as plain data rather than Mongoose subdocuments.
  const profile = (user.toObject().profile ?? {}) as ProfessionalProfile;
  return {
    id: user._id.toString(),
    name: user.name,
    username: user.username,
    role: user.role,
    verificationStatus: user.verificationStatus,
    avatarUrl: profile.avatarUrl,
    company: profile.company,
    bio: profile.bio,
    portfolioTitle: profile.portfolioTitle,
    portfolioIntro: profile.portfolioIntro,
    licenseAuthority: profile.licenseAuthority,
    specialties: profile.specialties,
    yearsExperience: profile.yearsExperience,
    website: profile.website,
    professionalTitle: profile.professionalTitle,
    expertise: profile.expertise,
    education: profile.education,
    achievements: profile.achievements,
    portfolio: profile.portfolio,
    practiceDivision: profile.practiceDivision,
    practiceDistrict: profile.practiceDistrict,
    // Left undefined rather than 0 when nobody has reviewed them, so the UI can
    // say "No ratings yet" instead of showing an empty five-star row.
    ratingAvg: user.ratingCount ? user.ratingAvg : undefined,
    ratingCount: user.ratingCount ?? 0,
  };
}

/**
 * GET /api/professionals — public directory. Defaults to architects (the only
 * profession the land-owner flow reaches today). `search` matches name, company,
 * or specialties; results are ordered verified-first so approved professionals
 * surface at the top once verification review ships.
 */
export async function listProfessionals(req: Request, res: Response) {
  // Only the four professional roles are listable; anything else falls back to
  // architects so a stray query can't expose land owners or admins.
  const roleParam = String(req.query.role ?? UserRole.ARCHITECT);
  const listableRoles: UserRole[] = [
    UserRole.ARCHITECT,
    UserRole.STRUCTURAL_ENGINEER,
    UserRole.CONTRACTOR,
    UserRole.SUPPLIER,
  ];
  const role = listableRoles.includes(roleParam as UserRole)
    ? (roleParam as UserRole)
    : UserRole.ARCHITECT;

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));

  const filter: Record<string, unknown> = { role };

  // Only supervisor-approved professionals are listed by default: an unverified
  // account has had none of its credentials checked, so putting it in front of a
  // land owner alongside verified ones would be misleading. `includeUnverified`
  // opens the directory up — that's the "Show unverified" toggle on the
  // architects page. Those profiles are browsable but can't be engaged; the
  // block lives in createInquiry and acceptProposal, not here.
  if (String(req.query.includeUnverified ?? "") !== "true") {
    filter.verificationStatus = VerificationStatus.APPROVED;
  }

  const search = String(req.query.search ?? "").trim();
  if (search) {
    // Case-insensitive contains across the public text fields. Escaped so a
    // user typing regex metacharacters can't break or slow the query.
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    filter.$or = [{ name: rx }, { "profile.company": rx }, { "profile.specialties": rx }];
  }

  const specialty = String(req.query.specialty ?? "").trim();
  if (specialty) {
    const safe = specialty.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter["profile.specialties"] = new RegExp(safe, "i");
  }

  // ---- Specialisation ----
  // The wizard's expertise chips come from a fixed list, so this is an exact
  // match on the stored array rather than a text search. Several may be passed
  // (?expertise=Residential&expertise=Interior); a professional matches if they
  // hold any of them, which is what a land owner ticking boxes expects.
  const expertise = ([] as string[])
    .concat(req.query.expertise as string | string[])
    .filter((v) => typeof v === "string" && v.trim() !== "")
    .filter((v) => (EXPERTISE_AREAS as readonly string[]).includes(v));
  if (expertise.length > 0) {
    filter["profile.expertise"] = { $in: expertise };
  }

  // ---- Location ----
  // Validated against the real division/district lists so an arbitrary string
  // can't be pushed into the query, and a district only filters when it really
  // belongs to the division alongside it.
  const division = String(req.query.division ?? "").trim();
  const district = String(req.query.district ?? "").trim();
  if ((BD_DIVISIONS as readonly string[]).includes(division)) {
    filter["profile.practiceDivision"] = division;
    if (district && isDistrictInDivision(division, district)) {
      filter["profile.practiceDistrict"] = district;
    }
  }

  // ---- Rating ----
  // A minimum score, e.g. 4 for "4 stars and up". Professionals with no reviews
  // are excluded by this — `ratingAvg` is unset until someone rates them, and
  // "no ratings yet" is genuinely not the same as meeting the bar.
  const minRating = Number(req.query.minRating);
  if (Number.isFinite(minRating) && minRating >= 1 && minRating <= 5) {
    filter.ratingAvg = { $gte: minRating };
  }

  // Default order is verified-first then newest, as before. The directory also
  // offers rating and experience; both put unrated/blank profiles last rather
  // than treating a missing value as zero.
  const sortParam = String(req.query.sort ?? "");
  const sort: Record<string, 1 | -1> =
    sortParam === "rating"
      ? { ratingAvg: -1, ratingCount: -1, createdAt: -1 }
      : sortParam === "experience"
        ? { "profile.yearsExperience": -1, createdAt: -1 }
        : { verificationStatus: -1, createdAt: -1 };

  const [docs, total] = await Promise.all([
    User.find(filter)
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    User.countDocuments(filter),
  ]);

  const body: Paginated<PublicProfessional> = {
    items: docs.map(toPublicProfessional),
    total,
    page,
    pageSize,
  };
  return res.json({ data: body });
}

// ---------- Professional profile editor (the signed-in professional) ----------

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);
const optionalText = (max: number) =>
  z.preprocess(emptyToUndef, z.string().trim().max(max).optional());
const optionalUrl = z.preprocess(emptyToUndef, z.url("Enter a valid URL").optional());
const optionalYear = z.preprocess(
  emptyToUndef,
  z.coerce.number().min(1950, "Enter a valid year").max(2100, "Enter a valid year").optional()
);

const educationEntrySchema = z.object({
  degree: z.string().trim().min(2, "Enter the degree name").max(120),
  institution: z.string().trim().min(2, "Enter the institution").max(160),
  department: optionalText(120),
  year: optionalYear,
  cgpa: optionalText(20),
  certificateUrl: optionalUrl,
  transcriptUrl: optionalUrl,
});

const experienceEntrySchema = z.object({
  company: z.string().trim().min(2, "Enter the company name").max(160),
  designation: z.string().trim().min(2, "Enter the designation").max(120),
  employmentType: optionalText(40),
  startDate: optionalText(10),
  endDate: optionalText(10),
  isCurrent: z.boolean().optional(),
  description: optionalText(1000),
});

const skillEntrySchema = z.object({
  name: z.string().trim().min(1, "Enter the skill name").max(60),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]),
});

const achievementEntrySchema = z.object({
  title: z.string().trim().min(2, "Enter the achievement title").max(160),
  year: optionalYear,
  description: optionalText(500),
});

const optionalNonNegative = (max: number) =>
  z.preprocess(emptyToUndef, z.coerce.number().min(0, "Must be zero or more").max(max).optional());

const portfolioProjectSchema = z.object({
  title: z.string().trim().min(2, "Enter the project title").max(160),
  description: optionalText(1000),
  year: optionalYear,
  location: optionalText(120),
  buildingType: optionalText(60),
  client: optionalText(120),
  areaSqft: optionalNonNegative(10_000_000),
  budgetBdt: optionalNonNegative(100_000_000_000),
  role: optionalText(120),
  imageUrls: z.array(z.url()).max(8, "At most 8 images per project").default([]),
});

// The whole editable professional profile, submitted in one save (mirrors how
// the land-owner profile PATCH replaces the profile subdocument).
const professionalProfileSchema = z.object({
  name: z.preprocess(
    emptyToUndef,
    z.string().trim().min(2, "Name must be at least 2 characters").optional()
  ),
  phone: optionalText(30),
  avatarUrl: optionalUrl,
  company: z.string({ message: "Enter your firm or company" }).trim().min(2).max(120),
  bio: optionalText(1000),
  portfolioTitle: optionalText(90),
  portfolioIntro: optionalText(280),
  licenseAuthority: optionalText(60),
  licenseNumber: optionalText(60),
  specialties: optionalText(200),
  yearsExperience: z.preprocess(
    emptyToUndef,
    z.coerce.number().min(0, "Must be zero or more").max(80).optional()
  ),
  website: optionalUrl,
  // ---- Architect verification wizard fields (all optional) ----
  dateOfBirth: optionalText(10),
  gender: optionalText(20),
  currentAddress: optionalText(300),
  permanentAddress: optionalText(300),
  nid: optionalText(20),
  nidFrontUrl: optionalUrl,
  nidBackUrl: optionalUrl,
  professionalTitle: optionalText(120),
  isIndependent: z.boolean().optional(),
  officeAddress: optionalText(300),
  languages: optionalText(160),
  linkedin: optionalUrl,
  practiceDivision: optionalText(40),
  practiceDistrict: optionalText(40),
  membershipStatus: optionalText(30),
  membershipCategory: optionalText(30),
  licenseIssueDate: optionalText(10),
  licenseExpiryDate: optionalText(10),
  iabCertificateUrl: optionalUrl,
  membershipCardUrl: optionalUrl,
  rajukEnlistmentNo: optionalText(60),
  rajukCertificateUrl: optionalUrl,
  declarationAgreed: z.boolean().optional(),
  declarationSignature: optionalText(120),
  declarationSignedAt: optionalText(30),
  education: z.array(educationEntrySchema).max(10, "At most 10 education entries").default([]),
  experience: z.array(experienceEntrySchema).max(15, "At most 15 experience entries").default([]),
  expertise: z
    .array(z.string().trim().min(1).max(60))
    .max(20, "Too many expertise areas")
    .default([]),
  skills: z.array(skillEntrySchema).max(20, "At most 20 skills").default([]),
  achievements: z.array(achievementEntrySchema).max(15, "At most 15 achievements").default([]),
  portfolio: z.array(portfolioProjectSchema).max(12, "At most 12 projects").default([]),
});

/** Strips DB internals; same shape the auth endpoints return. */
function toSessionUser(user: HydratedDocument<UserDoc>): SessionUser {
  const plain = user.toObject();
  return {
    id: user._id.toString(),
    name: plain.name,
    username: plain.username,
    email: plain.email,
    phone: plain.phone,
    role: plain.role,
    verificationStatus: plain.verificationStatus,
    profile: plain.profile,
  };
}

/**
 * PATCH /api/professionals/me/profile — the signed-in professional updates
 * their own profile (credentials, education, achievements, portfolio). The
 * route is limited to the four professional roles, so this never touches a
 * land owner's profile shape.
 */
export async function updateMyProfessionalProfile(req: Request, res: Response) {
  const parsed = professionalProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }

  const user = await User.findById(req.auth!.sub);
  if (!user) {
    return res.status(401).json({ error: { message: "Account no longer exists" } });
  }

  // The supervisor reviews the live profile, so it's frozen while a request
  // is open — editable again after a decision (approved or rejected).
  if (
    user.verificationStatus === VerificationStatus.DOCUMENTS_SUBMITTED ||
    user.verificationStatus === VerificationStatus.UNDER_REVIEW
  ) {
    return res.status(409).json({
      error: { message: "Your profile is locked while it's being reviewed" },
    });
  }

  const { name, phone, ...rest } = parsed.data;
  // Same rule as the land-owner profile: the NID pre-screen survives an edit
  // only while the NID it was run against is still the one on file.
  const profile = keepNidCheck(user.profile, rest);
  if (name !== undefined) user.name = name;
  // The editor always submits the full form, so blanks mean "clear this value"
  // — replace rather than merge, like the land-owner profile update.
  user.phone = phone;
  user.profile = profile;
  await user.save();

  return res.json({ data: { user: toSessionUser(user) } });
}

/** GET /api/professionals/:id — one professional's public profile. */
export async function getProfessional(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "Professional not found" } });
  }

  const user = await User.findById(id);
  // Only expose actual professionals — never a land owner or admin by id.
  const professionalRoles: UserRole[] = [
    UserRole.ARCHITECT,
    UserRole.STRUCTURAL_ENGINEER,
    UserRole.CONTRACTOR,
    UserRole.SUPPLIER,
  ];
  if (!user || !professionalRoles.includes(user.role)) {
    return res.status(404).json({ error: { message: "Professional not found" } });
  }

  return res.json({ data: { professional: toPublicProfessional(user) } });
}
