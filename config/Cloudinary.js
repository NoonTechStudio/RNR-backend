// config/cloudinary.js
import { v2 as cloudinary } from "cloudinary";
import dotenv from 'dotenv';

dotenv.config(); // Ensure env vars are loaded

const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
};

// Validate all required config exists
const isConfigValid = cloudinaryConfig.cloud_name && 
                     cloudinaryConfig.api_key && 
                     cloudinaryConfig.api_secret;

if (!isConfigValid) {
  console.error('❌ Cloudinary configuration incomplete!');
  console.log('Current config:', {
    cloud_name: !!cloudinaryConfig.cloud_name,
    api_key: !!cloudinaryConfig.api_key,
    api_secret: !!cloudinaryConfig.api_secret
  });
} else {
  cloudinary.config(cloudinaryConfig);
  console.log('☁️ Cloudinary configured successfully');
}

export default cloudinary;