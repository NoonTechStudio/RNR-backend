import Admin from '../models/Admin.js';
import JWTUtils from '../utils/jwt.js';
import { body, validationResult } from 'express-validator';

// Validation rules
export const registerValidation = [
  body('username')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers and underscores'),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number')
];

export const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Register new admin (only for superadmin)
export const registerAdmin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { username, email, password, role = 'admin' } = req.body;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({
      $or: [{ email }, { username }]
    });

    if (existingAdmin) {
      return res.status(409).json({
        success: false,
        error: 'Admin with this email or username already exists'
      });
    }

    // Create new admin
    const admin = new Admin({
      username,
      email,
      password,
      role: req.admin.role === 'superadmin' ? role : 'admin'
    });

    await admin.save();

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      admin: admin.toJSON()
    });

  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Admin login
export const loginAdmin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find admin by email
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check if account is locked
    if (admin.isLocked) {
      const timeLeft = Math.ceil((admin.lockUntil - Date.now()) / 1000 / 60);
      return res.status(423).json({
        success: false,
        error: `Account is locked. Try again in ${timeLeft} minutes`
      });
    }

    // Verify password
    const isPasswordValid = await admin.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Generate token
    const token = JWTUtils.generateToken({
      id: admin._id,
      username: admin.username,
      email: admin.email,
      role: admin.role
    });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      admin: admin.toJSON()
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get current admin profile
export const getProfile = async (req, res) => {
  try {
    res.json({
      success: true,
      admin: req.admin.toJSON()
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Update admin profile
// Update admin profile
export const updateProfile = async (req, res) => {
  try {
    const { username, email } = req.body;
    const admin = req.admin;

    // Check if username is being changed and if it's already taken
    if (username && username !== admin.username) {
      const existingAdmin = await Admin.findOne({ 
        username, 
        _id: { $ne: admin._id } 
      });
      
      if (existingAdmin) {
        return res.status(409).json({
          success: false,
          error: 'Username already taken'
        });
      }
      admin.username = username;
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== admin.email) {
      const existingAdmin = await Admin.findOne({ 
        email, 
        _id: { $ne: admin._id } 
      });
      
      if (existingAdmin) {
        return res.status(409).json({
          success: false,
          error: 'Email already registered'
        });
      }
      admin.email = email;
    }

    await admin.save();

    res.json({
      success: true,
      message: "Profile updated successfully",
      admin: admin.toJSON()
    });

  } catch (error) {
    console.error("Update profile error:", error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        error: errors.join(', ') 
      });
    }
    
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// Change password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long'
      });
    }

    const admin = req.admin;

    // Verify current password
    const isCurrentPasswordValid = await admin.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Update password
    admin.password = newPassword;
    await admin.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};