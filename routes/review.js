import express from "express"; 
const router = express.Router();
import {
  createReview,
  getReviews,
  getReviewById,
  getReviewsByLocation,
  updateReview,
  deleteReview
} from "../controllers/reviewController.js";

// Create a new review
router.post("/", createReview);

// Get all reviews with filtering and pagination
router.get("/", getReviews);

// Get review by ID
router.get("/:id", getReviewById);

// Get reviews by location ID
router.get("/location/:locationId", getReviewsByLocation);

// Update a review
router.put("/:id", updateReview);

// Delete a review
router.delete("/:id", deleteReview);

export default router;