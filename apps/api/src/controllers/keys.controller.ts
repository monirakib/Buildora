import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { env } from "../config/env";
import { KeyRotationRun } from "../models/KeyRotationRun";
import {
  driveRotation,
  outstandingCount,
  startRotation,
  verifyRotation,
} from "../services/rotation";
import { safeIssues } from "../utils/validation";

/**
 * Key management, restricted to ADMIN (see routes/keys.routes.ts).
 *
 * The whole surface is four endpoints and none of them read user data: it can
 * move records between keys and see counts, but has no route that returns
 * anyone's NID, email or payment details.
 */

const startSchema = z.object({
  scope: z.enum(["USER_PII", "LEDGER_HMAC"], {
    message: "Choose USER_PII or LEDGER_HMAC",
  }),
});

/**
 * GET /api/keys/status — which keys exist, which is active, and how much is
 * still on an old one.
 */
export async function keyStatus(_req: Request, res: Response) {
  const [pii, ledger] = await Promise.all([
    outstandingCount("USER_PII"),
    outstandingCount("LEDGER_HMAC"),
  ]);

  return res.json({
    data: {
      data: {
        versions: Object.keys(env.DATA_KEYS),
        active: env.DATA_KEY_ACTIVE,
        outstanding: pii,
      },
      ledger: {
        versions: Object.keys(env.LEDGER_KEYS),
        active: env.LEDGER_KEY_ACTIVE,
        outstanding: ledger,
      },
      // No count, because there is nothing stored to count. Access tokens are
      // signed, never persisted, and expire in minutes — so an old signing key
      // is safe to remove once that long has passed since it stopped being
      // active. There is no data pass to run.
      jwt: {
        retireAfterMinutes: env.ACCESS_TOKEN_TTL_MIN,
        note: "Access tokens are not stored. Remove a retired signing key once ACCESS_TOKEN_TTL_MIN has elapsed since it was last active.",
      },
      // Stated here because it is the one key that cannot be rotated online.
      blindIndex: {
        rotatable: false,
        note: "Rotating the blind-index key means recomputing every profile.nidKeyBlind from plaintext while the unique index must keep holding. Maintenance window only.",
      },
    },
  });
}

/** POST /api/keys/rotations — start converting everything to the active key. */
export async function createRotation(req: Request, res: Response) {
  const parsed = startSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: safeIssues(parsed.error.issues),
      },
    });
  }
  const { scope } = parsed.data;

  // One at a time. Two sweeps over the same collection would duplicate work and
  // interleave their cursors.
  const live = await KeyRotationRun.findOne({ scope, status: { $in: ["RUNNING", "PAUSED"] } });
  if (live) {
    return res.status(409).json({
      error: {
        code: "ROTATION_IN_PROGRESS",
        message: `A ${scope} rotation is already open (${live._id}). Resume or finish it first.`,
      },
    });
  }

  // Rotation always converts *to the active key*, because that is the only key
  // encryptField will write with. Flipping DATA_KEY_ACTIVE (or
  // LEDGER_KEY_ACTIVE) and redeploying is therefore step one, and this is step
  // two — refusing here rather than silently rewriting everything back to the
  // key it already had.
  const outstanding = await outstandingCount(scope);
  if (outstanding === 0) {
    return res.status(409).json({
      error: {
        code: "NOTHING_TO_ROTATE",
        message:
          "Every record is already on the active key. Add the new key to the keyring and make " +
          "it active (DATA_KEY_ACTIVE / LEDGER_KEY_ACTIVE) before starting a rotation.",
      },
    });
  }

  const run = await startRotation(scope, req.auth!.sub);
  return res.status(202).json({ data: { run: run.toObject(), outstanding } });
}

/** GET /api/keys/rotations/:id — progress. */
export async function getRotation(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: { message: "Rotation not found" } });
  }
  const run = await KeyRotationRun.findById(req.params.id);
  if (!run) return res.status(404).json({ error: { message: "Rotation not found" } });
  return res.json({ data: { run: run.toObject() } });
}

/** GET /api/keys/rotations — recent runs, newest first. */
export async function listRotations(_req: Request, res: Response) {
  const runs = await KeyRotationRun.find().sort({ createdAt: -1 }).limit(20);
  return res.json({ data: { runs: runs.map((r) => r.toObject()) } });
}

/**
 * POST /api/keys/rotations/:id/resume — pick a paused run back up.
 *
 * Needed because the process restarts: a free-tier instance sleeping or being
 * redeployed mid-sweep leaves a run RUNNING in the database with nothing
 * driving it. This restarts the loop from the stored cursor.
 */
export async function resumeRotation(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: { message: "Rotation not found" } });
  }
  const run = await KeyRotationRun.findById(req.params.id);
  if (!run) return res.status(404).json({ error: { message: "Rotation not found" } });
  if (run.status === "VERIFIED" || run.status === "COMPLETED") {
    return res.status(409).json({ error: { message: `This run is already ${run.status}` } });
  }

  run.status = "RUNNING";
  await run.save();
  void driveRotation(run._id.toString());
  return res.status(202).json({ data: { run: run.toObject() } });
}

/**
 * POST /api/keys/rotations/:id/verify — prove nothing is left on an old key.
 *
 * This is the gate before retiring a key. It does not delete anything and could
 * not: the keyring is an environment variable and the API cannot write its own
 * environment. Removing the old key is a deliberate human step, and VERIFIED is
 * the evidence that it is safe to take.
 */
export async function verifyRotationRun(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: { message: "Rotation not found" } });
  }
  const run = await verifyRotation(String(req.params.id));
  if (!run) return res.status(404).json({ error: { message: "Rotation not found" } });

  return res.json({
    data: {
      run: run.toObject(),
      safeToRetireOldKey: run.status === "VERIFIED",
    },
  });
}
