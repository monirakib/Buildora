import { Router } from "express";
import {
  bidSanityCheck,
  cancelTender,
  closeTender,
  getTender,
  listOpenTenders,
  publishTender,
  updateTender,
} from "../controllers/tenders.controller";
import { listTenderBids, submitBid } from "../controllers/bids.controller";
import { bidAnalysis } from "../controllers/bidAnalysis.controller";
import { requireAuth } from "../middleware/auth";
import { aiInlineLimit } from "../middleware/aiRateLimit";

export const tendersRouter = Router();

tendersRouter.use(requireAuth);

// The contractor's board. Must come before `/:id`.
tendersRouter.get("/", listOpenTenders);
tendersRouter.get("/:id", getTender);
tendersRouter.patch("/:id", updateTender);
tendersRouter.post("/:id/publish", publishTender);
tendersRouter.post("/:id/close", closeTender);
tendersRouter.post("/:id/cancel", cancelTender);

// Bids on one tender. The owner's read is refused while bidding is open —
// see assertReadable in bids.controller.ts.
tendersRouter.get("/:id/bids", listTenderBids);
tendersRouter.post("/:id/bids", submitBid);

// The two sides of reading a bid, deliberately asymmetric:
// - the contractor's own check answers in bands, never absolute benchmarks;
// - the owner's analysis carries real figures including their guide rates.
// Each is gated to its own side. See the controllers for why.
tendersRouter.post("/:id/bid-check", aiInlineLimit, bidSanityCheck);
tendersRouter.post("/:id/bid-analysis", aiInlineLimit, bidAnalysis);
