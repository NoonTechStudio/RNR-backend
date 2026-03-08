import LocationImage from "../models/LocationImage.js";
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload file to Cloudinary (supports both images and videos)
const uploadToCloudinary = async (fileBuffer, mimetype, folder = 'location-images') => {
  try {
    const isVideo = mimetype.startsWith('video/');
    const isImage = mimetype.startsWith('image/');

    if (isImage) {
      // Convert image to WebP using sharp
      const webpBuffer = await sharp(fileBuffer)
        .webp({ quality: 80 })
        .toBuffer();

      // Upload image to Cloudinary
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: folder,
            format: 'webp',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve({ ...result, resource_type: 'image' });
          }
        ).end(webpBuffer);
      });
    } else if (isVideo) {
      // Upload video to Cloudinary
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: 'video',
            folder: folder,
            chunk_size: 6000000, // 6MB chunks for better video upload
          },
          (error, result) => {
            if (error) reject(error);
            else resolve({ ...result, resource_type: 'video' });
          }
        ).end(fileBuffer);
      });
    } else {
      throw new Error('Unsupported file type');
    }
  } catch (error) {
    throw new Error(`File processing failed: ${error.message}`);
  }
};

// Delete file from Cloudinary
// Delete file from Cloudinary
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    console.log(`Attempting to delete from Cloudinary:`, { publicId, resourceType });
    
    const result = await cloudinary.uploader.destroy(publicId, { 
      resource_type: resourceType,
      invalidate: true // Optional: invalidate CDN cache
    });
    
    console.log(`Cloudinary deletion result for ${publicId}:`, result);
    
    if (result.result !== 'ok' && result.result !== 'not found') {
      console.warn(`Unexpected Cloudinary result for ${publicId}:`, result);
    }
    
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', {
      publicId,
      resourceType,
      error: error.message
    });
    throw error;
  }
};

// Add media for a location (both images and videos)
export const createLocationImages = async (req, res) => {
  try {
    const { locationId, imageDetails } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    // Parse media details from frontend
    const parsedMediaDetails = JSON.parse(imageDetails || "[]");

    // Upload files to Cloudinary and create media objects
    const mediaUploadPromises = req.files.map(async (file, index) => {
      const cloudinaryResult = await uploadToCloudinary(file.buffer, file.mimetype);
      
      const isVideo = file.mimetype.startsWith('video/');
      const isImage = file.mimetype.startsWith('image/');
      
      return {
        url: cloudinaryResult.secure_url,
        cloudinaryId: cloudinaryResult.public_id,
        alt: parsedMediaDetails[index]?.alt || "",
        title: parsedMediaDetails[index]?.title || (isVideo ? `Video ${index + 1}` : `Image ${index + 1}`),
        isMainImage: parsedMediaDetails[index]?.isMainImage || false,
        order: parsedMediaDetails[index]?.order || index,
        format: isVideo ? file.mimetype.split('/')[1] : 'webp',
        fileSize: cloudinaryResult.bytes,
        mediaType: isVideo ? 'video' : 'image',
        duration: cloudinaryResult.duration || null,
        thumbnail: isVideo ? cloudinaryResult.secure_url.replace(/\.[^/.]+$/, ".jpg") : null
      };
    });

    const mediaObjects = await Promise.all(mediaUploadPromises);

    // Check if entry exists for this location
    let locationImage = await LocationImage.findOne({ location: locationId });

    if (locationImage) {
      // If exists, push new media to the array
      locationImage.images.push(...mediaObjects);
      await locationImage.save();
    } else {
      // If not, create a new one
      locationImage = new LocationImage({
        location: locationId,
        images: mediaObjects,
      });
      await locationImage.save();
    }

    // Populate location name for response
    await locationImage.populate('location', 'name');

    res.status(201).json({
      message: "Media files uploaded successfully",
      locationImage
    });

  } catch (err) {
    console.error("Error uploading media files:", err);
    res.status(500).json({ error: err.message });
  }
};

