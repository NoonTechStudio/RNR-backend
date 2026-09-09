import express from "express";
import { handleContactInquiry } from "../controllers/contactController.js";

const router = express.Router();

// POST /api/contact - Submit contact form inquiry
router.post("/", handleContactInquiry);

export default router;
