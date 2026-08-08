import { Types } from "mongoose";
import { Review } from "../models/Review";
import { User } from "../models/User";

/**
 * Recomputes an architect's rating summary from their reviews and writes it
 * onto the user document.
 *
 * The average is stored rather than calculated per request because the
 * directory sorts and filters by it — doing that against the Review collection
 * would mean an aggregation on every page load. The trade-off is that the two
 * can drift, so this recomputes from scratch (rather than nudging a running
 * total) and is called from every path that writes a review.
 */
export async function refreshRating(architectId: Types.ObjectId | string) {
  // aggregate() bypasses Mongoose casting, so the id has to be a real ObjectId
  // here — a string would silently match nothing and zero out the rating.
  const id = typeof architectId === "string" ? new Types.ObjectId(architectId) : architectId;

  const [summary] = await Review.aggregate<{ avg: number; count: number }>([
    { $match: { architect: id } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);

  await User.findByIdAndUpdate(id, {
    // One decimal is all the precision a star display can show.
    ratingAvg: summary ? Math.round(summary.avg * 10) / 10 : undefined,
    ratingCount: summary?.count ?? 0,
  });
}
