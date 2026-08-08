import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import { ContractStatus, NotificationType, type Review as ReviewDto } from "@buildora/shared";
import { Contract } from "../models/Contract";
import { Review, type ReviewDoc } from "../models/Review";
import { User, type UserDoc } from "../models/User";
import { notify } from "../services/notifications";
import { refreshRating } from "../services/ratings";

// Populated on every query below, so the refs are real documents by then.
type PopulatedReview = Omit<HydratedDocument<ReviewDoc>, "author" | "project"> & {
  author: HydratedDocument<UserDoc>;
  project: { _id: unknown; title: string };
};

const withRefs = [
  { path: "author", select: "name profile.avatarUrl" },
  { path: "project", select: "title" },
];

function toReviewDto(doc: PopulatedReview): ReviewDto {
  return {
    id: doc._id.toString(),
    rating: doc.rating,
    comment: doc.comment,
    author: {
      id: doc.author._id.toString(),
      name: doc.author.name,
      avatarUrl: doc.author.profile?.avatarUrl,
    },
    project: { id: String(doc.project._id), title: doc.project.title },
    createdAt: doc.createdAt.toISOString(),
  };
}

const createReviewSchema = z.object({
  rating: z.coerce
    .number()
    .int("Give a whole number of stars")
    .min(1, "Give at least 1 star")
    .max(5, "5 stars is the most you can give"),
  comment: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().trim().max(1000, "Keep the review under 1000 characters").optional()
  ),
});

/**
 * POST /api/contracts/:id/review — the land owner rates the architect they
 * worked with.
 *
 * Gated on the contract being COMPLETED and owned by the caller, so a rating
 * always comes from someone who hired, paid and finished a project with that
 * architect. One review per contract (enforced again by a unique index on the
 * model); sending it twice updates the existing one rather than adding a
 * second, which is what lets someone soften or sharpen their score later.
 */
export async function createReview(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "Contract not found" } });
  }

  const parsed = createReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: parsed.error.issues[0]?.message ?? "Invalid input" },
    });
  }

  const contract = await Contract.findById(id);
  // Same 404 whether it doesn't exist or belongs to someone else — a land owner
  // shouldn't be able to probe for other people's contract ids.
  if (!contract || String(contract.client) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Contract not found" } });
  }
  if (contract.status !== ContractStatus.COMPLETED) {
    return res.status(409).json({
      error: {
        code: "CONTRACT_NOT_COMPLETED",
        message: "You can rate an architect once the project is completed.",
      },
    });
  }

  const existing = await Review.findOne({ contract: contract._id });
  if (existing) {
    existing.rating = parsed.data.rating;
    existing.comment = parsed.data.comment;
    await existing.save();
  } else {
    await Review.create({
      contract: contract._id,
      project: contract.project,
      architect: contract.architect,
      author: contract.client,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    });
  }

  await refreshRating(contract.architect);

  const saved = await Review.findOne({ contract: contract._id }).populate(withRefs);

  // Only tell the architect about a new review, not an edited one — nobody
  // wants a notification every time a client adjusts their wording.
  if (!existing) {
    notify(String(contract.architect), {
      type: NotificationType.CONTRACT,
      title: `You received a ${parsed.data.rating}-star review`,
      body: parsed.data.comment?.trim() || "Your client rated the completed project.",
      link: `/architects/${String(contract.architect)}`,
      actorId: req.auth!.sub,
    });
  }

  return res.status(existing ? 200 : 201).json({
    data: { review: toReviewDto(saved as unknown as PopulatedReview) },
  });
}

/**
 * GET /api/contracts/:id/review — the land owner's own review for a contract,
 * so the form can open pre-filled instead of writing a second one. `null` when
 * they haven't rated it yet.
 */
export async function getMyReview(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "Contract not found" } });
  }

  const contract = await Contract.findById(id).select("client");
  if (!contract || String(contract.client) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Contract not found" } });
  }

  const review = await Review.findOne({ contract: contract._id }).populate(withRefs);
  return res.json({
    data: { review: review ? toReviewDto(review as unknown as PopulatedReview) : null },
  });
}

/**
 * GET /api/professionals/:id/reviews — public. The reviews shown on an
 * architect's profile, newest first.
 */
export async function listArchitectReviews(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "Architect not found" } });
  }

  const docs = await Review.find({ architect: id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate(withRefs);

  return res.json({
    data: { reviews: docs.map((d) => toReviewDto(d as unknown as PopulatedReview)) },
  });
}
