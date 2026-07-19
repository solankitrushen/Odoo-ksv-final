import { Router } from "express";
import adminRoutes from "./admin.js";
import customerRoutes from "./customer.js";
import publicRoutes from "./public.js";
import { adminChain, customerChain, publicChain } from "../middleware/auth.js";
import { rentalErrorHandler } from "../errors.js";

// Mounted at /api/v1/rental. Each realm applies its own auth chain.
const router = Router();

router.use("/admin", ...adminChain, adminRoutes);
router.use("/customer", ...customerChain, customerRoutes);
router.use("/public/:tenantSlug", ...publicChain, publicRoutes);

router.use(rentalErrorHandler);

export default router;
