import { createHash, randomBytes } from "node:crypto";
import type { HydratedDocument } from "mongoose";
import { NotificationType } from "@buildora/shared";
import { env } from "../config/env";
import { EmailVerification } from "../models/EmailVerification";
import { Notification } from "../models/Notification";
import { User, type UserDoc } from "../models/User";
import { isEmailConfigured, sendEmailOrThrow } from "./email";
import { notify } from "./notifications";

/**
 * Proving that an email address exists and belongs to the person who typed it.
 *
 * Signup accepts any address, so until it's confirmed we know nothing: it could
 * be a typo, or somebody else's. That matters here more than on most sites,
 * because Buildora mails decisions about money — an escrow release or a
 * verification verdict going to the wrong inbox is a real leak. So an
 * unconfirmed address gets no notification mail at all; the only thing we ever
 * send it is the link below.
 *
 * The mechanism is the standard one: mail a long random token, store only its
 * hash, and treat clicking the link as proof. Nothing here is clever — the
 * value is in what it refuses to do.
 */

/** How long a link stays good. Long enough to survive a night's sleep. */
export const LINK_TTL_HOURS = 24;

/** How long before the same account can ask for another one. */
const RESEND_COOLDOWN_MS = 60_000;

/** The bell entry that nags an unverified account, deduped on this exact title. */
const NUDGE_TITLE = "Confirm your email address";

/** The stored form of a token. Never store the token itself. */
function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssueResult {
  sent: boolean;
  /** Set when nothing was sent, so the caller can say why. */
  reason?: "already-verified" | "cooldown" | "not-configured" | "send-failed";
}

/**
 * Mails a fresh confirmation link.
 *
 * Any previous link for this account is deleted first: two live links would
 * mean an old one still works after an email change, and there's no reason to
 * keep more than the newest.
 */
export async function issueVerification(user: HydratedDocument<UserDoc>): Promise<IssueResult> {
  if (user.emailVerifiedAt) return { sent: false, reason: "already-verified" };
  if (!isEmailConfigured()) return { sent: false, reason: "not-configured" };

  // Rate limit per account, not per IP: the point is to stop one account's
  // address being used to mail-bomb somebody, and an IP limit wouldn't.
  const latest = await EmailVerification.findOne({ user: user._id })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean();
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return { sent: false, reason: "cooldown" };
  }

  const token = randomBytes(32).toString("hex");
  await EmailVerification.deleteMany({ user: user._id });
  await EmailVerification.create({
    user: user._id,
    tokenHash: hash(token),
    email: user.email,
    expiresAt: new Date(Date.now() + LINK_TTL_HOURS * 60 * 60 * 1000),
  });

  try {
    await sendEmailOrThrow({
      to: user.email,
      toName: user.name,
      subject: "Confirm your email address",
      text: `Welcome to Buildora. Confirm this address and we'll be able to reach you when something on your projects needs you — a decision, a payment, a booked meeting.\n\nThe link is good for ${LINK_TTL_HOURS} hours. If you didn't create a Buildora account, ignore this email and nothing will happen.`,
      // Absolute on purpose: this link is followed from a mailbox, where the
      // API's own address means nothing.
      link: `${env.WEB_BASE_URL}/verify-email?token=${token}`,
      linkLabel: "Confirm my email",
      category: NotificationType.VERIFICATION,
    });
  } catch (err) {
    // Drop the token we just wrote — nobody received it, and leaving it there
    // would start the cooldown for a mail that never arrived.
    await EmailVerification.deleteMany({ user: user._id }).catch(() => null);
    console.error("[verify] couldn't send:", err instanceof Error ? err.message : err);
    return { sent: false, reason: "send-failed" };
  }

  return { sent: true };
}

export type ConsumeResult =
  | { ok: true; email: string; alreadyVerified: boolean }
  | { ok: false; reason: "invalid" | "expired" | "stale" };

/**
 * Turns a clicked link into a verified address.
 *
 * Deliberately no authentication: the token *is* the proof, and requiring a
 * login as well would strand anyone who opens the link on a phone they're not
 * signed in on.
 */
export async function consumeVerification(token: string): Promise<ConsumeResult> {
  const record = await EmailVerification.findOne({ tokenHash: hash(token) });
  if (!record) return { ok: false, reason: "invalid" };

  // Mongo's TTL sweep runs about once a minute, so an expired document can
  // still be here. Check the date rather than trusting it's gone.
  if (record.expiresAt.getTime() < Date.now()) {
    await record.deleteOne();
    return { ok: false, reason: "expired" };
  }

  const user = await User.findById(record.user);
  if (!user) {
    await record.deleteOne();
    return { ok: false, reason: "invalid" };
  }

  // The address changed after this link went out, so it no longer proves
  // anything about the address the account currently uses.
  if (user.email !== record.email) {
    await record.deleteOne();
    return { ok: false, reason: "stale" };
  }

  const alreadyVerified = Boolean(user.emailVerifiedAt);
  if (!alreadyVerified) {
    user.emailVerifiedAt = new Date();
    await user.save();
  }

  // One click, one use.
  await record.deleteOne();
  // The nag in the bell has served its purpose.
  await Notification.deleteMany({
    user: user._id,
    type: NotificationType.SYSTEM,
    title: NUDGE_TITLE,
  }).catch(() => null);

  return { ok: true, email: user.email, alreadyVerified };
}

/**
 * Puts a "confirm your email" entry in the bell, unless one is already sitting
 * there unread.
 *
 * Called on every login, because that's the moment we know the person is
 * actually here to see it — and accounts that predate this feature would
 * otherwise never learn they're unverified. The dedupe check is what keeps it
 * from stacking up one entry per login.
 */
export async function nudgeIfUnverified(user: HydratedDocument<UserDoc>): Promise<void> {
  try {
    if (user.emailVerifiedAt) return;

    const pending = await Notification.exists({
      user: user._id,
      type: NotificationType.SYSTEM,
      title: NUDGE_TITLE,
      readAt: null,
    });
    if (pending) return;

    await notify(user._id.toString(), {
      type: NotificationType.SYSTEM,
      title: NUDGE_TITLE,
      body: `We can't send anything to ${user.email} until you confirm it — open your account information and send yourself the link.`,
      link: "/account",
    });
  } catch {
    // A missing nudge must never break a login.
  }
}
