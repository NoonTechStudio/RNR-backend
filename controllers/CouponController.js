import Coupon from "../models/Coupon.js";
import {
  normalizeCouponCode,
  computeDiscountAmount,
  resolveCouponForBooking,
} from "../utils/couponUtils.js";

// ==========================================================================
// PUBLIC – validate a coupon code before it is applied to a booking
// ==========================================================================
export const validateCoupon = async (req, res) => {
  try {
    const { code, locationId, poolPartyId, bookingDate, subtotal } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, error: "Coupon code is required" });
    }

    const result = await resolveCouponForBooking({
      couponCode: code,
      subtotal: Number(subtotal) || 0,
      locationId,
      poolPartyId,
      checkInDate: bookingDate,
    });

    if (!result) {
      return res.status(400).json({ success: false, error: "Invalid or inactive coupon code." });
    }

    return res.json({
      success: true,
      data: {
        code: result.couponCode,
        discountPercent: result.discountPercent,
        discountAmount: result.discountAmount,
      },
    });
  } catch (error) {
    // resolveCouponForBooking throws user-facing messages for the expected cases
    return res.status(400).json({ success: false, error: error.message });
  }
};

// ==========================================================================
// ADMIN – CRUD
// ==========================================================================
export const getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json({ success: true, data: coupons });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.couponId);
    if (!coupon) {
      return res.status(404).json({ success: false, error: "Coupon not found" });
    }
    res.json({ success: true, data: coupon });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createCoupon = async (req, res) => {
  try {
    const { code, discountPercent, description, isActive } = req.body;

    if (!code || !discountPercent) {
      return res.status(400).json({
        success: false,
        error: "code and discountPercent are required",
      });
    }

    const pct = Number(discountPercent);
    if (Number.isNaN(pct) || pct <= 0 || pct > 100) {
      return res.status(400).json({
        success: false,
        error: "discountPercent must be greater than 0 and at most 100",
      });
    }

    const normalized = normalizeCouponCode(code);
    const existing = await Coupon.findOne({ code: normalized });
    if (existing) {
      return res.status(409).json({ success: false, error: "A coupon with this code already exists" });
    }

    const coupon = new Coupon({
      code: normalized,
      discountPercent: Math.round(pct * 100) / 100,
      description: description || "",
      isActive: isActive !== undefined ? !!isActive : true,
      createdBy: req.admin?._id,
    });

    await coupon.save();
    res.status(201).json({ success: true, data: coupon, message: "Coupon created successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    const { code, discountPercent, description, isActive } = req.body;

    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      return res.status(404).json({ success: false, error: "Coupon not found" });
    }

    if (code !== undefined) {
      const normalized = normalizeCouponCode(code);
      if (normalized !== coupon.code) {
        const clash = await Coupon.findOne({ code: normalized, _id: { $ne: couponId } });
        if (clash) {
          return res.status(409).json({ success: false, error: "A coupon with this code already exists" });
        }
        coupon.code = normalized;
      }
    }

    if (discountPercent !== undefined) {
      const pct = Number(discountPercent);
      if (Number.isNaN(pct) || pct <= 0 || pct > 100) {
        return res.status(400).json({
          success: false,
          error: "discountPercent must be greater than 0 and at most 100",
        });
      }
      coupon.discountPercent = Math.round(pct * 100) / 100;
    }

    if (description !== undefined) coupon.description = description;
    if (isActive !== undefined) coupon.isActive = !!isActive;

    await coupon.save();
    res.json({ success: true, data: coupon, message: "Coupon updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.couponId);
    if (!coupon) {
      return res.status(404).json({ success: false, error: "Coupon not found" });
    }
    res.json({ success: true, message: "Coupon deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Re-export helper for other controllers if needed
export { computeDiscountAmount };
