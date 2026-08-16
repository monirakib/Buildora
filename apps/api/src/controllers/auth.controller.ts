import type { Request, Response } from "express";
import { z } from "zod";
import { Types, type HydratedDocument } from "mongoose";
import {
  PaymentMethod,
  UserRole,
  VerificationStatus,
  nidKeyFor,
  normalizeMembershipNo,
  normalizeNid,
  type AccountSession,
  type NidCheck,
  type SessionUser,
  type UserProfile,
} from "@buildora/shared";
import { env } from "../config/env";
import { publicJwks, signAccessToken } from "../services/jwt";
import { User, type UserDoc } from "../models/User";
import { Session, liveSessionFilter, sessionExpiry } from "../models/Session";
import { mintRefreshToken, parseRefreshToken } from "../services/refreshToken";
import { REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie } from "../utils/cookies";
import {
  LINK_TTL_HOURS,
  consumeVerification,
  issueVerification,
  nudgeIfUnverified,
} from "../services/emailVerification";
import { lookupIabMember } from "../services/iab";
import { hashPassword, spendVerifyTime, verifyPassword } from "../services/password";
import {
  nidLookupKey,
  openBilling,
  openProfile,
  sealBilling,
  sealProfile,
} from "../services/profileCrypto";
import { safeIssues } from "../utils/validation";

/**
 * Profile saves replace the whole subdocument, which would throw away the NID
 * pre-screen every time someone edits their bio. This carries it across — but
 * only while it still describes the number now on the profile. Change the NID
 * and the old result is meaningless, so it goes.
 *
 * Exported because the professional profile update needs the identical rule.
 */
export function keepNidCheck<T extends { nid?: string; nidCheck?: NidCheck }>(
  previous: UserProfile | undefined,
  next: T
): T {
  // The blind index is no longer computed here — sealProfile derives it from
  // `nid` on the way to the database, so there is exactly one place that can
  // put the lookup key out of step with the number it guards.
  const check = previous?.nidCheck;
  if (check && next.nid && normalizeNid(check.nid) === normalizeNid(next.nid)) {
    return { ...next, nidCheck: check };
  }

  // Drop a non-matching record explicitly rather than relying on the caller not
  // to supply one: updateAccount builds `next` by spreading the existing
  // profile, so a stale check would otherwise ride along attached to a number
  // nobody ever screened.
  const out = { ...next };
  delete out.nidCheck;
  return out;
}

/**
 * Refuses a profile save that would put a second account on one NID, or that
 * would change the NID an approved badge was granted against.
 *
 * Returns an error payload to send, or undefined when the save may proceed.
 * The unique index is the real enforcement — this exists so the person doing
 * it gets an explanation instead of a driver error.
 */
