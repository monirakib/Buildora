/**
 * Creates (or updates) the platform supervisor account from .env values:
 *
 *   ADMIN_EMAIL=supervisor@example.com
 *   ADMIN_PASSWORD=change-me-please
 *   ADMIN_NAME / ADMIN_USERNAME optional (default "Platform Supervisor" / "supervisor")
 *
 * Run from apps/api: `pnpm seed:admin`. Safe to re-run — it upserts, so
 * changing ADMIN_PASSWORD and re-running rotates the password.
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { UserRole, VerificationStatus } from "@buildora/shared";
import { env } from "../config/env";
import { connectDb } from "../db/mongoose";
import { User } from "../models/User";

async function main() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.error("[seed] Set ADMIN_EMAIL and ADMIN_PASSWORD in apps/api/.env first.");
    process.exit(1);
  }
  if (env.ADMIN_PASSWORD.length < 8) {
    console.error("[seed] ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const connected = await connectDb();
  if (!connected) {
    console.error("[seed] MONGODB_URI is not set, can't seed without a database.");
    process.exit(1);
  }

  const email = env.ADMIN_EMAIL.toLowerCase();
  const username = env.ADMIN_USERNAME.toLowerCase();
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 10);

  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing && existing.role !== UserRole.ADMIN) {
    console.error(
      `[seed] ${existing.email === email ? email : username} belongs to a non-admin account, pick different ADMIN_EMAIL/ADMIN_USERNAME.`
    );
    process.exit(1);
  }

  if (existing) {
    existing.name = env.ADMIN_NAME;
    existing.email = email;
    existing.passwordHash = passwordHash;
    await existing.save();
    console.log(`[seed] Updated supervisor account ${email}`);
  } else {
    await User.create({
      name: env.ADMIN_NAME,
      username,
      email,
      passwordHash,
      role: UserRole.ADMIN,
      verificationStatus: VerificationStatus.APPROVED,
    });
    console.log(`[seed] Created supervisor account ${email} (username: ${username})`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
