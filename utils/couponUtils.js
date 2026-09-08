import Coupon from "../models/Coupon.js";
import { getActiveOfferForLocation } from "./offerUtils.js";

/**
 * Normalize a raw coupon code the way it is stored (uppercase, trimmed).
 */
export const normalizeCouponCode = (code) =>
  code ? String(code).trim().toUpperCase() : "";

/**
 * Fetch an active coupon by its code. Returns null when the code is empty,
 * unknown, or currently switched off.
 */
export const findActiveCoupon = async (code) => {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return null;
  return Coupon.findOne({ code: normalized, isActive: true });
};

/**
 * Percentage discount, rounded to the nearest rupee.
 */
export const computeDiscountAmount = (subtotal, discountPercent) => {
  const base = Number(subtotal) || 0;
  const pct = Number(discountPercent) || 0;
  if (base <= 0 || pct <= 0) return 0;
  return Math.round((base * pct) / 100);
};

/**
 * Resolve a coupon for a booking.
 *
 * Rules:
 *  - Empty code  -> no discount (returns null, no error).
 *  - A special Offer is already active for this location/date -> rejected
 *    (coupons never stack on top of Offers).
 *  - Unknown or inactive code -> rejected.
 *
 * `offerActive` can be passed directly when the caller already knows whether an
 * Offer applies (avoids a second DB lookup). Otherwise it is derived from
 * locationId + checkInDate.
 *
 * Returns { couponCode, discountPercent, discountAmount } or null.
 * Throws an Error (with a user-facing message) when the code is not usable.
 */
export const resolveCouponForBooking = async ({
  couponCode,
  subtotal,
  locationId,
  checkInDate,
  offerActive,
}) => {
  const normalized = normalizeCouponCode(couponCode);
  if (!normalized) return null;

  let hasActiveOffer = offerActive;
  if (hasActiveOffer === undefined && locationId && checkInDate) {
    const offer = await getActiveOfferForLocation(locationId, checkInDate);
    hasActiveOffer = !!offer;
  }

  if (hasActiveOffer) {
    throw new Error(
      "A special offer is already active for these dates, so a coupon cannot be applied."
    );
  }

  const coupon = await findActiveCoupon(normalized);
  if (!coupon) {
    throw new Error("Invalid or inactive coupon code.");
  }

  return {
    couponCode: coupon.code,
    discountPercent: coupon.discountPercent,
    discountAmount: computeDiscountAmount(subtotal, coupon.discountPercent),
  };
};