export async function checkNidChange(
  userId: string,
  currentStatus: VerificationStatus,
  previousNid: string | undefined,
  nextNid: string | undefined
): Promise<{ status: number; code: string; message: string } | undefined> {
  // Compared through the blind index, since the stored numbers are ciphertext
  // and no two copies of one NID look alike.
  const lookupKey = nidLookupKey(nextNid);
  const changed = normalizeNid(previousNid ?? "") !== normalizeNid(nextNid ?? "");

  // A verified account's NID is the identity the badge was granted to. Letting
  // it be edited afterwards would leave the badge attached to a person nobody
  // ever checked — so the change goes through a supervisor, not a form.
  if (changed && currentStatus === VerificationStatus.APPROVED) {
    return {
      status: 409,
      code: "NID_LOCKED",
      message:
        "Your NID is locked because your account is verified. Contact a supervisor to change it.",
    };
  }

  if (!lookupKey || !changed) return undefined;

  const taken = await User.exists({ _id: { $ne: userId }, "profile.nidKeyBlind": lookupKey });
  if (taken) {
    return {
      status: 409,
      code: "NID_ALREADY_REGISTERED",
      message:
        "Another Buildora account is already registered with this NID. An NID can only be " +
        "used once — check the number you entered.",
    };
  }

  return undefined;
}

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
  // Filled in from the IAB directory by the signup form when the number checks
  // out. Still just claims until a supervisor confirms them — the authoritative
  // copy is the `iabCheck` the server records below.
  membershipStatus: z.string().trim().max(30).optional(),
  membershipCategory: z.string().trim().max(30).optional(),
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
  // Land owners now supply the same identity evidence as professionals, so the
  // NID pre-screen has a card to read and a birth date to compare against.
  nidFrontUrl: optionalUrl,
  nidBackUrl: optionalUrl,
  dateOfBirth: optionalText(10),
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
    // A date on the server, a plain yes/no in the UI — nothing on screen cares
    // when it happened, only whether it did.
    emailVerified: Boolean(plain.emailVerifiedAt),
    recoveryEmail: plain.recoveryEmail,
    phone: plain.phone,
    altPhone: plain.altPhone,
    role: plain.role,
    verificationStatus: plain.verificationStatus,
    // Decrypted on the way out, so the API's shape is exactly what it was
    // before encryption existed — the browser still receives `profile.nid` as a
    // plain string and neither the web app nor packages/shared changes.
    profile: openProfile(plain.profile, user._id.toString()),
    billing: openBilling(plain.billing, user._id.toString()),
  };
}

/** Seconds an access token is valid for — sent to the client so it can plan. */
const ACCESS_TTL_SECONDS = env.ACCESS_TOKEN_TTL_MIN * 60;

/** Mints an Ed25519-signed access token for a live session. */
function mintAccess(userId: string, role: UserRole, sessionId: string): Promise<string> {
  return signAccessToken({ sub: userId, role, sid: sessionId }, ACCESS_TTL_SECONDS);
}

/**
 * Starts a login: one Session document, one short-lived access token, and one
 * refresh token set as an httpOnly cookie.
 *
 * The split is the whole design. The access token is a JWT the browser holds in
 * memory and sends on every call; it expires in minutes, so a copy stolen
 * through an XSS bug is worth almost nothing. The refresh token is opaque,
 * lives only in a cookie JavaScript cannot read, and is checked against the
 * database every time it is used — which is what makes a login revocable at
 * all. Neither half is useful without the other.
 */
async function startSession(
  user: HydratedDocument<UserDoc>,
  req: Request,
  res: Response
): Promise<{ token: string; expiresIn: number }> {
  const now = new Date();
  const session = await Session.create({
    user: user._id,
    userAgent: req.headers["user-agent"],
    ip: req.ip,
    ipFirst: req.ip,
    expiresAt: sessionExpiry(now),
  });

  const refresh = mintRefreshToken(session._id.toString());
  session.refreshTokenHash = refresh.secretHash;
  session.refreshKeyVersion = refresh.keyVersion;
  await session.save();
  setRefreshCookie(res, refresh.token);

  return {
    token: await mintAccess(user._id.toString(), user.role, session._id.toString()),
    expiresIn: ACCESS_TTL_SECONDS,
  };
}

/**
 * How long after a refresh the token it replaced is still accepted.
 *
 * Without this, rotation breaks the ordinary case of two open tabs: both notice
 * their access token expired at the same moment, both send the same refresh
 * token, one wins, and the loser's perfectly legitimate request looks exactly
 * like a stolen token being replayed. Ten seconds is far longer than that race
 * and far shorter than any useful attack window — a thief redeeming a token
 * days later still trips the reuse check below.
 */
const ROTATION_GRACE_MS = 10_000;

/**
 * POST /api/auth/refresh — trade the refresh cookie for a new access token.
 *
 * Every successful refresh replaces the refresh token as well. That is what
 * turns a stolen cookie from a week-long credential into a detectable event:
 * once the real browser refreshes, the thief's copy is a token that has already
 * been used, and presenting it says something has gone wrong. When that
 * happens the session is revoked outright, which signs out both of them — the
 * legitimate user recovers with their password, the thief cannot.
 *
 * Only this session is revoked, not every login on the account. The evidence is
 * that one token leaked; taking down someone's other devices on top of it
 * punishes the victim for being attacked, and the attacker gains nothing from
 * those sessions surviving.
 */
