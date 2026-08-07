import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Types, type HydratedDocument } from "mongoose";
import { PaymentMethod, UserRole, type AccountSession, type SessionUser } from "@buildora/shared";
import { env } from "../config/env";
import { User, type UserDoc } from "../models/User";
import { Session, liveSessionFilter } from "../models/Session";

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

const profileSchema = z.object({
  name: z.preprocess(
    emptyToUndef,
    z.string().trim().min(2, "Name must be at least 2 characters").optional()
  ),
  phone: optionalText(30),
  nid: optionalText(30),
  avatarUrl: optionalUrl,
  company: optionalText(120),
  bio: optionalText(500),
});

/**
 * Account settings — the personal, contact and billing details every role
 * shares. Deliberately separate from the role-specific `profile`: a land
 * owner's plot details belong to a Project, and a professional's credentials
 * are edited through the verification editor.
 */
const accountSchema = z.object({
  name: z.preprocess(
    emptyToUndef,
    z.string().trim().min(2, "Name must be at least 2 characters").optional()
  ),
  phone: optionalText(30),
  altPhone: optionalText(30),
  recoveryEmail: z.preprocess(emptyToUndef, z.email("Enter a valid email address").optional()),
  // Personal details that live on the shared profile subdocument.
  avatarUrl: optionalUrl,
  nid: optionalText(30),
  company: optionalText(120),
  bio: optionalText(500),
  // Billing
  billingName: optionalText(120),
  addressLine1: optionalText(160),
  addressLine2: optionalText(160),
  city: optionalText(80),
  postcode: optionalText(20),
  country: optionalText(80),
  preferredMethod: z.preprocess(emptyToUndef, z.enum(PaymentMethod).optional()),
  mobileWalletNumber: optionalText(30),
  bankAccountName: optionalText(120),
  bankAccountNumber: optionalText(40),
  bankName: optionalText(120),
  bankBranch: optionalText(120),
  tin: optionalText(30),
});

/** Changing the login email is a security-sensitive action, so require the password. */
const changeEmailSchema = z.object({
  email: z.email("Enter a valid email address"),
  currentPassword: z.string().min(1, "Enter your current password"),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New passwords don't match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
  });

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
    recoveryEmail: plain.recoveryEmail,
    phone: plain.phone,
    altPhone: plain.altPhone,
    role: plain.role,
    verificationStatus: plain.verificationStatus,
    profile: plain.profile,
    billing: plain.billing,
  };
}

/**
 * Records this login as a Session document and returns a JWT carrying both the
 * user id (`sub`) and the session id (`sid`). requireAuth later checks the
 * session is still alive, so logging out actually kills the token server-side.
 */
async function startSession(user: HydratedDocument<UserDoc>, req: Request): Promise<string> {
  const session = await Session.create({
    user: user._id,
    userAgent: req.headers["user-agent"],
  });
  // Payload matches AuthPayload in middleware/auth.ts.
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, sid: session._id.toString() },
    env.JWT_SECRET,
    {
      // Cast: jsonwebtoken's types want a "1h"/"7d"-style literal, env gives a plain string.
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    }
  );
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

  const token = await startSession(user, req);
  return res.status(201).json({ data: { user: toSessionUser(user), token } });
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

  const token = await startSession(user, req);
  return res.status(201).json({ data: { user: toSessionUser(user), token } });
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

  const token = await startSession(user, req);
  return res.json({ data: { user: toSessionUser(user), token } });
}

/**
 * POST /api/auth/logout — revoke the session this token belongs to. The JWT
 * stays syntactically valid until it expires, but requireAuth rejects it once
 * the session is revoked, so the logout takes effect server-side immediately.
 */
