import mongoose from "mongoose";

const LocationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: {
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
  },
  coordinates: {
    lat: { type: Number },
    lng: { type: Number }
  },
  description: { type: String },
  capacityOfPersons: { type: Number, required: true },
  
  // Enhanced pricing structure
  pricing: {
    // Daily rates
    pricePerAdultDay: { type: Number, default: 0 },
    pricePerKidDay: { type: Number, default: 0 },
    
    // Night stay rates (accommodation)
    pricePerPersonNight: { type: Number, default: 0 },
    
    // Food packages
    foodPackages: [{
      name: { 
        type: String, 
        required: true,
        default: "Food Package" 
      },
      description: { type: String },
      pricePerAdult: { type: Number, default: 0 },
      pricePerKid: { type: Number, default: 0 },
      isActive: { type: Boolean, default: true }
    }],
    extraPersonCharge: { type: Number, default: 0 },
  },
  
  propertyDetails: {
    bedrooms: { type: Number },
    acBedrooms: { type: Number },
    nonAcBedrooms: { type: Number },
    kitchens: { type: Number },
    livingRooms: { type: Number },
    halls: { type: Number },
    bathrooms: { type: Number },
    swimmingPools: { type: Number },
    privateRooms: { type: Number },
    withFood: { type: Boolean, default: false },
    nightStay: { type: Boolean, default: false },
  },
  
  amenities: [{ type: String }],

  // Pool Party Configuration
  poolPartyConfig: {
    hasPoolParty: { type: Boolean, default: false },
    poolPartyType: {
      type: String,
      enum: ["shared", "private", "none"],
      default: "none"
    },
    sharedPoolPartyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PoolParty"
    },
    privatePoolPartyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PoolParty"
    },
    isSharedPoolCreatedFromHere: { 
      type: Boolean, 
      default: false 
    },
    isPrivatePoolCreatedFromHere: { 
      type: Boolean, 
      default: false 
    },
    isConfirmedForPoolPartyBooking: { 
      type: Boolean, 
      default: false 
    }
  },
  
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Location", LocationSchema);