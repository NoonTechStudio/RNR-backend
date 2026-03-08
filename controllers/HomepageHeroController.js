import HomepageHero from "../models/HomepageHero.js";
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';

const REQUIRED_WIDTH = 4032;
const REQUIRED_HEIGHT = 3024;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Configure Cloudinary (same as LocationImages)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Convert image to WebP and upload to Cloudinary (same as LocationImages)
const uploadToCloudinary = async (fileBuffer, folder = 'resort-homepage-hero') => {
  try {
    // Convert to WebP using sharp
    const webpBuffer = await sharp(fileBuffer)
      .webp({ quality: 80 })
      .toBuffer();

    // Upload to Cloudinary
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: folder,
          format: 'webp',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(webpBuffer);
    });
  } catch (error) {
    throw new Error(`Image processing failed: ${error.message}`);
  }
};

// Delete image from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
  }
};

// ✅ Upload homepage hero images (Updated to use WebP conversion)
export const uploadHomepageHero = async (req, res) => {
  try {
    console.log('📸 Upload request received');
    console.log('Origin:', req.headers.origin);
    console.log('Files count:', req.files?.length || 0);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: "No images uploaded" 
      });
    }

    if (req.files.length !== 3) {
      return res.status(400).json({ 
        success: false,
        error: "Exactly 3 images are required" 
      });
    }

    console.log('✅ Files validated, processing...');

    // Process uploads with timeout protection
    const uploadPromises = req.files.map(async (file, index) => {
      console.log(`Processing image ${index + 1}...`);
      
      try {
        const cloudinaryResult = await uploadToCloudinary(file.buffer, 'resort-homepage-hero');
        console.log(`✅ Image ${index + 1} uploaded to Cloudinary`);
        
        return {
          url: cloudinaryResult.secure_url,
          cloudinaryId: cloudinaryResult.public_id,
          alt: `Homepage hero image ${index + 1}`,
          title: `Hero Image ${index + 1}`,
          isMainImage: index === 0,
          order: index,
          format: 'webp',
          fileSize: cloudinaryResult.bytes
        };
      } catch (uploadError) {
        console.error(`❌ Error uploading image ${index + 1}:`, uploadError);
        throw new Error(`Failed to process image ${index + 1}: ${uploadError.message}`);
      }
    });

    const uploadResults = await Promise.all(uploadPromises);
    console.log('✅ All images processed');

    // Deactivate existing heroes
    await HomepageHero.updateMany({ isActive: true }, { isActive: false });

    // Create new entry
    const homepageHero = new HomepageHero({
      images: uploadResults,
      isActive: true,
    });
    await homepageHero.save();

    console.log('✅ Homepage hero saved to database');

    res.status(201).json({
      success: true,
      message: "Homepage hero images uploaded successfully as WebP",
      data: homepageHero,
    });
  } catch (error) {
    console.error("❌ Homepage hero upload error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to upload homepage hero images",
    });
  }
};

// ✅ Get active homepage hero (MISSING FUNCTION - ADDED)
export const getActiveHomepageHero = async (req, res) => {
  try {
    const activeHero = await HomepageHero.findOne({ isActive: true })
      .sort({ createdAt: -1 });
    
    if (!activeHero) {
      return res.status(404).json({
        success: false,
        error: "No active homepage hero found"
      });
    }

    res.status(200).json({
      success: true,
      data: activeHero
    });
  } catch (error) {
    console.error("Get active homepage hero error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch active homepage hero"
    });
  }
};

// ✅ Get all homepage hero sets (for admin)
export const getAllHomepageHeroSets = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const homepageHeroSets = await HomepageHero.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await HomepageHero.countDocuments();

    res.json({
      data: homepageHeroSets,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Get all homepage hero sets error:", error);
    res.status(500).json({
      error: error.message || "Failed to fetch homepage hero sets",
    });
  }
};

// ✅ Set a specific homepage hero as active
export const setHomepageHeroActive = async (req, res) => {
  try {
    const { id } = req.params;

    await HomepageHero.updateMany({ isActive: true }, { isActive: false });

    const homepageHero = await HomepageHero.findByIdAndUpdate(
      id,
      { isActive: true, updatedAt: Date.now() },
      { new: true }
    );

    if (!homepageHero) {
      return res.status(404).json({ error: "Homepage hero set not found" });
    }

    res.json({
      message: "Homepage hero set activated successfully",
      data: homepageHero,
    });
  } catch (error) {
    console.error("Set homepage hero active error:", error);
    res.status(500).json({
      error: error.message || "Failed to activate homepage hero set",
    });
  }
};

// ✅ Delete homepage hero set from Cloudinary + DB
export const deleteHomepageHero = async (req, res) => {
  try {
    const { id } = req.params;

    const homepageHero = await HomepageHero.findById(id);
    if (!homepageHero) {
      return res.status(404).json({ error: "Homepage hero set not found" });
    }

    // Delete images from Cloudinary using their public_id
    const deletePromises = homepageHero.images.map(async (img) => {
      if (img.cloudinaryId) {
        try {
          await deleteFromCloudinary(img.cloudinaryId);
        } catch (err) {
          console.warn(`Failed to delete Cloudinary file: ${img.cloudinaryId}`, err.message);
        }
      }
    });

    await Promise.all(deletePromises);

    await HomepageHero.findByIdAndDelete(id);

    res.json({ message: "Homepage hero set deleted successfully" });
  } catch (error) {
    console.error("Delete homepage hero error:", error);
    res.status(500).json({
      error: error.message || "Failed to delete homepage hero set",
    });
  }
};