import { Router } from "express";
import {
  changeEmail,
  changePassword,
  login,
  logout,
  me,
  register,
  registerProfessional,
  updateAccount,
  updateProfile,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/register-professional", registerProfessional);
authRouter.post("/login", login);
authRouter.post("/logout", requireAuth, logout);
authRouter.get("/me", requireAuth, me);
authRouter.patch("/profile", requireAuth, updateProfile);

// Account settings — shared by every role, unlike the role-specific profile.
authRouter.patch("/account", requireAuth, updateAccount);
authRouter.post("/change-email", requireAuth, changeEmail);
authRouter.post("/change-password", requireAuth, changePassword);
