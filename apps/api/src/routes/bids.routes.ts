import { Router } from "express";
import { awardBid, listMyBids, shortlistBid, withdrawBid } from "../controllers/bids.controller";
import { requireAuth } from "../middleware/auth";
import { requireVerified } from "../middleware/verified";

export const bidsRouter = Router();

bidsRouter.use(requireAuth);

// `/mine` before `/:id` so the literal path isn't taken for an id.
//
// Withdrawing is deliberately left open: a contractor whose verification lapses
// or is rejected must still be able to take their own bid off the table.
// Shortlisting and awarding are the owner's, and awarding creates the build
// contract — the point at which real money starts moving.
bidsRouter.get("/mine", listMyBids);
bidsRouter.post("/:id/withdraw", withdrawBid);
bidsRouter.post("/:id/shortlist", requireVerified, shortlistBid);
bidsRouter.post("/:id/award", requireVerified, awardBid);
