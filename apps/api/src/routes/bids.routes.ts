import { Router } from "express";
import { awardBid, listMyBids, shortlistBid, withdrawBid } from "../controllers/bids.controller";
import { requireAuth } from "../middleware/auth";

export const bidsRouter = Router();

bidsRouter.use(requireAuth);

// `/mine` before `/:id` so the literal path isn't taken for an id.
bidsRouter.get("/mine", listMyBids);
bidsRouter.post("/:id/withdraw", withdrawBid);
bidsRouter.post("/:id/shortlist", shortlistBid);
bidsRouter.post("/:id/award", awardBid);
