import express from "express"; 
import { uploadMemory } from "../middleware/upload.js";
const router = express.Router();
import {
  createReview,
  getReviews,
  getReviewById,
  getReviewsByLocation,
  updateReview,
  deleteReview
} from "../controllers/reviewController.js";

const reviewUpload = uploadMemory.fields([
  { name: 'images', maxCount: 5 },
  { name: 'video', maxCount: 1 }
]);

// Create a new review
router.post("/", reviewUpload, createReview);

// Get all reviews with filtering and pagination
router.get("/", getReviews);

// Get review by ID
router.get("/:id", getReviewById);

// Get reviews by location ID
router.get("/location/:locationId", getReviewsByLocation);

// Update a review
router.put("/:id", reviewUpload, updateReview);

// Delete a review
router.delete("/:id", deleteReview);

export default router;