import { Router } from "express";
import { authRouter } from "./auth.routes";
import { healthRouter } from "./health.routes";
import { professionalsRouter } from "./professionals.routes";
import { inquiriesRouter } from "./inquiries.routes";
import { uploadsRouter } from "./uploads.routes";
import { verificationRouter } from "./verification.routes";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/professionals", professionalsRouter);
apiRouter.use("/inquiries", inquiriesRouter);
apiRouter.use("/uploads", uploadsRouter);
apiRouter.use("/verification", verificationRouter);
