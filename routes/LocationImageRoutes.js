import express from "express";
import multer from "multer";
import {
  createLocationImages,
  updateLocationImages,
  deleteLocationImage,
  deleteLocationMedia,
  getAllLocationImages,
  getLocationImagesById,
  getLocationImagesByLocationId
} from "../controllers/LocationImageController.js";

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for videos
  },
  fileFilter: (req, file, cb) => {
    const allowedImageMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const allowedVideoMimes = ['video/mp4', 'video/mov', 'video/avi', 'video/webm', 'video/mkv'];
    
    if (allowedImageMimes.includes(file.mimetype) || allowedVideoMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images (JPG, JPEG, PNG, WebP) and videos (MP4, MOV, AVI, WebM, MKV) are allowed.'), false);
    }
  }
});

// Routes
router.post("/", upload.array("images", 10), createLocationImages);
router.get("/", getAllLocationImages);
router.get("/:id", getLocationImagesById);
router.get("/location/:locationId", getLocationImagesByLocationId);
router.put("/:id", upload.array("images", 10), updateLocationImages); // Added file upload for updates
router.delete("/:locationImageId/images/:imageId", deleteLocationImage);
router.delete("/:id", deleteLocationMedia); // Delete entire location media

export default router;