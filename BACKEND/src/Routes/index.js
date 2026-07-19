import express from "express";
import { Router } from "express";
import vbAuthRoutes from "./vbAuth.js";
import { rentalRoutes } from "../Rental/index.js";
import {
  mongoSanitizeMiddleware,
  xssProtection,
  parameterTypeValidator,
  sensitiveRouteLogger,
} from "../Middleware/inputSanitizer.js";
import { csrfProtection } from "../Middleware/csrf.js";

const router = Router();

router.use(sensitiveRouteLogger);
router.use(mongoSanitizeMiddleware);
router.use(xssProtection);
router.use(parameterTypeValidator);
router.use(csrfProtection);

// Rental Portal — sole product surface
router.use("/rental", rentalRoutes);

// Rental admin identity (tenant register / password / OTP). Legacy path prefix kept for now.
router.use("/vb/auth", vbAuthRoutes);

export default router;
