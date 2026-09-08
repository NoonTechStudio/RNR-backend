import express from "express";
import {
  validateCoupon,
  getAllCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from "../controllers/CouponController.js";
import { authenticateAdmin, requireSuperAdmin } from "../middleware/auth.js";
import { sanitizeInput } from "../middleware/security.js";

const router = express.Router();

// Public - used by the booking flow (customer site + admin booking screens)
router.post("/validate", sanitizeInput, validateCoupon);

// Admin - requires super admin authentication (mirrors OfferRoutes)
router.get("/", authenticateAdmin, requireSuperAdmin, getAllCoupons);
router.get("/:couponId", authenticateAdmin, requireSuperAdmin, getCouponById);
router.post("/", authenticateAdmin, requireSuperAdmin, sanitizeInput, createCoupon);
router.put("/:couponId", authenticateAdmin, requireSuperAdmin, sanitizeInput, updateCoupon);
router.delete("/:couponId", authenticateAdmin, requireSuperAdmin, deleteCoupon);

export default router;