export async function refresh(req: Request, res: Response) {
  const cookie = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!cookie) {
    return res.status(401).json({ error: { message: "Not signed in" } });
  }

  // Shape and signature first — a token that was never ours is rejected here
  // without a database round trip.
  const parsed = parseRefreshToken(cookie);
  if (!parsed) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: { message: "Not signed in" } });
  }

  const now = new Date();
  // Claim the rotation atomically: the filter includes the hash we expect to
  // replace, so if two requests arrive together only one can match and the
  // other falls through to the reuse path below. Doing this as a read followed
  // by a write would let both succeed and hand out two live tokens.
  const next = mintRefreshToken(parsed.sessionId);
  const session = await Session.findOneAndUpdate(
    {
      _id: parsed.sessionId,
      refreshTokenHash: parsed.secretHash,
      ...liveSessionFilter(now),
    },
    {
      $set: {
        refreshTokenHash: next.secretHash,
        refreshKeyVersion: next.keyVersion,
        previousTokenHash: parsed.secretHash,
        rotatedAt: now,
        lastSeenAt: now,
      },
    },
    { returnDocument: "after" }
  ).catch(() => null);

  if (!session) {
    // Nothing matched. Either this token was already rotated away — which is
    // either the two-tab race or a replay — or the session is gone.
    const replayed = await Session.findOne({
      _id: parsed.sessionId,
      previousTokenHash: parsed.secretHash,
    }).catch(() => null);

    if (
      replayed &&
      replayed.rotatedAt &&
      now.getTime() - replayed.rotatedAt.getTime() > ROTATION_GRACE_MS
    ) {
      await Session.updateOne({ _id: replayed._id }, { $set: { revokedAt: now } }).catch(
        () => null
      );
      console.warn(`[auth] refresh token reuse on session ${replayed._id} — session revoked`);
      clearRefreshCookie(res);
      return res.status(401).json({
        error: { message: "This login was ended for security. Please sign in again." },
      });
    }

    if (replayed) {
      // Inside the grace window: the other tab just rotated. Hand back an
      // access token and leave the refresh cookie completely alone.
      //
      // Rotating again here is what makes two tabs unsurvivable rather than
      // merely racy. A session has one current token hash, and the tab that won
      // is already holding it; minting a third would overwrite that hash while
      // previousTokenHash still points at the token being graced, so the
      // winner's cookie would match neither and its next refresh would be read
      // as a dead session. The tabs share one cookie jar, so the winner's
      // Set-Cookie has already delivered a valid token to this browser — there
      // is nothing for this response to add, and anything it sets can only
      // land out of order and clobber it.
      await Session.updateOne({ _id: replayed._id }, { $set: { lastSeenAt: now } }).catch(
        () => null
      );
      const user = await User.findById(replayed.user);
      if (!user) {
        clearRefreshCookie(res);
        return res.status(401).json({ error: { message: "Account no longer exists" } });
      }
      return res.json({
        data: {
          user: toSessionUser(user),
          token: await mintAccess(String(user._id), user.role, String(replayed._id)),
          expiresIn: ACCESS_TTL_SECONDS,
        },
      });
    }

    clearRefreshCookie(res);
    return res.status(401).json({ error: { message: "Session expired, please sign in again" } });
  }

  // A refresh is the one moment a device binding can be re-checked without a
  // live access token to go on.
  if (session.userAgent && req.headers["user-agent"] !== session.userAgent) {
    await Session.updateOne({ _id: session._id }, { $set: { revokedAt: now } }).catch(() => null);
    clearRefreshCookie(res);
    return res.status(401).json({
      error: { message: "This login was ended because it was used from a different device" },
    });
  }

  const user = await User.findById(session.user);
  if (!user) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: { message: "Account no longer exists" } });
  }

  setRefreshCookie(res, next.token);
  // The user comes back too, so an open tab picks up a role change or a new
  // verification badge without a separate poll.
  return res.json({
    data: {
      user: toSessionUser(user),
      token: await mintAccess(String(user._id), user.role, String(session._id)),
      expiresIn: ACCESS_TTL_SECONDS,
    },
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
        details: safeIssues(parsed.error.issues),
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

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    name,
    username,
    email,
    phone: phone || undefined, // don't store empty strings
    passwordHash,
    role: UserRole.LAND_OWNER,
  });

  // Fire-and-forget: an SMTP round trip must not sit between someone pressing
  // "Create account" and being let in. If it fails they can resend it from
  // their account page, which is where the reminder points them anyway.
  void issueVerification(user);

  const { token, expiresIn } = await startSession(user, req, res);
  return res.status(201).json({ data: { user: toSessionUser(user), token, expiresIn } });
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
        details: safeIssues(parsed.error.issues),
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

  const passwordHash = await hashPassword(password);
  // Drop undefined credential fields so we don't store an empty subdocument.
  const credentials: Record<string, unknown> = Object.fromEntries(
    Object.entries(profile).filter(([, v]) => v !== undefined)
  );

  // Architects who gave a membership number get it checked against the IAB
  // directory at signup, so the record is on the account from day one rather
  // than only appearing when they submit for verification. Nothing here blocks
  // registration — a failed or missing check is the supervisor's to weigh.
  let recoveryEmail: string | undefined;
  if (role === UserRole.ARCHITECT && typeof credentials.licenseNumber === "string") {
    const membershipNo = normalizeMembershipNo(credentials.licenseNumber);
    if (membershipNo) {
      try {
        const check = await lookupIabMember(membershipNo, name);
        credentials.iabCheck = check;

        // The form offers IAB's address as the account email, but they're free
        // to sign up under a different one. When they do, IAB's is kept as the
        // secondary contact rather than thrown away — it's the address the
        // institute will actually write to.
        const iabEmail = check.member?.email;
        if (iabEmail && iabEmail !== email.trim().toLowerCase()) recoveryEmail = iabEmail;
      } catch (err) {
        console.error("[iab] lookup failed during signup:", err);
      }
    }
  }

  const user = await User.create({
    name,
    username,
    email,
    phone: phone || undefined,
    recoveryEmail,
    passwordHash,
    role,
    profile: credentials,
  });

  void issueVerification(user);

  const { token, expiresIn } = await startSession(user, req, res);
  return res.status(201).json({ data: { user: toSessionUser(user), token, expiresIn } });
}

