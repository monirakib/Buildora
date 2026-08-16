import { randomBytes } from "node:crypto";
import type { HydratedDocument } from "mongoose";
import { NotificationType } from "@buildora/shared";
import { env } from "../config/env";
import { EmailVerification } from "../models/EmailVerification";
import { Notification } from "../models/Notification";
import { User, type UserDoc } from "../models/User";
import { sha256Hex } from "../utils/hash";
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

/**
 * How long before the same account can ask for another link — and it grows.
 *
 * A flat cooldown treats the second request like the tenth, but they mean
 * different things. Asking twice is normal: mail is slow, spam folders exist.
 * Asking ten times means the link isn't arriving, and sending ten more won't
 * change that — it just burns a daily send quota that other people's escrow
 * notices need, and hammers an inbox that may not even belong to the person
 * clicking. So each send pushes the next one further out.
 *
 * The ladder is indexed by how many have already gone out, and the last entry
 * is the ceiling: 1 min, 2, 5, 15, 30, then an hour from there on.
 */
const RESEND_LADDER_MS = [60_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000];

/** The wait owed after `sends` links have already gone out. */
function cooldownAfter(sends: number): number {
  return RESEND_LADDER_MS[Math.min(sends - 1, RESEND_LADDER_MS.length - 1)]!;
}

/** The bell entry that nags an unverified account, deduped on this exact title. */
const NUDGE_TITLE = "Confirm your email address";

/**
 * The stored form of a token. Never store the token itself.
 *
 * Now shared with the refresh-token service, which follows the same rule — see
 * utils/hash.ts for why an unsalted SHA-256 is the right choice for a value the
 * server generated at random.
 */
const hash = sha256Hex;

export interface IssueResult {
  sent: boolean;
  /** Set when nothing was sent, so the caller can say why. */
  reason?: "already-verified" | "cooldown" | "not-configured" | "send-failed";
  /** On "cooldown", how long is still owed — so the caller can say when. */
  retryAfterMs?: number;
  /**
   * On a successful send, how long before another one is allowed. Handed back
   * so the button can count down from the real figure rather than assume the
   * first rung of the ladder and be corrected by a rejection.
   */
  nextRetryAfterMs?: number;
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
    .select("createdAt sends")
    .lean();

  const sentSoFar = latest?.sends ?? 0;
  if (latest) {
    const owed = cooldownAfter(sentSoFar) - (Date.now() - latest.createdAt.getTime());
    if (owed > 0) return { sent: false, reason: "cooldown", retryAfterMs: owed };
  }

  const token = randomBytes(32).toString("hex");
  await EmailVerification.deleteMany({ user: user._id });
  await EmailVerification.create({
    user: user._id,
    tokenHash: hash(token),
    email: user.email,
    // Deleting the old row loses its count, so carry it across by hand — this
    // is what makes the next wait longer than this one.
    sends: sentSoFar + 1,
    expiresAt: new Date(Date.now() + LINK_TTL_HOURS * 60 * 60 * 1000),
  });

  try {
    await sendEmailOrThrow({
      to: user.email,
      toName: user.name,
      subject: "Confirm your email to activate the platform",
      accent: "activate",
      text: `Welcome to Buildora, the construction super-platform. Confirming your address unlocks your workspace and lets us reach you the moment a job needs a call: a decision to sign, a payment to release, a site walk to schedule.\n\nIf you didn't create a Buildora account, ignore this email and nothing will happen.`,
      // Absolute on purpose: this link is followed from a mailbox, where the
      // API's own address means nothing.
      link: `${env.WEB_BASE_URL}/verify-email?token=${token}`,
      linkLabel: "Verify my email",
      meta: `Link expires in ${LINK_TTL_HOURS} hours · Single use`,
      category: NotificationType.VERIFICATION,
      // The one mail where "here is what the platform does" earns its space:
      // it is the first thing most people ever see from us.
      highlights: [
        { title: "Projects", blurb: "Plans, permits and progress" },
        { title: "Payments", blurb: "Escrow and milestone releases" },
        { title: "Schedule", blurb: "Crews, meetings and site diary" },
      ],
    });
  } catch (err) {
    // Drop the token we just wrote — nobody received it, and leaving it there
    // would start the cooldown for a mail that never arrived.
    await EmailVerification.deleteMany({ user: user._id }).catch(() => null);
    console.error("[verify] couldn't send:", err instanceof Error ? err.message : err);
    return { sent: false, reason: "send-failed" };
  }

  return { sent: true, nextRetryAfterMs: cooldownAfter(sentSoFar + 1) };
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
      body: `We can't send anything to ${user.email} until you confirm it, open your account information and send yourself the link.`,
      link: "/account",
    });
  } catch {
    // A missing nudge must never break a login.
  }
}