export async function logout(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  if (req.auth.sid) {
    await Session.updateOne(
      { _id: req.auth.sid, user: req.auth.sub },
      { $set: { revokedAt: new Date() } }
    );
  }
  return res.json({ data: { ok: true } });
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

/**
 * PATCH /api/auth/account — update the account settings every role shares:
 * personal details, extra contact points, and billing.
 *
 * Crucially this *merges* into `profile` rather than replacing it. An
 * architect's credentials (education, portfolio, licence…) live in the same
 * subdocument, and they are edited elsewhere — replacing wholesale here would
 * wipe them the first time a professional saved their billing address.
 */
export async function updateAccount(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  const parsed = accountSchema.safeParse(req.body);
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

  const { name, phone, altPhone, recoveryEmail, avatarUrl, nid, company, bio, ...billing } =
    parsed.data;

  if (name !== undefined) user.name = name;
  // The form always submits every field, so a blank input (parsed to
  // undefined) means "clear this value".
  user.phone = phone;
  user.altPhone = altPhone;
  user.recoveryEmail = recoveryEmail;

  // Merge — see the note above about not clobbering professional credentials.
  // `toObject()` first: spreading the live Mongoose subdocument would copy its
  // internals, including a back-reference to the whole user document.
  const existingProfile = user.toObject().profile;
  user.profile = { ...existingProfile, avatarUrl, nid, company, bio };
  user.billing = billing;

  await user.save();
  return res.json({ data: { user: toSessionUser(user) } });
}

/**
 * POST /api/auth/change-email — swap the login email.
 *
 * Requires the current password: the email is the login identifier, so
 * changing it on a session someone left open would otherwise hand over the
 * whole account.
 */
export async function changeEmail(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  const parsed = changeEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }
  const { email, currentPassword } = parsed.data;

  const user = await User.findById(req.auth.sub);
  if (!user) {
    return res.status(401).json({ error: { message: "Account no longer exists" } });
  }
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(401).json({ error: { message: "That password is incorrect" } });
  }

  const next = email.toLowerCase();
  if (next === user.email) {
    return res.status(400).json({ error: { message: "That's already your email address" } });
  }
  // Someone else may already own it — the unique index would throw a raw
  // duplicate-key error, so check first and return something readable.
  if (await User.exists({ email: next, _id: { $ne: user._id } })) {
    return res
      .status(409)
      .json({ error: { message: "An account with this email already exists" } });
  }

  user.email = next;
  await user.save();
  return res.json({ data: { user: toSessionUser(user) } });
}

/**
 * POST /api/auth/change-password — set a new password.
 *
 * Every *other* session is revoked afterwards: if the password is being
 * changed because it leaked, anyone already signed in elsewhere must be
 * kicked out. The caller's own session survives so they aren't logged out of
 * the tab they're using.
 */
export async function changePassword(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await User.findById(req.auth.sub);
  if (!user) {
    return res.status(401).json({ error: { message: "Account no longer exists" } });
  }
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(401).json({ error: { message: "That password is incorrect" } });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  await Session.updateMany(
    { user: user._id, _id: { $ne: req.auth.sid }, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );

  return res.json({ data: { ok: true } });
}

/**
 * GET /api/auth/sessions — the logged-in user's own live logins, newest use
 * first. `liveSessionFilter` is the same rule requireAuth enforces, so this
 * lists exactly the logins that would still be accepted — no separate notion of
 * "active" to drift out of sync.
 */
export async function listSessions(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  const rows = await Session.find({ user: req.auth.sub, ...liveSessionFilter() })
    .sort({ lastSeenAt: -1 })
    .lean();

  const sessions: AccountSession[] = rows.map((row) => ({
    id: row._id.toString(),
    userAgent: row.userAgent,
    lastSeenAt: row.lastSeenAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    current: row._id.toString() === req.auth?.sid,
  }));

  return res.json({ data: { sessions } });
}

const revokeSessionsSchema = z.object({
  ids: z.array(z.string()).min(1, "Choose at least one device to sign out"),
});

/**
 * POST /api/auth/sessions/revoke — end other logins, one or many at once.
 *
 * The `user` clause is what makes this safe: ids come from the client, so the
 * query is scoped to the caller's own sessions and a guessed id from someone
 * else's account simply matches nothing. The caller's own session is excluded
 * too — signing yourself out is what the Log out button is for.
 */
export async function revokeSessions(req: Request, res: Response) {
  if (!req.auth) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  const parsed = revokeSessionsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }

  // Mongoose casts the id strings for us, but a malformed one would throw
  // rather than simply not match — so drop anything that isn't an ObjectId.
  const ids = parsed.data.ids.filter((id) => Types.ObjectId.isValid(id) && id !== req.auth?.sid);
  if (ids.length === 0) {
    return res.status(400).json({ error: { message: "Nothing to sign out" } });
  }

  const result = await Session.updateMany(
    { _id: { $in: ids }, user: req.auth.sub, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );

  return res.json({ data: { revoked: result.modifiedCount } });
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
