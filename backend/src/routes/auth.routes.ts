import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env";
import { access } from "../config/permissions";
import * as controller from "../controllers/auth.controller";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  changePasswordSchema,
  createUserSchema,
  forgotPasswordSchema,
  loginSchema,
  resendOtpSchema,
  resendResetSchema,
  resetPasswordSchema,
  updateUserSchema,
  verifyOtpSchema,
} from "../validators/auth.validators";
import { idParams } from "../validators/common";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "test" ? 1000 : 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}:${String(req.body?.email ?? "").toLowerCase()}`,
  message: { success: false, error: { code: "TOO_MANY_ATTEMPTS", message: "Too many login attempts. Try again in 15 minutes." } },
});

/** Brute-force guard for the emailed code (per IP); each code also allows only 5 attempts. */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "test" ? 1000 : 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, error: { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Try again in 15 minutes." } },
});

authRouter.get("/csrf", controller.csrf);
authRouter.post("/login", loginLimiter, validate(loginSchema), controller.login);
authRouter.post("/verify-otp", otpLimiter, validate(verifyOtpSchema), controller.verifyOtp);
authRouter.post("/resend-otp", otpLimiter, validate(resendOtpSchema), controller.resendOtp);
authRouter.post("/forgot-password", loginLimiter, validate(forgotPasswordSchema), controller.forgotPassword);
authRouter.post("/forgot-password/resend", otpLimiter, validate(resendResetSchema), controller.resendResetCode);
authRouter.post("/reset-password", otpLimiter, validate(resetPasswordSchema), controller.resetPassword);
authRouter.post("/logout", controller.logout);

authRouter.use(authenticate);
authRouter.get("/me", controller.me);
authRouter.post("/logout-all", controller.logoutAll);
authRouter.post("/change-password", validate(changePasswordSchema), controller.changePassword);

authRouter.get("/users", authorize(access.management), controller.listUsers);
authRouter.post("/users", authorize(access.management), validate(createUserSchema), controller.createUser);
authRouter.patch("/users/:id", authorize(access.management), validate(idParams, "params"), validate(updateUserSchema), controller.updateUser);
