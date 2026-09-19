import mongoose from "mongoose";

const CouponSchema = new mongoose.Schema(
  {
    // The code the customer / admin types in (always stored uppercase)
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    // Flat percentage taken off the booking total (e.g. 10, 20, 25)
    discountPercent: {
      type: Number,
      required: true,
      min: 0.01,
      max: 100,
    },

    description: {
      type: String,
      trim: true,
    },

    // Admin can switch a coupon on/off without deleting it
    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Coupon", CouponSchema);
