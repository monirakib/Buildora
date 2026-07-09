import { Router } from "express";
import {
  login,
  me,
  register,
  registerProfessional,
  updateProfile,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/register-professional", registerProfessional);
authRouter.post("/login", login);
authRouter.get("/me", requireAuth, me);
authRouter.patch("/profile", requireAuth, updateProfile);
