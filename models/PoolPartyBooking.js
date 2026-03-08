import mongoose from "mongoose";

const PoolPartyBookingSchema = new mongoose.Schema({
  poolPartyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PoolParty',
    required: true
  },
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  guestName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  bookingDate: {
    type: Date,
    required: true
  },
  session: {
    type: String,
    enum: ['Morning', 'Evening', 'Full Day'],
    required: true
  },
  adults: {
    type: Number,
    required: true,
    min: 1
  },
  kids: {
    type: Number,
    default: 0
  },
  totalGuests: {
    type: Number,
    required: true
  },
  
  // Enhanced pricing structure
  pricing: {
    pricePerAdult: { type: Number, required: true },
    pricePerKid: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    // ✅ ADD: Food package pricing breakdown
    foodPackagePrice: { type: Number, default: 0 }
  },
  
  // Payment type and amounts
  paymentType: {
    type: String,
    enum: ['full', 'token'],
    default: 'full'
  },
  amountPaid: {
    type: Number,
    default: 0
  },
  remainingAmount: {
    type: Number,
    default: 0
  },
  
  // Payment status
  paymentStatus: {
    type: String,
    enum: ['pending', 'partially_paid', 'paid', 'failed','location-booking'],
    default: 'pending'
  },
  isIncludedInBooking: {
    type: Boolean,
    default: false
  },
  
  // Payment gateway fields
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  
  // Track if booking is from location booking
  isIncludedInLocationBooking: {
    type: Boolean,
    default: false
  },
  mainBookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  foodFromLocation: {
    type: Boolean,
    default: false
  },
  
  // ✅ UPDATED: Enhanced food package structure
  withFood: { type: Boolean, default: false },
  foodPackage: {
    // Store the actual food package details
    foodPackageId: { type: String }, // Reference to pool party's selectedFoodPackages
    name: { type: String },
    pricePerAdult: { type: Number },
    pricePerKid: { type: Number },
    // Remove the enum constraint as we're storing actual data
  },
  
  // ✅ ADD: For auto-created bookings from location
  isAutoCreatedFromLocation: {
    type: Boolean,
    default: false
  },

  markedPaidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Caretaker'
  },
  
  markedPaidAt: {
      type: Date
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for better query performance
PoolPartyBookingSchema.index({ poolPartyId: 1, bookingDate: 1 });
PoolPartyBookingSchema.index({ locationId: 1 });
PoolPartyBookingSchema.index({ paymentStatus: 1 });
PoolPartyBookingSchema.index({ paymentType: 1 });
PoolPartyBookingSchema.index({ withFood: 1 }); // ✅ ADD: Index for food queries

// Virtual for payment summary
PoolPartyBookingSchema.virtual('paymentSummary').get(function() {
  return {
    type: this.paymentType,
    paid: this.amountPaid,
    remaining: this.remainingAmount,
    total: this.pricing.totalPrice,
    status: this.paymentStatus
  };
});

// ✅ ADD: Virtual for food package summary
PoolPartyBookingSchema.virtual('foodPackageSummary').get(function() {
  if (!this.withFood || !this.foodPackage) {
    return null;
  }
  return {
    name: this.foodPackage.name,
    pricePerAdult: this.foodPackage.pricePerAdult,
    pricePerKid: this.foodPackage.pricePerKid,
    totalFoodPrice: (this.foodPackage.pricePerAdult * this.adults) + 
                    (this.foodPackage.pricePerKid * this.kids)
  };
});

export default mongoose.model("PoolPartyBooking", PoolPartyBookingSchema);