import mongoose from "mongoose";

const OfferSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  
  // Offer type: "location" or "poolparty"
  offerType: {
    type: String,
    enum: ["location", "poolparty"],
    required: true
  },
  
  // Selected locations (for location type offers)
  selectedLocations: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Location"
  }],
  
  // Selected pool parties (for poolparty type offers)
  selectedPoolParties: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "PoolParty"
  }],
  
  // Date range for offer validity
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  
  // Offer pricing for locations
  locationPricing: {
    pricePerAdultDay: { type: Number },
    pricePerKidDay: { type: Number },
    pricePerPersonNight: { type: Number },
    extraPersonCharge: { type: Number },
    
    // Food packages with offer pricing AND locationId
    foodPackages: [{
      foodPackageId: { type: String },
      name: { type: String },
      description: { type: String },
      pricePerAdult: { type: Number },
      pricePerKid: { type: Number },
      locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location" } // NEW: Store location reference
    }]
  },
  
  // Snapshot of original pricing for selected locations (for audit and revert)
  originalLocationPricing: [{
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location" },
    pricingSnapshot: {
      pricePerAdultDay: { type: Number },
      pricePerKidDay: { type: Number },
      pricePerPersonNight: { type: Number },
      extraPersonCharge: { type: Number },
      foodPackages: [{
        foodPackageId: { type: String },
        name: { type: String },
        description: { type: String },
        pricePerAdult: { type: Number },
        pricePerKid: { type: Number },
        locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location" }
      }]
    }
  }],
  
  // Offer pricing for pool parties
  poolPartyPricing: {
    // Sessions with offer pricing (per pool party)
    sessions: [{
      session: { type: String }, // "Morning", "Evening", "Full Day"
      startTime: { type: String },
      endTime: { type: String },
      capacity: { type: Number },
      perAdult: { type: Number },
      perKid: { type: Number },
      poolPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "PoolParty" }
    }],
    
    // Food packages with offer pricing AND poolPartyId
    foodPackages: [{
      foodPackageId: { type: String },
      name: { type: String },
      description: { type: String },
      pricePerAdult: { type: Number },
      pricePerKid: { type: Number },
      poolPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "PoolParty" } // NEW: Store pool party reference
    }]
  },
  
  // Snapshot of original pricing for selected pool parties
  originalPoolPartyPricing: [{
    poolPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "PoolParty" },
    pricingSnapshot: {
      sessions: [{
        session: { type: String },
        startTime: { type: String },
        endTime: { type: String },
        capacity: { type: Number },
        perAdult: { type: Number },
        perKid: { type: Number }
      }],
      foodPackages: [{
        foodPackageId: { type: String },
        name: { type: String },
        description: { type: String },
        pricePerAdult: { type: Number },
        pricePerKid: { type: Number },
        poolPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "PoolParty" }
      }]
    }
  }],
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin"
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient querying
OfferSchema.index({ startDate: 1, endDate: 1, offerType: 1 });
OfferSchema.index({ selectedLocations: 1, startDate: 1, endDate: 1 });
OfferSchema.index({ selectedPoolParties: 1, startDate: 1, endDate: 1 });

export default mongoose.model("Offer", OfferSchema);