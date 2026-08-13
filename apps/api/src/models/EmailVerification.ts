import { Schema, model, Types } from "mongoose";

/**
 * One outstanding "confirm your email address" link.
 *
 * Kept in its own collection rather than as fields on the user for two
 * reasons: a token is short-lived where a user is not, and MongoDB can expire
 * these on its own (see the TTL index below) so nothing has to sweep up after
 * an unclicked link.
 *
 * The raw token never touches the database. What goes in the email is 32 random
 * bytes; what we store is their SHA-256 hash, so a leaked database dump can't
 * be used to confirm anybody's address — the same reasoning as a password hash.
 */
export interface EmailVerificationDoc {
  user: Types.ObjectId;
  /** SHA-256 of the token that went out in the link, hex-encoded. */
  tokenHash: string;
  /**
   * The address this link was sent to. Checked again on use, so a link stays
   * tied to the address it proved — change your email and the old link dies.
   */
  email: string;
  expiresAt: Date;
  createdAt: Date;
}

const emailVerificationSchema = new Schema<EmailVerificationDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    // `expires: 0` makes this a TTL index: MongoDB deletes the document once
    // the clock passes the stored date, so expired links clean themselves up.
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const EmailVerification = model<EmailVerificationDoc>(
  "EmailVerification",
  emailVerificationSchema
);
