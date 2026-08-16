/**
 * Creates (or updates) the key-management account from .env values:
 *
 *   SUPER_ADMIN_EMAIL=keys@example.com
 *   SUPER_ADMIN_PASSWORD=...
 *   SUPER_ADMIN_NAME / SUPER_ADMIN_USERNAME optional
 *
 * This is the **only** way the SUPER_ADMIN role is ever granted. It is not
 * self-assignable at signup and the admin console refuses to set it, so holding
 * it requires access to the server's environment rather than to a session —
 * which is the whole point: an attacker who takes over an admin login still
 * cannot reach the encryption keys.
 *
 * The account can do exactly one thing: rotate keys, via /api/keys/*. It has no
 * admin console, no user list, no verification queue. Keep it separate from the
 * supervisor account created by `pnpm seed:admin`.
 *
 * Run from apps/api: `pnpm seed:superadmin`. Safe to re-run — it upserts, so
 * changing SUPER_ADMIN_PASSWORD and re-running rotates the password.
 */
import mongoose from "mongoose";
import { UserRole, VerificationStatus } from "@buildora/shared";
import { env } from "../config/env";
import { connectDb } from "../db/mongoose";
import { User } from "../models/User";
import { hashPassword } from "../services/password";

async function main() {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) {
    console.error("[seed] Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in apps/api/.env first.");
    process.exit(1);
  }
  if (env.SUPER_ADMIN_PASSWORD.length < 12) {
    // Longer than the 8 required elsewhere: this account holds the keys to
    // every encrypted record on the platform.
    console.error("[seed] SUPER_ADMIN_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }

  if (!(await connectDb())) {
    console.error("[seed] MONGODB_URI is not set, can't seed without a database.");
    process.exit(1);
  }

  const email = env.SUPER_ADMIN_EMAIL.toLowerCase();
  const username = env.SUPER_ADMIN_USERNAME.toLowerCase();
  const passwordHash = await hashPassword(env.SUPER_ADMIN_PASSWORD);

  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing && existing.role !== UserRole.SUPER_ADMIN) {
    console.error(
      `[seed] ${existing.email === email ? email : username} already belongs to a ${existing.role} ` +
        "account. Pick a different SUPER_ADMIN_EMAIL/SUPER_ADMIN_USERNAME — this script will not " +
        "promote an existing account, because that is exactly the escalation the role guards against."
    );
    process.exit(1);
  }

  if (existing) {
    existing.name = env.SUPER_ADMIN_NAME;
    existing.email = email;
    existing.passwordHash = passwordHash;
    await existing.save();
    console.log(`[seed] Updated super admin ${email}`);
  } else {
    await User.create({
      name: env.SUPER_ADMIN_NAME,
      username,
      email,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      // Nothing to verify: this is an operator account, not a platform actor.
      verificationStatus: VerificationStatus.APPROVED,
    });
    console.log(`[seed] Created super admin ${email} (username: ${username})`);
  }

  console.log("[seed] This account can reach /api/keys/* and nothing else.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[seed] Failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