/** POST /api/auth/login — verify credentials, issue a JWT. */
export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: safeIssues(parsed.error.issues),
      },
    });
  }
  const { identifier, password } = parsed.data;

  // Look up by email or username. Both are stored lowercase, so lowercasing the
  // input makes the match case-insensitive either way.
  const login = identifier.toLowerCase();
  // Same message whether the identifier or the password is wrong, so the
  // endpoint can't be used to probe which emails/usernames have accounts.
  // passwordHash is select:false on the model, so this is one of the three
  // queries in the app that has to ask for it explicitly.
  const user = await User.findOne({ $or: [{ email: login }, { username: login }] }).select(
    "+passwordHash"
  );
  if (!user) {
    // No such account — but still spend one verification's worth of time before
    // answering. Returning immediately here makes the "no such user" reply
    // measurably faster than "wrong password", which turns the login form into
    // a way to test whether an email is registered and makes the deliberately
    // identical message above pointless.
    await spendVerifyTime(password);
    return res.status(401).json({ error: { message: "Invalid credentials" } });
  }

  const { ok, needsRehash } = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    return res.status(401).json({ error: { message: "Invalid credentials" } });
  }

  // The stored hash is bcrypt (pre-argon2 account) or argon2id at a cost we've
  // since raised. A correct login is the only moment the plaintext exists to
  // rehash from, so the upgrade happens here — nobody is asked to reset
  // anything. Written with updateOne rather than user.save() so one old
  // document that no longer passes full-schema validation can't turn a valid
  // login into a 500.
  if (needsRehash) {
    const upgraded = await hashPassword(password);
    await User.updateOne({ _id: user._id }, { $set: { passwordHash: upgraded } });
  }

  // Signing in is the one moment we know they're here to read it, so this is
  // where an unconfirmed address gets its reminder in the bell. Awaited only
  // because it's a single indexed lookup on the common (verified) path.
  await nudgeIfUnverified(user);

  const { token, expiresIn } = await startSession(user, req, res);
  return res.json({ data: { user: toSessionUser(user), token, expiresIn } });
}

