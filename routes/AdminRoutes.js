import express from 'express';
import {
  registerAdmin,
  loginAdmin,
  getProfile,
  updateProfile,
  changePassword,
  registerValidation,
  loginValidation
} from '../controllers/AdminController.js';
import { authenticateAdmin, requireSuperAdmin } from '../middleware/auth.js';
import { authLimiter, createAccountLimiter, validateRequest, sanitizeInput } from '../middleware/security.js';

const router = express.Router();

// Public routes
router.post('/register', 
  createAccountLimiter,
  sanitizeInput,
  registerValidation,
  validateRequest,
  authenticateAdmin,
  requireSuperAdmin,
  registerAdmin
);

router.post('/login',
  authLimiter,
  sanitizeInput,
  loginValidation,
  validateRequest,
  loginAdmin
);

// Protected routes
router.get('/profile', authenticateAdmin, getProfile);
router.put('/profile', authenticateAdmin, sanitizeInput, updateProfile);
router.put('/change-password', authenticateAdmin, sanitizeInput, changePassword);

export default router;