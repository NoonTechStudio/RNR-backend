import express from 'express';
import {
  getAllOffers,
  getActiveOffers,
  getActiveOffersForLocation,
  getActiveOffersForPoolParty,
  createOffer,
  updateOffer,
  deleteOffer,
  getOfferById
} from '../controllers/OfferController.js';
import { authenticateAdmin, requireSuperAdmin } from '../middleware/auth.js';
import { sanitizeInput } from '../middleware/security.js';

const router = express.Router();

// Public routes - for getting active offers (customers can check offers)
router.get('/active', getActiveOffers);
router.get('/active/location', getActiveOffersForLocation);
router.get('/active/poolparty', getActiveOffersForPoolParty);

// Admin routes - requires super admin authentication
router.get('/', authenticateAdmin, requireSuperAdmin, getAllOffers);
router.get('/:offerId', authenticateAdmin, requireSuperAdmin, getOfferById);
router.post('/', 
  authenticateAdmin, 
  requireSuperAdmin, 
  sanitizeInput, 
  createOffer
);
router.put('/:offerId',
  authenticateAdmin,
  requireSuperAdmin,
  sanitizeInput,
  updateOffer
);
router.delete('/:offerId',
  authenticateAdmin,
  requireSuperAdmin,
  deleteOffer
);

export default router;
