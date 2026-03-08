import express from "express";
import {
  createOrder,
  verifyPayment,
  verifyPoolPartyPayment, // ADD THIS
  getPaymentStatus,
  getAllPayments,
  refundPayment,
  processAdminPayment,
  markAsPaid,
  createPoolPartyOrder
} from "../controllers/PaymentController.js";
import { paymentLimiter } from "../middleware/security.js";
import { sanitizeInput } from "../middleware/security.js";
import { authenticateAdmin } from "../middleware/auth.js";

const router = express.Router();

// Public routes (for frontend payment processing)
router.post("/create-order", paymentLimiter, sanitizeInput, createOrder);
router.post("/create-poolparty-order", paymentLimiter, sanitizeInput, createPoolPartyOrder);
router.post("/verify", sanitizeInput, verifyPayment);
router.post("/verify-poolparty", sanitizeInput, verifyPoolPartyPayment); // ADD THIS
router.get("/status/:bookingId", getPaymentStatus);

// Admin only routes
router.get("/", authenticateAdmin, getAllPayments);
router.post("/:id/refund", authenticateAdmin, sanitizeInput, refundPayment);
router.post("/admin/process-payment", authenticateAdmin, sanitizeInput, processAdminPayment);
router.post("/admin/mark-paid", authenticateAdmin, sanitizeInput, markAsPaid);

export default router;