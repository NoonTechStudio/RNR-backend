import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import BookedSlot from "../models/BookedSlot.js";
import PoolPartyBooking from "../models/PoolPartyBooking.js";
import { razorpayInstance } from "../config/razorpay.js";
import { calculateRefund } from "../utils/cancellationPolicy.js";

// Statuses that mean the customer's money has actually been received.
const PAID_STATUSES = ["partially_paid", "paid"];

/**
 * Online (Razorpay) payments recorded for a booking that can still be refunded.
 */
const getRefundableOnlinePayments = async (bookingId) => {
  const payments = await Payment.find({
    bookingId,
    bookingType: "booking",
    // The verify step stores "partially_paid"; the webhook stores "paid".
    status: { $in: ["paid", "partially_paid"] },
    razorpayPaymentId: /^pay_/,
  }).sort({ createdAt: 1 });

  return payments
    .map((p) => ({
      doc: p,
      available: Math.max(0, (p.amount || 0) - (p.refundAmount || 0)),
    }))
    .filter((p) => p.available > 0);
};

/**
 * What would happen if this booking were cancelled right now?
 */
export const getRefundQuote = async (booking, now = new Date()) => {
  const paidAmount = PAID_STATUSES.includes(booking.paymentStatus)
    ? booking.amountPaid || 0
    : 0;

  const quote = calculateRefund({ booking, paidAmount, now });

  const onlinePayments = await getRefundableOnlinePayments(booking._id);
  const onlineAvailable = onlinePayments.reduce((sum, p) => sum + p.available, 0);

  // The part of the refund that can go back through Razorpay; anything beyond
  // that (cash / manually recorded payments) has to be returned by staff.
  const onlineRefundable = Math.min(quote.refundAmount, onlineAvailable);

  return {
    ...quote,
    onlineRefundable,
    manualRefundable: quote.refundAmount - onlineRefundable,
  };
};

/**
 * Cancel a booking, refund according to the policy, and free its dates.
 *
 * Order matters: the Razorpay refund is attempted BEFORE anything is changed,
 * so a failed refund leaves the booking exactly as it was and can be retried.
 */
export const cancelBookingWithRefund = async ({
  bookingId,
  adminId,
  reason = "",
  processOnlineRefund = true,
}) => {
  const now = new Date();

  // 1. Atomically claim the booking so two clicks / two admins can never
  //    refund the same booking twice.
  const claimed = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      paymentStatus: { $ne: "cancelled" },
      "cancellation.cancelledAt": { $exists: false },
    },
    {
      $set: {
        "cancellation.cancelledAt": now,
        "cancellation.refundStatus": "in_progress",
      },
    },
    { new: true }
  ).populate("location");

  if (!claimed) {
    const err = new Error("This booking is already cancelled (or being cancelled).");
    err.statusCode = 409;
    throw err;
  }

  const releaseClaim = () =>
    Booking.updateOne(
      { _id: bookingId },
      { $unset: { "cancellation.cancelledAt": "", "cancellation.refundStatus": "" } }
    );

  let quote;
  const razorpayRefunds = [];
  let refundedOnline = 0;
  let onlineError = null;

  try {
    // Use the state as it was before we claimed it (payment status unchanged).
    quote = await getRefundQuote(claimed, now);

    // 2. Online refund via Razorpay
    if (processOnlineRefund && quote.onlineRefundable > 0) {
      const payments = await getRefundableOnlinePayments(claimed._id);
      let remaining = quote.onlineRefundable;

      for (const { doc, available } of payments) {
        if (remaining <= 0) break;
        const amount = Math.min(available, remaining);

        try {
          const refund = await razorpayInstance.payments.refund(doc.razorpayPaymentId, {
            amount: Math.round(amount * 100), // paise
            speed: "normal",
            notes: {
              bookingId: claimed._id.toString(),
              reason: "Booking cancellation",
            },
          });

          razorpayRefunds.push({
            refundId: refund.id,
            paymentId: doc.razorpayPaymentId,
            amount,
            status: refund.status,
          });
          refundedOnline += amount;
          remaining -= amount;

          const totalRefunded = (doc.refundAmount || 0) + amount;
          await Payment.updateOne(
            { _id: doc._id },
            {
              $set: {
                status: totalRefunded >= doc.amount ? "refunded" : "partially_refunded",
                refundAmount: totalRefunded,
                refundNotes: reason || "Booking cancellation",
                refundedAt: new Date(),
                razorpayRefundId: refund.id,
              },
            }
          );
        } catch (refundErr) {
          const message =
            refundErr?.error?.description || refundErr?.message || "Unknown Razorpay error";
          if (razorpayRefunds.length === 0) {
            // Nothing has moved yet – abort cleanly so the admin can retry.
            throw Object.assign(new Error(`Razorpay refund failed: ${message}`), {
              statusCode: 502,
            });
          }
          onlineError = message; // part refunded already – finish the cancellation
          break;
        }
      }
    }
  } catch (err) {
    await releaseClaim();
    throw err;
  }

  // 3. Whatever was not returned online must be settled by staff
  const manualRefundDue = Math.max(0, quote.refundAmount - refundedOnline);
  let refundStatus = "processed";
  if (quote.refundAmount === 0) refundStatus = "not_applicable";
  else if (manualRefundDue > 0) refundStatus = "pending_manual";

  // 4. Record the cancellation
  const cancelled = await Booking.findByIdAndUpdate(
    bookingId,
    {
      $set: {
        paymentStatus: "cancelled",
        cancellation: {
          cancelledAt: now,
          cancelledBy: adminId,
          reason,
          hoursBeforeCheckIn: quote.hoursBeforeCheckIn,
          refundPercent: quote.refundPercent,
          paidAmount: quote.paidAmount,
          refundAmount: quote.refundAmount,
          retainedAmount: quote.retainedAmount,
          refundStatus,
          refundedOnline,
          manualRefundDue,
          razorpayRefunds,
        },
      },
    },
    { new: true }
  ).populate("location");

  // 5. Free the dates and drop auto-created pool party bookings
  await BookedSlot.deleteMany({ bookingId });
  await PoolPartyBooking.deleteMany({
    mainBookingId: bookingId,
    isIncludedInLocationBooking: true,
  });

  return { booking: cancelled, quote, refundedOnline, manualRefundDue, refundStatus, onlineError };
};
