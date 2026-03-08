import mongoose from "mongoose";

const PoolPartySchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ["shared", "private"],
    required: true,
    default: "private"
  },
  description: { type: String },
  
  // For shared pools: array of locations that share this pool
  sharedLocations: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location'
  }],
  
  // For private pools: single location
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location'
  },
  
  locationName: { type: String, required: true },
  
  // NEW: Selected food packages for pool party
  selectedFoodPackages: [{
    foodPackageId: { type: String }, // Reference to location's food package
    name: { type: String },
    pricePerAdult: { type: Number },
    pricePerKid: { type: Number }
  }],
  
  // Enhanced timings
  timings: [{
    session: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    capacity: { type: Number, required: true, min: 1 },
    pricing: {
      perAdult: { type: Number, required: true },
      perKid: { type: Number, required: true }
      // Food packages moved to pool party level instead of timing level
    }
  }],
  
  totalCapacity: {
    type: Number,
    default: function() {
      return this.timings.reduce((sum, timing) => sum + timing.capacity, 0);
    }
  },
  
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Helper function to compare dates (ignoring time)
const isSameDate = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};

// In PoolPartySchema.methods.getAvailableCapacity
PoolPartySchema.methods.getAvailableCapacity = async function(date, session, includeFoodCapacity = false) {
  const sessionConfig = this.timings.find(t => t.session === session);
  if (!sessionConfig) return 0;
  
  const checkDate = new Date(date);
  const startOfDay = new Date(checkDate.setHours(0, 0, 0, 0));
  const endOfDay = new Date(checkDate.setHours(23, 59, 59, 999));
  
  try {
    const PoolPartyBooking = mongoose.model('PoolPartyBooking');
    
    // Query all bookings for this date and session
    const bookingsOnDate = await PoolPartyBooking.find({
      poolPartyId: this._id,
      bookingDate: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      session: session
    });
    
    // Count only regular bookings for capacity
    let totalBooked = 0;
    
    bookingsOnDate.forEach(booking => {
      // ✅ FIX: Only count bookings that consume pool party capacity
      if (booking.isIncludedInLocationBooking) {
        // For location bookings, only count if they DON'T have food from location
        // OR if we're including food capacity
        if (!booking.withFood || booking.foodFromLocation === false) {
          totalBooked += booking.adults + booking.kids;
        }
      } else {
        // Regular pool party bookings always count
        totalBooked += booking.adults + booking.kids;
      }
    });
    
    return Math.max(0, sessionConfig.capacity - totalBooked);
  } catch (error) {
    console.error('Error calculating available capacity:', error);
    return 0;
  }
};

// Add this method to PoolPartySchema
PoolPartySchema.methods.getFoodPackageAvailability = async function(date, session) {
  const sessionConfig = this.timings.find(t => t.session === session);
  if (!sessionConfig) return { available: false, booked: 0, total: 0 };
  
  const checkDate = new Date(date);
  const startOfDay = new Date(checkDate.setHours(0, 0, 0, 0));
  const endOfDay = new Date(checkDate.setHours(23, 59, 59, 999));
  
  try {
    const PoolPartyBooking = mongoose.model('PoolPartyBooking');
    
    // Query bookings that have food packages
    const foodBookings = await PoolPartyBooking.find({
      poolPartyId: this._id,
      bookingDate: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      session: session,
      withFood: true
    });
    
    // Calculate food package bookings
    let foodBookedCount = 0;
    foodBookings.forEach(booking => {
      if (!booking.isIncludedInLocationBooking || booking.foodFromLocation === false) {
        // Only count bookings that actually ordered pool party food packages
        foodBookedCount += booking.adults + booking.kids;
      }
    });
    
    // Assume unlimited food packages (or set a limit if needed)
    const foodCapacity = 1000; // Large number to simulate unlimited
    return {
      available: (foodCapacity - foodBookedCount) > 0,
      booked: foodBookedCount,
      total: foodCapacity
    };
    
  } catch (error) {
    console.error('Error calculating food package availability:', error);
    return { available: true, booked: 0, total: 1000 };
  }
};

// Check if session is fully booked
PoolPartySchema.methods.isSessionAvailable = async function(date, session, guests) {
  const availableCapacity = await this.getAvailableCapacity(date, session);
  return availableCapacity >= guests;
};

// Get pricing for a specific session
PoolPartySchema.methods.getSessionPricing = function(session) {
  const sessionConfig = this.timings.find(t => t.session === session);
  return sessionConfig ? sessionConfig.pricing : null;
};

// Get locations using this pool
PoolPartySchema.methods.getLinkedLocations = async function() {
  if (this.type === 'shared') {
    return mongoose.model('Location').find({ 
      _id: { $in: this.sharedLocations }
    });
  } else {
    return mongoose.model('Location').find({ 
      _id: this.locationId 
    });
  }
};

// Check if location is linked to this pool
PoolPartySchema.methods.isLocationLinked = function(locationId) {
  if (this.type === 'shared') {
    return this.sharedLocations.some(id => id.toString() === locationId.toString());
  } else {
    return this.locationId && this.locationId.toString() === locationId.toString();
  }
};

export default mongoose.model("PoolParty", PoolPartySchema);