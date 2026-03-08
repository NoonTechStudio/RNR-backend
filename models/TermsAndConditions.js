// models/TermsAndConditions.js
import mongoose from "mongoose";

const TermsAndConditionsSchema = new mongoose.Schema({
  // Type: location or poolParty
  type: {
    type: String,
    enum: ["location", "poolParty"],
    required: true
  },
  
  // Title for the terms
  title: {
    type: String,
    required: true,
    trim: true
  },
  
  // Description/Summary
  description: {
    type: String,
    trim: true
  },
  
  // Terms content - array of point objects
  terms: [{
    pointNumber: {
      type: Number,
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // Status
  status: {
    type: String,
    enum: ["draft", "active", "inactive"],
    default: "draft"
  },
  
  // For locations: can apply to specific locations
  appliedLocations: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Location"
  }],
  
  // For pool parties: can apply to specific pool parties
  appliedPoolParties: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "PoolParty"
  }],
  
  // Optional: Apply to all items of this type
  applyToAll: {
    type: Boolean,
    default: false
  },
  
  // Created/Updated info
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  effectiveFrom: {
    type: Date,
    default: Date.now
  },
  effectiveUntil: {
    type: Date
  }
});

// Update the updatedAt timestamp before saving
TermsAndConditionsSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for better query performance
TermsAndConditionsSchema.index({ type: 1, status: 1 });
TermsAndConditionsSchema.index({ "appliedLocations": 1 });
TermsAndConditionsSchema.index({ "appliedPoolParties": 1 });

export default mongoose.model("TermsAndConditions", TermsAndConditionsSchema);