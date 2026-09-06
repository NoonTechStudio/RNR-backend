import Review from "../models/Review.js";
import Location from "../models/Location.js";
import cloudinary from "../config/Cloudinary.js";

// Helper to stream upload files to Cloudinary
const uploadFileToCloudinary = (fileBuffer, folder = 'reviews', resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(fileBuffer);
  });
};

// Create a new review
export const createReview = async (req, res) => {
  try {
    const {
      location,
      guestName,
      email,
      rating,
      title,
      reviewText,
      stayDate,
      wouldRecommend,
      youtubeUrl
    } = req.body;

    // Validate required fields
    if (!location || !guestName || !rating || !title || !reviewText || !stayDate) {
      return res.status(400).json({
        error: "Missing required fields: location, guestName, rating, title, reviewText, stayDate"
      });
    }

    // Check if location exists
    const locationExists = await Location.findById(location);
    if (!locationExists) {
      return res.status(404).json({ error: "Location not found" });
    }

    const numRating = Number(rating);
    // Validate rating range
    if (numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    // Validate stay date is not in the future
    const stayDateObj = new Date(stayDate);
    const today = new Date();
    if (stayDateObj > today) {
      return res.status(400).json({ error: "Stay date cannot be in the future" });
    }

    // Handle image file uploads
    let uploadedImages = [];
    if (req.files?.images && req.files.images.length > 0) {
      for (const imgFile of req.files.images) {
        const result = await uploadFileToCloudinary(imgFile.buffer, 'reviews/images', 'image');
        uploadedImages.push({
          url: result.secure_url,
          public_id: result.public_id
        });
      }
    }

    // Handle video file upload
    let uploadedVideo = undefined;
    if (req.files?.video && req.files.video.length > 0) {
      const vidFile = req.files.video[0];
      const result = await uploadFileToCloudinary(vidFile.buffer, 'reviews/videos', 'video');
      uploadedVideo = {
        url: result.secure_url,
        public_id: result.public_id
      };
    }

    // Create new review
    const review = new Review({
      location,
      guestName: guestName.trim(),
      email: email ? email.trim().toLowerCase() : undefined,
      rating: numRating,
      title: title.trim(),
      reviewText: reviewText.trim(),
      stayDate: stayDateObj,
      wouldRecommend: wouldRecommend === 'true' || wouldRecommend === true,
      images: uploadedImages,
      video: uploadedVideo,
      youtubeUrl: youtubeUrl ? youtubeUrl.trim() : undefined
    });

    const savedReview = await review.save();

    // Populate location name for response
    await savedReview.populate('location', 'name');

    res.status(201).json({
      message: "Review submitted successfully",
      review: savedReview
    });

  } catch (error) {
    console.error("Error creating review:", error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: errors.join(', ') });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: "Invalid location ID" });
    }
    
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get all reviews with optional filtering
export const getReviews = async (req, res) => {
  try {
    const { 
      location, 
      rating, 
      sortBy = 'createdAt', 
      sortOrder = 'desc', 
      page = 1, 
      limit = 10,
      featured = false 
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (location) {
      filter.location = location;
    }
    
    if (rating) {
      filter.rating = parseInt(rating);
    }

    // Featured reviews (high ratings)
    if (featured === 'true') {
      filter.rating = { $gte: 4 };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get reviews with population
    const reviews = await Review.find(filter)
      .populate('location', 'name images')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean(); // Convert to plain objects for better performance

    // Get total count for pagination
    const total = await Review.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);

    // Calculate overall statistics
    const stats = await Review.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          recommendedCount: {
            $sum: { $cond: ['$wouldRecommend', 1, 0] }
          },
          ratingDistribution: {
            $push: '$rating'
          }
        }
      }
    ]);

    const statistics = stats[0] ? {
      averageRating: Math.round(stats[0].averageRating * 10) / 10,
      totalReviews: stats[0].totalReviews,
      recommendedPercentage: Math.round((stats[0].recommendedCount / stats[0].totalReviews) * 100),
      ratingDistribution: {
        1: stats[0].ratingDistribution.filter(r => r === 1).length,
        2: stats[0].ratingDistribution.filter(r => r === 2).length,
        3: stats[0].ratingDistribution.filter(r => r === 3).length,
        4: stats[0].ratingDistribution.filter(r => r === 4).length,
        5: stats[0].ratingDistribution.filter(r => r === 5).length
      }
    } : {
      averageRating: 0,
      totalReviews: 0,
      recommendedPercentage: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };

    res.json({
      reviews,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalReviews: total,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      },
      statistics
    });

  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get review by ID
