import express from "express";
import {
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  deleteBooking,
  getBookedDates, // ADD THIS
  updatePaymentStatus,
  getBookingsByPaymentType,
  getPaymentAnalytics
} from "../controllers/BookingController.js";
import { generateBookingPDF } from '../services/pdfService.js';
import Booking from "../models/Booking.js";


const router = express.Router();

router.post("/", createBooking);
router.get("/", getBookings);
router.get("/:id", getBookingById);
router.put("/:id", updateBooking);
router.delete("/:id", deleteBooking);
router.get("/dates/:locationId", getBookedDates); // ADD THIS ROUTE
router.patch('/:id/payment-status', updatePaymentStatus);
router.get('/payment-type/:paymentType', getBookingsByPaymentType);
router.get('/analytics/payments', getPaymentAnalytics);

router.get('/:id/download-pdf', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('location');
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: 'Booking not found' 
      });
    }

    const pdfBuffer = await generateBookingPDF(booking, booking.location);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=booking-confirmation-${booking._id}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF download error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate PDF' 
    });
  }
});

export default router;