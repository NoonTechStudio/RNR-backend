// controllers/webhookController.js
import crypto from 'crypto';
import Payment from '../models/Payment.js';
import Booking from '../models/Booking.js';

export const handleWebhook = async (req, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookBody = JSON.stringify(req.body);
    
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(webhookBody)
      .digest('hex');

    if (expectedSignature !== webhookSignature) {
      console.error('❌ Webhook signature verification failed');
      return res.status(400).json({ success: false, error: 'Invalid signature' });
    }

    const { event, payload } = req.body;
    console.log(`🔄 Processing webhook: ${event}`);

    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload.payment.entity);
        break;
      case 'payment.failed':
        await handlePaymentFailed(payload.payment.entity);
        break;
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('💥 Webhook error:', error);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
};

const handlePaymentCaptured = async (paymentEntity) => {
  const payment = await Payment.findOneAndUpdate(
    { razorpayOrderId: paymentEntity.order_id },
    {
      status: 'paid',
      razorpayPaymentId: paymentEntity.id,
      updatedAt: new Date()
    }
  ).populate('bookingId');

  if (payment && payment.bookingId) {
    await Booking.findByIdAndUpdate(
      payment.bookingId._id,
      {
        paymentStatus: 'paid',
        razorpayPaymentId: paymentEntity.id
      }
    );
    console.log(`✅ Payment captured for booking: ${payment.bookingId._id}`);
  }
};

const handlePaymentFailed = async (paymentEntity) => {
  const payment = await Payment.findOneAndUpdate(
    { razorpayOrderId: paymentEntity.order_id },
    {
      status: 'failed',
      errorDetails: paymentEntity.error_description || 'Payment failed',
      updatedAt: new Date()
    }
  ).populate('bookingId');

  if (payment && payment.bookingId) {
    await Booking.findByIdAndUpdate(
      payment.bookingId._id,
      { paymentStatus: 'failed' }
    );
    console.log(`❌ Payment failed for booking: ${payment.bookingId._id}`);
  }
};