import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/Cloudinary.js';

// For HomepageHero - use memory storage to match LocationImages approach
const memoryStorage = multer.memoryStorage();

export const uploadMemory = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for videos, 10MB for images
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

// Keep the existing CloudinaryStorage for other routes if needed
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'rest-and-relax-gallery',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'avi', 'webm', 'mkv'],
    resource_type: 'auto', // This allows both images and videos
  },
});

export const uploadCloudinary = multer({ storage: cloudinaryStorage });

export default uploadCloudinary;