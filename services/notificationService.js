// services/notificationService.js
import twilio from 'twilio';
import axios from 'axios';

// Initialize Twilio client for SMS
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Send SMS notification to user
 * @param {string} phoneNumber - User's phone number (with country code, e.g., +919725860193)
 * @param {string} message - SMS message content
 * @returns {Promise<boolean>} - Success status
 */
export const sendSMSNotification = async (phoneNumber, message) => {
  try {
    // Use messaging service instead of from phone number
    const sms = await twilioClient.messages.create({
      body: message,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID, // Add this to your .env
      to: phoneNumber.startsWith('+') ? phoneNumber : `+1${phoneNumber}`
    });

    console.log(`✅ SMS sent to ${phoneNumber}, SID: ${sms.sid}`);
    return true;
  } catch (error) {
    console.error('❌ SMS sending failed:', error.message);
    return false;
  }
};


/**
 * Send SMS for regular booking confirmation
 * @param {Object} booking - Booking object
 * @param {Object} location - Location object
 * @returns {Promise<boolean>} - Success status
 */
export const sendBookingConfirmationSMS = async (booking, location) => {
  try {
    const nights = Math.ceil((new Date(booking.checkOutDate) - new Date(booking.checkInDate)) / (1000 * 60 * 60 * 24));
    
    const message = `🎉 Booking Confirmed!\n\nRest & Relax - ${location.name}\nBooking ID: ${booking._id}\nCheck-in: ${new Date(booking.checkInDate).toLocaleDateString('en-IN')}\nCheck-out: ${new Date(booking.checkOutDate).toLocaleDateString('en-IN')}\nGuests: ${booking.adults}A ${booking.kids}K\nTotal: ₹${booking.pricing.totalPrice.toLocaleString()}\n\nPayment: ${booking.paymentType === 'token' ? 'Token' : 'Full'}\nAmount Paid: ₹${booking.amountPaid.toLocaleString()}\nRemaining: ₹${booking.remainingAmount.toLocaleString()}\n\n📍 ${location.address.line1}, ${location.address.city}\n📞 +91 90990 48961\n\nThank you for choosing Rest & Relax!`;

    return await sendSMSNotification(booking.phone, message);
  } catch (error) {
    console.error('❌ Booking SMS failed:', error);
    return false;
  }
};


/**
 * Send SMS for pool party booking confirmation
 * @param {Object} booking - PoolPartyBooking object
 * @param {Object} poolParty - PoolParty object
 * @returns {Promise<boolean>} - Success status
 */
export const sendPoolPartyConfirmationSMS = async (booking, poolParty) => {
  try {
    const sessionTiming = poolParty.timings?.find(t => t.session === booking.session);
    const timeRange = sessionTiming ? `${sessionTiming.startTime} - ${sessionTiming.endTime}` : '';
    
    const message = `🎉 Pool Party Booking Confirmed!\n\nRest & Relax - ${poolParty.locationName}\nBooking ID: ${booking._id}\nDate: ${new Date(booking.bookingDate).toLocaleDateString('en-IN')}\nSession: ${booking.session}\nTime: ${timeRange}\nGuests: ${booking.adults}A ${booking.kids}K\nTotal Amount: ₹${booking.pricing.totalPrice.toLocaleString()}\n\n📍 Please arrive 15 mins before session\n📞 +91 90990 48961\n\nThank you for choosing Rest & Relax Pool Party!`;

    return await sendSMSNotification(booking.phone, message);
  } catch (error) {
    console.error('❌ Pool party SMS failed:', error);
    return false;
  }
};




/**
 * Send both SMS and WhatsApp notifications (recommended)
 * @param {Object} data - Booking data
 * @param {Object} location - Location/PoolParty data
 * @param {string} type - 'booking' or 'poolparty'
 * @returns {Promise<Object>} - Results for both channels
 */
export const sendAllNotifications = async (data, location, type = 'booking') => {
  const results = {
    sms: false,
    whatsapp: false // WhatsApp will remain false
  };

  try {
    if (type === 'booking') {
      // Send only SMS for regular booking
      results.sms = await sendBookingConfirmationSMS(data, location);
      // WhatsApp commented out: results.whatsapp = await sendBookingConfirmationWhatsApp(data, location);
    } else if (type === 'poolparty') {
      // Send only SMS for pool party
      results.sms = await sendPoolPartyConfirmationSMS(data, location);
      // WhatsApp commented out: results.whatsapp = await sendPoolPartyConfirmationWhatsApp(data, location);
    }

    console.log(`📱 SMS notification: ${results.sms ? '✅' : '❌'}`);
    return results;
  } catch (error) {
    console.error('❌ Notification service error:', error);
    return results;
  }
};