/**
 * POST /api/auth/logout — revoke the session this token belongs to. The JWT
 * stays syntactically valid until it expires, but requireAuth rejects it once
 * the session is revoked, so the logout takes effect server-side immediately.
 */
export async function logout(req: Request, res: Response) {
  // Clear the cookie whatever happens next. Someone pressing "log out" must end
  // up signed out even if their access token had already expired — leaving a
  // live refresh cookie in the browser after that would be the worst outcome.
  clearRefreshCookie(res);

  if (!req.auth) {
    return res.status(401).json({ error: { message: "Authentication required" } });
  }
  await Session.updateOne(
    { _id: req.auth.sid, user: req.auth.sub },
    { $set: { revokedAt: new Date() } }
  );
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
        details: safeIssues(parsed.error.issues),
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
  user.profile = keepNidCheck(user.profile, profile);
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
        details: safeIssues(parsed.error.issues),
      },
    });
  }

  const user = await User.findById(req.auth.sub);
  if (!user) {
    return res.status(401).json({ error: { message: "Account no longer exists" } });
  }

  const { name, phone, altPhone, recoveryEmail, avatarUrl, nid, company, bio, ...billing } =
    parsed.data;

  const userId = user._id.toString();
  // Decrypt what's on file first: the merge below and the NID rules both need
  // to compare plaintext against plaintext.
  const existingProfile = openProfile(user.toObject().profile, userId);

  // One NID per person, and a verified account's NID doesn't change on a form.
  const nidProblem = await checkNidChange(
    userId,
    user.verificationStatus,
    existingProfile?.nid,
    nid
  );
  if (nidProblem) {
    const { status, ...error } = nidProblem;
    return res.status(status).json({ error });
  }

  if (name !== undefined) user.name = name;
  // The form always submits every field, so a blank input (parsed to
  // undefined) means "clear this value".
  user.phone = phone;
  user.altPhone = altPhone;
  user.recoveryEmail = recoveryEmail;

  // Merge — see the note above about not clobbering professional credentials.
  // `existingProfile` came from toObject() above: spreading the live Mongoose
  // subdocument would copy its internals, including a back-reference to the
  // whole user document.
  const merged = keepNidCheck(existingProfile, {
    ...existingProfile,
    avatarUrl,
    nid,
    company,
    bio,
  });
  // Seal on the way back down. Everything above this line worked in plaintext;
  // nothing below it ever sees the NID.
  user.profile = sealProfile(merged, userId);
  user.billing = sealBilling(billing, userId);

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
        details: safeIssues(parsed.error.issues),
      },
    });
  }
  const { email, currentPassword } = parsed.data;

  const user = await User.findById(req.auth.sub).select("+passwordHash");
  if (!user) {
    return res.status(401).json({ error: { message: "Account no longer exists" } });
  }
  if (!(await verifyPassword(user.passwordHash, currentPassword)).ok) {
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
  // A new address is an unproved address, whatever the old one's standing was.
  // Until they click the fresh link, notification mail stops.
  user.emailVerifiedAt = undefined;
  await user.save();
  void issueVerification(user);
  return res.json({ data: { user: toSessionUser(user) } });
}

