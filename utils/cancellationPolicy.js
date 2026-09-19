// Single source of truth for the LOCATION booking cancellation & refund policy.
//
// The refund percentage is applied to the amount the customer has actually paid
// for the booking (the token / advance, or the full amount if paid in full).
// Tiers are measured against the booking's check-in date + time (India time).

// India has no daylight saving, so a fixed offset is safe.
const IST_OFFSET_MINUTES = 330;

const HOUR = 60 * 60 * 1000;

// Ordered from the most generous to the least. `minHoursBefore` is the minimum
// number of hours between the cancellation request and check-in for the tier.
export const CANCELLATION_TIERS = [
  {
    minHoursBefore: 7 * 24,
    refundPercent: 100,
    label: "7 days or more before check-in",
    shortLabel: "7+ days before",
  },
  {
    minHoursBefore: 3 * 24,
    refundPercent: 50,
    label: "3 days to less than 7 days before check-in",
    shortLabel: "3 to 7 days before",
  },
  {
    minHoursBefore: 48,
    refundPercent: 25,
    label: "48 hours to less than 3 days before check-in",
    shortLabel: "48 hrs to 3 days before",
  },
  {
    minHoursBefore: -Infinity,
    refundPercent: 0,
    label: "Less than 48 hours before check-in",
    shortLabel: "under 48 hrs before",
  },
];

export const REFUND_TIMELINE_NOTE =
  "Refunds are issued to the original payment method, typically within 5–7 working days.";

/**
 * The moment the guest is due to check in, as a real Date (UTC instant).
 * `checkInDate` is stored as UTC midnight of the chosen calendar date and
 * `checkInTime` is a string such as "10:00 AM".
 */
export const getCheckInMoment = (booking) => {
  const d = new Date(booking.checkInDate);
  let hours = 10;
  let minutes = 0;

  const match = String(booking.checkInTime || "10:00 AM").match(
    /(\d{1,2}):(\d{2})\s*(AM|PM)/i
  );
  if (match) {
    hours = parseInt(match[1], 10) % 12;
    minutes = parseInt(match[2], 10);
    if (match[3].toUpperCase() === "PM") hours += 12;
  }

  const utcMs = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    hours,
    minutes
  );
  return new Date(utcMs - IST_OFFSET_MINUTES * 60 * 1000);
};

export const getRefundTier = (hoursBeforeCheckIn) =>
  CANCELLATION_TIERS.find((tier) => hoursBeforeCheckIn >= tier.minHoursBefore);

/**
 * Work out the refund for cancelling `booking` at time `now`.
 * `paidAmount` is the amount actually collected against the booking.
 */
export const calculateRefund = ({ booking, paidAmount, now = new Date() }) => {
  const checkInAt = getCheckInMoment(booking);
  const hoursBeforeCheckIn = (checkInAt.getTime() - now.getTime()) / HOUR;
  const tier = getRefundTier(hoursBeforeCheckIn);

  const paid = Math.max(0, Number(paidAmount) || 0);
  const refundAmount = Math.round((paid * tier.refundPercent) / 100);

  return {
    checkInAt,
    hoursBeforeCheckIn: Math.round(hoursBeforeCheckIn * 10) / 10,
    refundPercent: tier.refundPercent,
    tierLabel: tier.label,
    paidAmount: paid,
    refundAmount,
    retainedAmount: paid - refundAmount,
  };
};

// ---------------------------------------------------------------------------
// Human-readable text (T&C, PDF, emails) generated from the tiers above so the
// wording can never drift from the actual logic.
// ---------------------------------------------------------------------------
export const getPolicyLines = () =>
  CANCELLATION_TIERS.map(
    (tier) =>
      `${tier.label}: ${
        tier.refundPercent > 0 ? `${tier.refundPercent}% refund` : "no refund"
      }`
  );

export const CANCELLATION_TERM_TITLE = "Booking Cancellation & Refund Policy";

export const getCancellationTermDescription = () =>
  [
    "Refund is calculated on the amount paid for the booking, based on when the cancellation is requested before the check-in date and time:",
    ...getPolicyLines().map((line) => `• ${line}`),
    "Cancellations must be requested by contacting Rest & Relax (+91 90990 48961). " +
      REFUND_TIMELINE_NOTE,
  ].join("\n");
