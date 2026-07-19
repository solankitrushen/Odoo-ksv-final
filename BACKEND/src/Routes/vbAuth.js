import { Router } from "express";
import {
  registerTenant,
  switchTenant,
  vbLogin,
  vbLogout,
  vbMe,
  changePassword,
  vbOtpRequest,
  vbOtpVerify,
} from "../Controllers/vbAuthController.js";
import { asyncHandler } from "../Utils/asyncHandler.js";
import { authMiddleware } from "../Middleware/authMiddleware.js";
import { authRateLimiter } from "../Middleware/rateLimiter.js";
import { loginRateLimiter } from "../Middleware/loginRateLimiter.js";
import {
  registerTenantSchema,
  switchTenantSchema,
  vbLoginSchema,
  changePasswordSchema,
  vbOtpRequestSchema,
  vbOtpVerifySchema,
} from "../Validators/vbAuthValidator.js";
import { validate } from "../Validators/validate.js";

const router = Router();

router.post("/register-tenant", authRateLimiter, validate(registerTenantSchema), asyncHandler(registerTenant));
router.post("/login", loginRateLimiter, validate(vbLoginSchema), asyncHandler(vbLogin));
router.post("/otp/request", loginRateLimiter, validate(vbOtpRequestSchema), asyncHandler(vbOtpRequest));
router.post("/otp/verify", loginRateLimiter, validate(vbOtpVerifySchema), asyncHandler(vbOtpVerify));
router.post("/switch-tenant", authMiddleware, validate(switchTenantSchema), asyncHandler(switchTenant));
router.post("/logout", authMiddleware, vbLogout);
router.post("/change-password", authMiddleware, validate(changePasswordSchema), asyncHandler(changePassword));
router.get("/me", authMiddleware, asyncHandler(vbMe));

export default router;