/**
 * POST /api/auth/verify-email/send — mails the caller a fresh confirmation link.
 *
 * Behind requireAuth, so the address is always the caller's own; nobody can
 * aim this at somebody else's inbox. The per-account cooldown lives in the
 * service, and the route adds an IP limit on top.
 */
export async function sendVerificationEmail(req: Request, res: Response) {
  const user = await User.findById(req.auth!.sub);
  if (!user) {
    return res.status(401).json({ error: { message: "Account no longer exists" } });
  }

  const result = await issueVerification(user);
  if (result.sent) {
    return res.json({
      data: {
        sentTo: user.email,
        expiresInHours: LINK_TTL_HOURS,
        // How long until another is allowed. Each send pushes the next one
        // further out, so the button needs telling rather than guessing.
        nextRetryAfterSeconds: Math.ceil((result.nextRetryAfterMs ?? 0) / 1000),
      },
    });
  }

  // The cooldown grows with each send, so the refusal has to say how long this
  // one is rather than repeat a fixed "in a minute" that stops being true.
  if (result.reason === "cooldown") {
    const seconds = Math.ceil((result.retryAfterMs ?? 0) / 1000);
    // The standard header for this status. The browser client reads it to run
    // a countdown, and it means something to anything else that speaks HTTP.
    res.set("Retry-After", String(seconds));
    return res.status(429).json({
      error: {
        message: `A link already went out. Check your inbox, then try again in ${describeWait(seconds)}.`,
      },
    });
  }

  // Each remaining refusal gets its own status and words — "couldn't send"
  // would leave the person guessing which of three different things went wrong.
  const refusal = {
    "already-verified": [409, "That address is already confirmed"],
    "not-configured": [503, "Email isn't configured on this server yet"],
    "send-failed": [502, "The mail server wouldn't take it, try again shortly"],
  } as const;
  const [status, message] = refusal[result.reason ?? "send-failed"];
  return res.status(status).json({ error: { message } });
}

/** "45 seconds", "2 minutes" — the wait as a person would say it. */
function describeWait(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

const verifyEmailSchema = z.object({
  token: z.string().min(1, "That link is missing its token"),
});

/**
 * POST /api/auth/verify-email — confirms an address from a mailed link.
 *
 * Unauthenticated on purpose: the token is the proof, and links get opened on
 * whichever device is holding the mail, which often isn't the one that's
 * signed in.
 */
export async function verifyEmail(req: Request, res: Response) {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: parsed.error.issues[0]!.message } });
  }

  const result = await consumeVerification(parsed.data.token);
  if (result.ok) {
    return res.json({ data: { email: result.email, alreadyVerified: result.alreadyVerified } });
  }

  const refusal = {
    invalid: "This link isn't valid. It may have been used already.",
    expired: `This link has expired. They last ${LINK_TTL_HOURS} hours. Send yourself a new one from your account page.`,
    stale: "Your email address changed after this link was sent, so it no longer applies.",
  } as const;
  return res.status(400).json({ error: { message: refusal[result.reason] } });
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
        details: safeIssues(parsed.error.issues),
      },
    });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await User.findById(req.auth.sub).select("+passwordHash");
  if (!user) {
    return res.status(401).json({ error: { message: "Account no longer exists" } });
  }
  if (!(await verifyPassword(user.passwordHash, currentPassword)).ok) {
    return res.status(401).json({ error: { message: "That password is incorrect" } });
  }

  user.passwordHash = await hashPassword(newPassword);
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
        details: safeIssues(parsed.error.issues),
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

/**
 * GET /api/auth/jwks — the public keys access tokens are signed with.
 *
 * Public on purpose. Since the tokens are signed with Ed25519, verifying one
 * needs only the public half, and publishing it is what lets anything else
 * check a Buildora token without being able to mint one. It is also the
 * demonstrable proof that the signing is asymmetric: take a token from a login
 * response, take a key from here, and any JWT tool will verify the pair.
 */
export async function jwks(_req: Request, res: Response) {
  // Cacheable — the key set changes only when a key is rotated.
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.json(await publicJwks());
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
