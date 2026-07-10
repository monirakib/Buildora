import { Router } from "express";
import { UserRole } from "@buildora/shared";
import {
  createDapZone,
  createEcpsStep,
  createFeeRule,
  deleteDapZone,
  deleteEcpsStep,
  deleteFeeRule,
  estimateFee,
  listDapZones,
  listEcpsSteps,
  listFeeRules,
  updateDapZone,
  updateEcpsStep,
  updateFeeRule,
} from "../controllers/permits.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const permitsRouter = Router();

// Public tools — anyone can check zones, estimate fees, and read the guide.
permitsRouter.get("/dap-zones", listDapZones);
permitsRouter.get("/fee-rules", listFeeRules);
permitsRouter.post("/fee-estimate", estimateFee);
permitsRouter.get("/ecps-steps", listEcpsSteps);

// Admin-only maintenance of the reference data.
const admin = [requireAuth, requireRole(UserRole.ADMIN)] as const;
permitsRouter.post("/dap-zones", ...admin, createDapZone);
permitsRouter.patch("/dap-zones/:id", ...admin, updateDapZone);
permitsRouter.delete("/dap-zones/:id", ...admin, deleteDapZone);
permitsRouter.post("/fee-rules", ...admin, createFeeRule);
permitsRouter.patch("/fee-rules/:id", ...admin, updateFeeRule);
permitsRouter.delete("/fee-rules/:id", ...admin, deleteFeeRule);
permitsRouter.post("/ecps-steps", ...admin, createEcpsStep);
permitsRouter.patch("/ecps-steps/:id", ...admin, updateEcpsStep);
permitsRouter.delete("/ecps-steps/:id", ...admin, deleteEcpsStep);
