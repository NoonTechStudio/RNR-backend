import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema({
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Location",
    required: true,
  },
  guestName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  reviewText: {
    type: String,
    required: true,
    trim: true
  },
  stayDate: {
    type: Date,
    required: true
  },
  wouldRecommend: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better query performance
ReviewSchema.index({ location: 1, createdAt: -1 });
ReviewSchema.index({ rating: -1 });

export default mongoose.model("Review", ReviewSchema);