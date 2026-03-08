// models/Payment.js
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    // Reference to either Booking or PoolPartyBooking
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    bookingType: {
      type: String,
      enum: ["booking", "poolparty"],
      required: true,
      default: "booking"
    },
    
    razorpayOrderId: { 
      type: String, 
      required: true,
      index: true,
      unique: true
    },
    razorpayPaymentId: { 
      type: String,
      index: true
    },
    razorpaySignature: { type: String },
    
    amount: { 
      type: Number, 
      required: true 
    },
    currency: { 
      type: String, 
      default: "INR" 
    },
    
    status: {
      type: String,
      enum: ["created", "paid", "failed", "refunded", "partially_refunded"],
      default: "created",
    },
    
    // Payment method details
    paymentType: {
      type: String,
      enum: ["razorpay", "admin", "cash", "card", "upi"],
      default: "razorpay"
    },
    
    // User information
    userEmail: { 
      type: String, 
      required: true 
    },
    userPhone: { 
      type: String, 
      required: true 
    },
    userName: { type: String },
    
    // Refund fields
    refundAmount: { type: Number },
    refundNotes: { type: String },
    refundedAt: { type: Date },
    razorpayRefundId: { type: String },
    
    // Error details for failed payments
    errorDetails: { type: String },
    
    // ADMIN-ONLY FIELDS
    adminNotes: { type: String },
    updatedBy: { 
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin" 
    },
    isRetry: { 
      type: Boolean, 
      default: false 
    },
    originalPaymentId: { 
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment" 
    },
    isApplied: {
      type: Boolean,
      default: false
    },
    
    // Additional metadata for pool party bookings
    metadata: {
      session: { type: String }, // For pool party: 'Morning', 'Evening', 'Full Day'
      bookingDate: { type: Date }, // For pool party booking date
      totalGuests: { type: Number }, // For pool party guest count
      locationName: { type: String }
    }
  },
  { 
    timestamps: true 
  }
);

// Indexes for better query performance
paymentSchema.index({ bookingId: 1, bookingType: 1 }); // Composite index
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: 1 });
paymentSchema.index({ razorpayOrderId: 1, razorpayPaymentId: 1 });
paymentSchema.index({ isRetry: 1 });
paymentSchema.index({ bookingType: 1, status: 1 }); // New composite index
paymentSchema.index({ "metadata.session": 1 }); // Index for pool party sessions
paymentSchema.index({ "metadata.bookingDate": 1 }); // Index for booking dates

// Virtual for formatted amount
paymentSchema.virtual('formattedAmount').get(function() {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: this.currency
  }).format(this.amount);
});

// Virtual for payment age (how long since created)
paymentSchema.virtual('paymentAge').get(function() {
  return Date.now() - this.createdAt;
});

// Virtual to get booking reference based on type
paymentSchema.virtual('bookingRef', {
  ref: function(doc) {
    return doc.bookingType === 'poolparty' ? 'PoolPartyBooking' : 'Booking';
  },
  localField: 'bookingId',
  foreignField: '_id',
  justOne: true
});

// Method to check if payment is for pool party
paymentSchema.methods.isPoolPartyPayment = function() {
  return this.bookingType === 'poolparty';
};

// Method to check if payment is for regular booking
paymentSchema.methods.isRegularBookingPayment = function() {
  return this.bookingType === 'booking';
};

// Method to get appropriate reference path for population
paymentSchema.methods.getBookingRefPath = function() {
  return this.bookingType === 'poolparty' ? 'poolPartyBookingId' : 'bookingId';
};

// Static method to find payments by booking type
paymentSchema.statics.findByBookingType = function(bookingType) {
  return this.find({ bookingType });
};

// Static method to find pool party payments
paymentSchema.statics.findPoolPartyPayments = function() {
  return this.find({ bookingType: 'poolparty' });
};

// Static method to find regular booking payments
paymentSchema.statics.findRegularPayments = function() {
  return this.find({ bookingType: 'booking' });
};

// Pre-save middleware to validate based on booking type
paymentSchema.pre('save', function(next) {
  if (this.bookingType === 'poolparty') {
    // Validate pool party specific fields
    if (!this.metadata || !this.metadata.session) {
      return next(new Error('Pool party payments require session metadata'));
    }
  }
  
  // Ensure user email and phone are present
  if (!this.userEmail || !this.userPhone) {
    return next(new Error('User email and phone are required'));
  }
  
  next();
});

// Method to populate booking based on type
paymentSchema.methods.populateBooking = async function() {
  const Model = this.bookingType === 'poolparty' 
    ? mongoose.model('PoolPartyBooking') 
    : mongoose.model('Booking');
  
  return await Model.findById(this.bookingId);
};

export default mongoose.model("Payment", paymentSchema);