// Enhanced update location media with proper Cloudinary handling
// Enhanced update location media with proper Cloudinary handling
export const updateLocationImages = async (req, res) => {
  try {
    const { id } = req.params;
    const { locationId, imageDetails } = req.body;

    console.log('Update request received:', { id, locationId, files: req.files?.length });

    // Parse media details from frontend
    const parsedMediaDetails = JSON.parse(imageDetails || "[]");
    console.log('Parsed media details:', parsedMediaDetails.length);

    const locationImage = await LocationImage.findById(id);
    if (!locationImage) {
      return res.status(404).json({ error: "Location media not found" });
    }

    // Separate operations
    const mediaToKeep = [];
    const mediaToDelete = [];
    const newMediaToAdd = [];

    // Process existing media
    parsedMediaDetails.forEach(mediaDetail => {
      if (mediaDetail._id && !mediaDetail.markedForDeletion) {
        // Existing media to keep (update metadata)
        const originalMedia = locationImage.images.id(mediaDetail._id);
        if (originalMedia) {
          mediaToKeep.push({
            ...originalMedia.toObject(),
            alt: mediaDetail.alt || originalMedia.alt,
            title: mediaDetail.title || originalMedia.title,
            imageType: mediaDetail.imageType || originalMedia.imageType,
            isMainImage: mediaDetail.isMainImage !== undefined ? mediaDetail.isMainImage : originalMedia.isMainImage,
            order: mediaDetail.order !== undefined ? mediaDetail.order : originalMedia.order,
          });
        }
      } else if (mediaDetail._id && mediaDetail.markedForDeletion) {
        // Existing media to delete
        const mediaToRemove = locationImage.images.id(mediaDetail._id);
        if (mediaToRemove) {
          mediaToDelete.push(mediaToRemove);
        }
      } else if (!mediaDetail._id) {
        // New media to add (will be handled with file uploads)
        newMediaToAdd.push(mediaDetail);
      }
    });

    console.log('Media operations:', {
      keep: mediaToKeep.length,
      delete: mediaToDelete.length,
      add: newMediaToAdd.length,
      files: req.files?.length
    });

    // Delete media from Cloudinary and database
    const deletePromises = mediaToDelete.map(async (media) => {
      console.log(`Deleting media from Cloudinary:`, {
        cloudinaryId: media.cloudinaryId,
        mediaType: media.mediaType,
        title: media.title
      });
      
      if (media.cloudinaryId) {
        try {
          const resourceType = media.mediaType === 'video' ? 'video' : 'image';
          console.log(`Deleting ${resourceType} with ID: ${media.cloudinaryId}`);
          
          const deleteResult = await deleteFromCloudinary(media.cloudinaryId, resourceType);
          console.log(`Cloudinary delete result for ${media.cloudinaryId}:`, deleteResult);
          
          if (deleteResult.result !== 'ok') {
            console.warn(`Cloudinary deletion may have failed for ${media.cloudinaryId}:`, deleteResult);
          }
        } catch (cloudinaryError) {
          console.error(`Failed to delete from Cloudinary: ${media.cloudinaryId}`, cloudinaryError);
          // Don't throw here - we still want to remove from database even if Cloudinary fails
        }
      } else {
        console.warn(`No cloudinaryId found for media:`, media._id);
      }
      
      // Remove from database regardless of Cloudinary success
      locationImage.images.pull({ _id: media._id });
    });

    // Wait for all deletions to complete
    await Promise.allSettled(deletePromises);
    console.log(`Completed deletion of ${mediaToDelete.length} media items`);

    // Upload new files to Cloudinary
    let newMediaObjects = [];
    if (req.files && req.files.length > 0) {
      console.log(`Uploading ${req.files.length} new files to Cloudinary`);
      
      const uploadPromises = req.files.map(async (file, index) => {
        const mediaDetail = newMediaToAdd[index];
        console.log(`Uploading file: ${file.originalname}, type: ${file.mimetype}`);
        
        try {
          const cloudinaryResult = await uploadToCloudinary(file.buffer, file.mimetype);
          console.log(`Upload successful: ${cloudinaryResult.public_id}`);
          
          const isVideo = file.mimetype.startsWith('video/');
          const isImage = file.mimetype.startsWith('image/');
          
          return {
            url: cloudinaryResult.secure_url,
            cloudinaryId: cloudinaryResult.public_id,
            alt: mediaDetail?.alt || "",
            title: mediaDetail?.title || (isVideo ? `Video ${index + 1}` : `Image ${index + 1}`),
            imageType: mediaDetail?.imageType || 'others',
            isMainImage: mediaDetail?.isMainImage || false,
            order: mediaDetail?.order || (mediaToKeep.length + index),
            format: isVideo ? file.mimetype.split('/')[1] : 'webp',
            fileSize: cloudinaryResult.bytes,
            mediaType: isVideo ? 'video' : 'image',
            duration: cloudinaryResult.duration || null,
            thumbnail: isVideo ? cloudinaryResult.secure_url.replace(/\.[^/.]+$/, ".jpg") : null
          };
        } catch (uploadError) {
          console.error(`Failed to upload file ${file.originalname}:`, uploadError);
          throw uploadError;
        }
      });

      newMediaObjects = await Promise.all(uploadPromises);
      console.log(`Successfully uploaded ${newMediaObjects.length} new media items`);
    }

    // Combine kept media and new media
    const updatedMedia = [...mediaToKeep, ...newMediaObjects];

    // Update the location image document
    locationImage.images = updatedMedia;
    await locationImage.save();

    await locationImage.populate('location', 'name');

    res.json({
      message: "Media updated successfully",
      locationImage,
      stats: {
        kept: mediaToKeep.length,
        deleted: mediaToDelete.length,
        added: newMediaObjects.length
      }
    });

  } catch (err) {
    console.error("Error updating location media:", err);
    res.status(500).json({ error: err.message });
  }
};

