import mongoose from "mongoose";

const BookingSchema = new mongoose.Schema({
  location: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },

  locationSnapshot: {
    name: { type: String },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
    },
    amenities: [String],
  },

  checkInDate: { type: Date, required: true },
  checkOutDate: { type: Date, required: true },

  checkInTime: { 
    type: String, 
    default: "10:00 AM" 
  },

  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: false },
  address: { type: String, required: true },
  adults: { type: Number, default: 1 },
  kids: { type: Number, default: 0 },
  
  // Food service with package selection
  withFood: { type: Boolean, default: false },
  foodPackage: {
    packageId: { type: String },
    name: String,
    pricePerAdult: Number,
    pricePerKid: Number,
    description: String
  },
  
  // Store daily food package selection for multi-day bookings
  dailyFoodPackages: [{
    date: Date,
    packageId: String,
    name: String,
    pricePerAdult: Number,
    pricePerKid: Number,
    description: String
  }],
  
  // Same-day checkout flag
  sameDayCheckout: { type: Boolean, default: false },
  
  // Enhanced pricing structure - MATCHING NEW DATA STRUCTURE
  pricing: {
    // Night stay pricing
    pricePerPersonNight: { type: Number, default: 0 },
    
    // Day picnic pricing
    pricePerAdultDay: { type: Number, default: 0 },
    pricePerKidDay: { type: Number, default: 0 },
    
    selectedFoodPackage: {
      packageId: String,
      name: String,
      pricePerAdult: Number,
      pricePerKid: Number,
      description: String
    },
    
    // Store price breakdown for each day
    dailyBreakdown: [{
      date: Date,
      accommodationPrice: Number,
      foodPrice: Number,
      extraCharges: Number
    }],
    
    // Extra charges
    extraPersonCharge: { type: Number, default: 0 },
    
    // Calculated prices
    accommodationPrice: { type: Number, default: 0 },
    foodPackagePrice: { type: Number, default: 0 },

    // Discount coupon (snapshot – stays fixed even if the coupon is later changed)
    subtotal: { type: Number, default: 0 },        // price before any coupon discount
    couponCode: { type: String, default: "" },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },

    totalPrice: { type: Number, required: true },  // final payable = subtotal - discountAmount
    
    // Duration
    nights: { type: Number, default: 0 },
    days: { type: Number, default: 0 }
  },
  
  paymentType: { type: String, enum: ["full", "token"], default: "token" },
  amountPaid: { type: Number, default: 0 },
  remainingAmount: { type: Number, default: 0 },

  paymentStatus: { 
    type: String, 
    enum: ["pending", "partially_paid", "paid", "failed", "cancelled"], 
    default: "pending" 
  },

  // Cancellation & refund details (only present once a booking is cancelled)
  cancellation: {
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    reason: { type: String },
    hoursBeforeCheckIn: { type: Number },
    refundPercent: { type: Number },
    paidAmount: { type: Number },      // amount collected at time of cancellation
    refundAmount: { type: Number },    // amount to be returned as per policy
    retainedAmount: { type: Number },  // amount kept as per policy
    refundStatus: {
      type: String,
      enum: ['in_progress', 'not_applicable', 'processed', 'pending_manual'],
    },
    refundedOnline: { type: Number },
    manualRefundDue: { type: Number },
    razorpayRefunds: {
      type: [{
        refundId: String,
        paymentId: String,
        amount: Number,
        status: String,
      }],
      default: undefined, // keep new (non-cancelled) bookings free of empty arrays
    },
  },
  
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },

  markedPaidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Caretaker'
  },
  markedPaidAt: {
    type: Date
  },
  
  createdAt: { type: Date, default: Date.now },
});

// Index for check-in date
BookingSchema.index({ location: 1, checkInDate: 1 });

// Virtual to calculate nights
BookingSchema.virtual('nights').get(function() {
  if (!this.checkInDate || !this.checkOutDate) return 0;
  const diff = new Date(this.checkOutDate) - new Date(this.checkInDate);
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

export default mongoose.model("Booking", BookingSchema);