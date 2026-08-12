import { Router } from "express";
import {
  cancelTender,
  closeTender,
  getTender,
  listOpenTenders,
  publishTender,
  updateTender,
} from "../controllers/tenders.controller";
import { listTenderBids, submitBid } from "../controllers/bids.controller";
import { requireAuth } from "../middleware/auth";

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