// Delete specific media from location
export const deleteLocationImage = async (req, res) => {
  try {
    const { locationImageId, imageId } = req.params;
    
    const locationImage = await LocationImage.findById(locationImageId);
    if (!locationImage) {
      return res.status(404).json({ error: "Location media not found" });
    }

    // Find the media to delete
    const mediaToDelete = locationImage.images.id(imageId);
    if (!mediaToDelete) {
      return res.status(404).json({ error: "Media not found" });
    }

    // Delete from Cloudinary
    if (mediaToDelete.cloudinaryId) {
      const resourceType = mediaToDelete.mediaType === 'video' ? 'video' : 'image';
      await deleteFromCloudinary(mediaToDelete.cloudinaryId, resourceType);
    }

    // Remove from array
    locationImage.images.pull({ _id: imageId });
    await locationImage.save();

    await locationImage.populate('location', 'name');

    res.json({
      message: "Media deleted successfully",
      locationImage
    });

  } catch (err) {
    console.error("Error deleting media:", err);
    res.status(500).json({ error: err.message });
  }
};

// Delete entire location media entry
export const deleteLocationMedia = async (req, res) => {
  try {
    const { id } = req.params;
    
    const locationImage = await LocationImage.findById(id);
    if (!locationImage) {
      return res.status(404).json({ error: "Location media not found" });
    }

    // Delete all media from Cloudinary
    const deletePromises = locationImage.images.map(async (media) => {
      if (media.cloudinaryId) {
        const resourceType = media.mediaType === 'video' ? 'video' : 'image';
        await deleteFromCloudinary(media.cloudinaryId, resourceType);
      }
    });

    await Promise.all(deletePromises);

    // Delete the entire document
    await LocationImage.findByIdAndDelete(id);

    res.json({
      message: "Location media deleted successfully",
      deletedCount: locationImage.images.length
    });

  } catch (err) {
    console.error("Error deleting location media:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get all location media
export const getAllLocationImages = async (req, res) => {
  try {
    const locationImages = await LocationImage.find().populate('location', 'name');
    res.json(locationImages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get location media by ID
export const getLocationImagesById = async (req, res) => {
  try {
    const locationImage = await LocationImage.findById(req.params.id).populate('location', 'name');
    if (!locationImage) {
      return res.status(404).json({ error: "Location media not found" });
    }
    res.json(locationImage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get location media by location ID
export const getLocationImagesByLocationId = async (req, res) => {
  try {
    const { locationId } = req.params;
    const locationImage = await LocationImage.findOne({ location: locationId }).populate('location', 'name');
    if (!locationImage) {
      return res.status(404).json({ error: "Location media not found" });
    }
    res.json(locationImage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};