export const getReviewById = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id).populate('location', 'name address images');
    
    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    res.json(review);

  } catch (error) {
    console.error("Error fetching review:", error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: "Invalid review ID" });
    }
    
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get reviews by location ID
export const getReviewsByLocation = async (req, res) => {
  try {
    const { locationId } = req.params;
    const { 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      rating,
      limit = 10 
    } = req.query;

    // Check if location exists
    const location = await Location.findById(locationId);
    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }

    // Build filter object
    const filter = { location: locationId };
    if (rating) {
      filter.rating = parseInt(rating);
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Apply limit
    const limitNum = parseInt(limit);

    const reviews = await Review.find(filter)
      .populate('location', 'name')
      .sort(sort)
      .limit(limitNum);

    // Calculate statistics for this location - FIXED VERSION
    let statistics = {
      averageRating: 0,
      totalReviews: 0,
      recommendedPercentage: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };

    if (reviews.length > 0) {
      // Manual calculation instead of aggregation
      const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
      const recommendedCount = reviews.filter(review => review.wouldRecommend).length;
      
      // Calculate rating distribution
      const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      reviews.forEach(review => {
        ratingDistribution[review.rating]++;
      });

      statistics = {
        averageRating: Math.round((totalRating / reviews.length) * 10) / 10,
        totalReviews: reviews.length,
        recommendedPercentage: Math.round((recommendedCount / reviews.length) * 100),
        ratingDistribution
      };
    }

    res.json({
      location: {
        _id: location._id,
        name: location.name
      },
      reviews,
      summary: statistics
    });

  } catch (error) {
    console.error("Error fetching location reviews:", error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: "Invalid location ID" });
    }
    
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update a review
export const updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const existingReview = await Review.findById(id);

    if (!existingReview) {
      return res.status(404).json({ error: "Review not found" });
    }

    const updates = { ...req.body };

    // Remove protected fields
    delete updates._id;
    delete updates.location;
    delete updates.createdAt;

    // Handle new image uploads if present
    let uploadedImages = existingReview.images || [];
    if (req.files?.images && req.files.images.length > 0) {
      for (const imgFile of req.files.images) {
        const result = await uploadFileToCloudinary(imgFile.buffer, 'reviews/images', 'image');
        uploadedImages.push({
          url: result.secure_url,
          public_id: result.public_id
        });
      }
    }
    updates.images = uploadedImages;

    // Handle new video upload if present
    if (req.files?.video && req.files.video.length > 0) {
      const vidFile = req.files.video[0];
      const result = await uploadFileToCloudinary(vidFile.buffer, 'reviews/videos', 'video');
      updates.video = {
        url: result.secure_url,
        public_id: result.public_id
      };
    }

    // Validate rating if being updated
    if (updates.rating) {
      updates.rating = Number(updates.rating);
      if (updates.rating < 1 || updates.rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5" });
      }
    }

    if (updates.wouldRecommend !== undefined) {
      updates.wouldRecommend = updates.wouldRecommend === 'true' || updates.wouldRecommend === true;
    }

    // Validate stay date if being updated
    if (updates.stayDate) {
      const stayDateObj = new Date(updates.stayDate);
      const today = new Date();
      if (stayDateObj > today) {
        return res.status(400).json({ error: "Stay date cannot be in the future" });
      }
      updates.stayDate = stayDateObj;
    }

    // Trim string fields
    if (updates.guestName) updates.guestName = updates.guestName.trim();
    if (updates.email) updates.email = updates.email.trim().toLowerCase();
    if (updates.title) updates.title = updates.title.trim();
    if (updates.reviewText) updates.reviewText = updates.reviewText.trim();
    if (updates.youtubeUrl !== undefined) updates.youtubeUrl = updates.youtubeUrl.trim();

    const review = await Review.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate('location', 'name');

    res.json({
      message: "Review updated successfully",
      review
    });

  } catch (error) {
    console.error("Error updating review:", error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: errors.join(', ') });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: "Invalid review ID" });
    }
    
    res.status(500).json({ error: "Internal server error" });
  }
};

// Delete a review
export const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findByIdAndDelete(id);

    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    res.json({ message: "Review deleted successfully" });

  } catch (error) {
    console.error("Error deleting review:", error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: "Invalid review ID" });
    }
    
    res.status(500).json({ error: "Internal server error" });
  }
};

