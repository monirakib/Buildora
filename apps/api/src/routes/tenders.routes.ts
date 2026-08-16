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
import { requireVerified } from "../middleware/verified";
import { aiInlineLimit } from "../middleware/aiRateLimit";

export const tendersRouter = Router();

tendersRouter.use(requireAuth);

// The contractor's board. Must come before `/:id`.
// Browsing tenders is open; running one is the owner's, and the handlers check
// they own it. requireVerified is role-agnostic, so it composes with those.
tendersRouter.get("/", listOpenTenders);
tendersRouter.get("/:id", getTender);
tendersRouter.patch("/:id", requireVerified, updateTender);
tendersRouter.post("/:id/publish", requireVerified, publishTender);
tendersRouter.post("/:id/close", requireVerified, closeTender);
tendersRouter.post("/:id/cancel", requireVerified, cancelTender);

// Bids on one tender. The owner's read is refused while bidding is open —
// see assertReadable in bids.controller.ts.
//
// Submitting is verified-only. The contractor wizard has promised this since it
// was written ("Only verified contractors can bid on tenders") — until now
// nothing enforced it.
tendersRouter.get("/:id/bids", listTenderBids);
tendersRouter.post("/:id/bids", requireVerified, submitBid);

// The two sides of reading a bid, deliberately asymmetric:
// - the contractor's own check answers in bands, never absolute benchmarks;
// - the owner's analysis carries real figures including their guide rates.
// Each is gated to its own side. See the controllers for why.
tendersRouter.post("/:id/bid-check", aiInlineLimit, bidSanityCheck);
tendersRouter.post("/:id/bid-analysis", aiInlineLimit, bidAnalysis);
