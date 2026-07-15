import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import type { HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  DEFAULT_PAGE_SIZE,
  UserRole,
  type Paginated,
  type ProfessionalProfile,
  type PublicProfessional,
  type SessionUser,
} from "@buildora/shared";
import { User, type UserDoc } from "../models/User";

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
    licenseAuthority: profile.licenseAuthority,
    specialties: profile.specialties,
    yearsExperience: profile.yearsExperience,
    website: profile.website,
    education: profile.education,
    achievements: profile.achievements,
    portfolio: profile.portfolio,
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

  const [docs, total] = await Promise.all([
    User.find(filter)
      // APPROVED sorts before the other statuses (verified-first), then newest.
      .sort({ verificationStatus: -1, createdAt: -1 })
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
  year: optionalYear,
  certificateUrl: optionalUrl,
});

const achievementEntrySchema = z.object({
  title: z.string().trim().min(2, "Enter the achievement title").max(160),
  year: optionalYear,
  description: optionalText(500),
});

const portfolioProjectSchema = z.object({
  title: z.string().trim().min(2, "Enter the project title").max(160),
  description: optionalText(1000),
  year: optionalYear,
  location: optionalText(120),
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
  licenseAuthority: optionalText(60),
  licenseNumber: optionalText(60),
  specialties: optionalText(200),
  yearsExperience: z.preprocess(
    emptyToUndef,
    z.coerce.number().min(0, "Must be zero or more").max(80).optional()
  ),
  website: optionalUrl,
  education: z.array(educationEntrySchema).max(10, "At most 10 education entries").default([]),
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

  const { name, phone, ...profile } = parsed.data;
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
