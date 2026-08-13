import type { Request, Response } from "express";
import { z } from "zod";
import { estimateBuild } from "../services/estimator";
import { findProjectOr404 } from "./projects.controller";
import { FloorPlan } from "../models/FloorPlan";
import { floorAreaSqft } from "@buildora/shared";

/**
 * The cost estimator.
 *
 * Floor area is the one number everything scales from, so it is taken from the
 * project's saved floor plan when there is one and only asked for when there
 * isn't — a figure the owner has already drawn beats a figure they guess.
 */

const estimateSchema = z.object({
  /** Optional: falls back to the floor plan, then to a plot-based estimate. */
  areaSqft: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().positive().max(10_000_000).optional()
  ),
});

/** POST /api/projects/:id/estimate — priced from the DB, explained by Gemini. */
export async function estimateProject(req: Request, res: Response) {
  const project = await findProjectOr404(req.params.id!, res);
  if (!project) return;
  if (String(project.owner) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const parsed = estimateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Enter a valid floor area" } });
  }

  // Preference order: what they typed, what they drew, then the plot itself.
  let areaSqft = parsed.data.areaSqft;
  if (!areaSqft) {
    // Every drawn floor is its own document, so the building's area is the sum
    // across them — and floorAreaSqft is the same function the FAR check uses,
    // so the estimate and the permit tool can't disagree about the area.
    const plans = await FloorPlan.find({ project: project._id });
    const drawn = plans.reduce((sum, plan) => sum + floorAreaSqft(plan.rooms), 0);
    if (drawn > 0) areaSqft = Math.round(drawn);
  }
  if (!areaSqft) {
    // Last resort: 1 katha is 720 sqft, and a typical build covers about 60%
    // of the plot per floor. Rough, and labelled as such in the UI.
    areaSqft = Math.round(project.landAreaKatha * 720 * 0.6 * project.floors);
  }

  const estimate = await estimateBuild({
    areaSqft,
    floors: project.floors,
    buildingType: project.buildingType,
  });

  if (estimate.ratesFrom === 0) {
    return res.status(503).json({
      error: { message: "No BOQ rates are configured yet, run the build seed first" },
    });
  }

  return res.json({ data: { estimate } });
}
