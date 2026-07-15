import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { HydratedDocument } from "mongoose";
import { BuildingType, UserRole, type SessionUser } from "@buildora/shared";
import { env } from "../config/env";
import { User, type UserDoc } from "../models/User";

// Account fields every signup shares (land owner and professional alike).
const accountFields = {
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  // Permanent handle: lowercased so uniqueness is case-insensitive; letters,
  // digits and underscores only so it's safe to show in URLs/mentions later.
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-z0-9_]+$/, "Username can only contain letters, numbers and underscores"),
  email: z.email("Enter a valid email address"),
  phone: z.string().trim().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
};

const registerSchema = z.object(accountFields);

// The four professional actors a user may self-select at signup. LAND_OWNER
// registers through the public route; ADMIN is never self-assigned.
const PROFESSIONAL_ROLES = [
  UserRole.ARCHITECT,
  UserRole.STRUCTURAL_ENGINEER,
  UserRole.CONTRACTOR,
  UserRole.SUPPLIER,
] as const;

const registerProfessionalSchema = z.object({
  ...accountFields,
  role: z.enum(PROFESSIONAL_ROLES, { message: "Choose your professional role" }),
  // Credentials on which the account will later be verified. Optional at signup
  // (they can complete the profile before submitting for verification), but a
  // company is required so listings have something to show.
  company: z
    .string({ message: "Enter your firm or company" })
    .trim()
    .min(2, "Enter your firm or company")
    .max(120),
  licenseAuthority: z.string().trim().max(60).optional(),
  licenseNumber: z.string().trim().max(60).optional(),
  specialties: z.string().trim().max(200).optional(),
  yearsExperience: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().min(0, "Must be zero or more").max(80).optional()
  ),
  website: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.url("Enter a valid URL").optional()
  ),
});

const loginSchema = z.object({
  // Either an email or a username — we don't validate the format here so the
  // same "invalid credentials" message covers a typo in either.
  identifier: z.string().trim().min(1, "Enter your email or username"),
  password: z.string().min(1, "Password is required"),
});

// Profile update — every field optional (users fill it in over time). Empty
// strings are coerced to undefined so blank inputs clear rather than store "".
const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);
const optionalUrl = z.preprocess(emptyToUndef, z.url("Enter a valid URL").optional());
const optionalText = (max: number) =>
  z.preprocess(emptyToUndef, z.string().trim().max(max).optional());
const optionalPositive = z.preprocess(
  emptyToUndef,
  z.coerce.number().min(0, "Must be zero or more").optional()
);

const profileSchema = z
  .object({
    name: z.preprocess(
      emptyToUndef,
      z.string().trim().min(2, "Name must be at least 2 characters").optional()
    ),
    phone: optionalText(30),
    nid: optionalText(30),
    avatarUrl: optionalUrl,
    company: optionalText(120),
    bio: optionalText(500),
    landAreaKatha: optionalPositive,
    buildingType: z.preprocess(emptyToUndef, z.enum(BuildingType).optional()),
    budgetMinBdt: optionalPositive,
    budgetMaxBdt: optionalPositive,
    floors: optionalPositive,
  })
  .refine(
    (d) => d.budgetMinBdt == null || d.budgetMaxBdt == null || d.budgetMaxBdt >= d.budgetMinBdt,
    { message: "Maximum budget must be greater than the minimum", path: ["budgetMaxBdt"] }
  );

/** Strips the password hash and DB internals before a user goes over the wire. */
function toSessionUser(user: HydratedDocument<UserDoc>): SessionUser {
  // toObject converts the document (and the profile subdocument) to plain
  // objects — spreading the live subdoc would copy Mongoose internals, which
  // include a back-reference to the whole document, password hash and all.
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

function signToken(user: HydratedDocument<UserDoc>): string {
  // Payload matches AuthPayload in middleware/auth.ts: `sub` is the user id.
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.JWT_SECRET, {
    // Cast: jsonwebtoken's types want a "1h"/"7d"-style literal, env gives a plain string.
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/**
 * POST /api/auth/register — public signup, land owners only for now.
 * Professionals (architects, engineers, contractors, suppliers) will join
 * through the verification flow (roadmap step 3), so the role is fixed
 * server-side rather than trusted from the request body.
 */
export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }
  const { name, username, email, phone, password } = parsed.data;

  // Check email and username together so we can tell the user exactly which one
  // is taken (the schema already lowercased both).
  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    const message =
      existing.email === email
        ? "An account with this email already exists"
        : "That username is already taken";
    return res.status(409).json({ error: { message } });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    username,
    email,
    phone: phone || undefined, // don't store empty strings
    passwordHash,
    role: UserRole.LAND_OWNER,
  });

  return res.status(201).json({ data: { user: toSessionUser(user), token: signToken(user) } });
}

/**
 * POST /api/auth/register-professional — signup for architects, engineers,
 * contractors, and suppliers. Unlike land owners, they pick their role and
 * provide the credentials they'll later be verified on. The account starts
 * PENDING_VERIFICATION (the model default) — the verification review flow
 * (roadmap step 3) promotes it to APPROVED and grants the "Platform Verified"
 * badge. ADMIN is never self-assignable; the schema only allows the four
 * professional roles.
 */
export async function registerProfessional(req: Request, res: Response) {
  const parsed = registerProfessionalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }
  const { name, username, email, phone, password, role, ...profile } = parsed.data;

  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    const message =
      existing.email === email
        ? "An account with this email already exists"
        : "That username is already taken";
    return res.status(409).json({ error: { message } });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    username,
    email,
    phone: phone || undefined,
    passwordHash,
    role,
    // Drop undefined credential fields so we don't store an empty subdocument.
    profile: Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined)),
  });

  return res.status(201).json({ data: { user: toSessionUser(user), token: signToken(user) } });
}

/** POST /api/auth/login — verify credentials, issue a JWT. */
export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }
  const { identifier, password } = parsed.data;

  // Look up by email or username. Both are stored lowercase, so lowercasing the
  // input makes the match case-insensitive either way.
  const login = identifier.toLowerCase();
  // Same message whether the identifier or the password is wrong, so the
  // endpoint can't be used to probe which emails/usernames have accounts.
  const user = await User.findOne({ $or: [{ email: login }, { username: login }] });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: { message: "Invalid credentials" } });
  }

  return res.json({ data: { user: toSessionUser(user), token: signToken(user) } });
}

/** PATCH /api/auth/profile — update the logged-in user's account + profile details. */
export async function updateProfile(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }

  const user = await User.findById(req.auth.sub);
  if (!user) {
    return res.status(401).json({ error: { message: "Account no longer exists" } });
  }

  const { name, phone, ...profile } = parsed.data;
  if (name !== undefined) user.name = name;
  // The form always submits every field, so a blank input (parsed to
  // undefined) means "clear this value" — phone and the whole profile
  // subdocument are replaced rather than merged.
  user.phone = phone;
  user.profile = profile;
  await user.save();

  return res.json({ data: { user: toSessionUser(user) } });
}

/** GET /api/auth/me — load the logged-in user from the verified token. */
export async function me(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  const user = await User.findById(req.auth.sub);
  if (!user) {
    return res.status(401).json({ error: { message: "Account no longer exists" } });
  }
  return res.json({ data: { user: toSessionUser(user) } });
}
