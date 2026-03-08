import express from "express";
import mongoose from "mongoose";
import {
  createPoolParty,
  updatePoolParty,
  getPoolPartyByLocationId,
  getPoolPartyById,
  deletePoolParty,
  checkPoolPartyAvailability,
  createPoolPartyBooking,
  getAllSessionsAvailability,
  updatePoolPartyPaymentStatus,
  markPoolPartyAsPaid,
  // Add the new imports
  getPoolPartyBookings,
  updatePoolPartyBooking,
  deletePoolPartyBooking,
  getPoolPartys,
  getAllPoolParties,
  createSharedPoolParty,
  updateSharedPoolParty
} from "../controllers/PoolPartyController.js";
import { generatePoolPartyBookingPDF } from '../services/pdfService.js';
import PoolPartyBooking from "../models/PoolPartyBooking.js";

const router = express.Router();

router.post("/", createPoolParty);
router.get("/", getPoolPartys);
router.put("/:id", updatePoolParty);
router.get("/:id", getPoolPartyById); // This should be BEFORE location routes
router.delete("/:id", deletePoolParty);

// New routes for shared pool parties
router.get("/admin/all", getAllPoolParties); // Get all pool parties (admin)
router.post("/shared", createSharedPoolParty); // Create shared pool party
router.put("/shared/:id", updateSharedPoolParty); // Update shared pool party

// IMPORTANT: Move these BEFORE the dynamic routes
// Availability Routes
router.get("/check-availability/:locationId", checkPoolPartyAvailability); // Changed route
router.get("/sessions-availability/:locationId", getAllSessionsAvailability); // Changed route

// Location-specific route (keep after availability routes)
router.get("/location/:locationId", getPoolPartyByLocationId);

// Booking Routes
router.get("/bookings/all", getPoolPartyBookings); // Changed route
router.post("/bookings", createPoolPartyBooking);

// Add this route ABOVE the PDF download route and BELOW the other booking routes
router.get("/bookings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid booking ID format" 
      });
    }
    
    const booking = await PoolPartyBooking.findById(id)
      .populate('poolPartyId', 'locationName timings totalCapacity')
      .populate('locationId', 'name address city state');
    
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: "Booking not found" 
      });
    }
    
    res.json({
      success: true,
      booking
    });
    
  } catch (err) {
    console.error('Get single booking error:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

router.put("/bookings/:id", updatePoolPartyBooking);
router.delete("/bookings/:id", deletePoolPartyBooking);
router.patch('/bookings/:id/payment-status', updatePoolPartyPaymentStatus);
router.patch('/bookings/:id/mark-paid', markPoolPartyAsPaid);

// PDF Download Route
router.get('/:id/download-pdf', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or missing booking ID format'
      });
    }

    const booking = await PoolPartyBooking.findById(id)
     .populate({
        path: 'poolPartyId',
        populate: {
          path: 'locationId',
          select: 'name address'
        }
      });
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Pool party booking not found'
      });
    }
    if (!booking.poolPartyId) {
      return res.status(409).json({
        success: false,
        error: 'Pool party configuration is missing (orphaned booking reference)'
      });
    }
    
    const pdfBuffer = await generatePoolPartyBookingPDF(booking, booking.poolPartyId);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=poolparty-booking-${booking._id}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Pool party PDF download error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF'
    });
  }
});

export default router;