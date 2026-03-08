import express from "express";
import { uploadMemory } from "../middleware/upload.js"; // Use memory storage
import {
  uploadHomepageHero,
  getActiveHomepageHero,
  getAllHomepageHeroSets,
  setHomepageHeroActive,
  deleteHomepageHero,
} from "../controllers/HomepageHeroController.js";

const router = express.Router();

// ✅ Upload 3 hero images (using memory storage and WebP conversion)
router.post("/", uploadMemory.array("heroImages", 3), uploadHomepageHero);

// ✅ Get currently active homepage hero set
router.get("/active", getActiveHomepageHero);

// ✅ Get all hero sets (for admin)
router.get("/", getAllHomepageHeroSets);

// ✅ Activate a specific hero set
router.put("/activate/:id", setHomepageHeroActive);
router.patch("/activate/:id", setHomepageHeroActive);

// ✅ Delete a hero set (removes from Cloudinary + DB)
router.delete("/:id", deleteHomepageHero);

export default router;