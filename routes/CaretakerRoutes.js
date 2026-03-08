import express from 'express';
import {
  registerCaretaker,
  loginCaretaker,
  getCaretakerBookings,
  updateBookingPaymentStatus,
  getCaretakerProfile,
  getCaretakerLocations,
  registerValidation,
  loginValidation,
  getAllCaretakers,
  getCaretakerById,
  updateCaretaker,
  deleteCaretaker
} from '../controllers/CaretakerController.js';
import {authenticateAdmin, authenticateCaretaker } from '../middleware/auth.js';
import { authLimiter, validateRequest, sanitizeInput } from '../middleware/security.js';

const router = express.Router();

// Public routes
router.post('/register',
  authLimiter,
  sanitizeInput,
  registerValidation,
  validateRequest,
  registerCaretaker
);

router.post('/login',
  authLimiter,
  sanitizeInput,
  loginValidation,
  validateRequest,
  loginCaretaker
);

// Protected routes
router.get('/profile', authenticateCaretaker, getCaretakerProfile);
router.get('/bookings', authenticateCaretaker, getCaretakerBookings);
router.get('/locations', authenticateCaretaker, getCaretakerLocations); // NEW ROUTE
router.patch('/bookings/:id/payment-status', authenticateCaretaker, updateBookingPaymentStatus);

router.get('/all', authenticateAdmin, getAllCaretakers);           // GET all caretakers
router.get('/:id', authenticateAdmin, getCaretakerById);           // GET caretaker by ID
router.put('/:id', authenticateAdmin, updateCaretaker);            // UPDATE caretaker
router.delete('/:id', authenticateAdmin, deleteCaretaker);         // DELETE caretaker

export default router;