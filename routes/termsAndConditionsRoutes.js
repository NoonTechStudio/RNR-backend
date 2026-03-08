// routes/termsAndConditionsRoutes.js
import express from "express";
import {
  createTerms,
  getAllTerms,
  getTermsById,
  updateTerms,
  deleteTerms,
  getActiveTermsForItem,
  getAvailableItems,
  updateAppliedItems,
  changeStatus
} from "../controllers/TermsAndConditionsController.js";

const router = express.Router();

// Public routes (for frontend display)
router.get("/active/:type/:itemId", getActiveTermsForItem);

// Protected routes (admin only)
router.post("/", createTerms);
router.get("/", getAllTerms);
router.get("/items", getAvailableItems);
router.get("/:id", getTermsById);
router.put("/:id", updateTerms);
router.delete("/:id", deleteTerms);
router.patch("/:id/items", updateAppliedItems);
router.patch("/:id/status", changeStatus);

export default router;