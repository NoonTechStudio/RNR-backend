// controllers/CaretakerController.js
import Caretaker from '../models/Caretaker.js';
import Location from '../models/Location.js';
import Booking from '../models/Booking.js';
import PoolPartyBooking from '../models/PoolPartyBooking.js';
import JWTUtils from '../utils/jwt.js';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';

// Validation rules
export const registerValidation = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .trim(),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('phone')
    .notEmpty()
    .withMessage('Phone number is required')
    .trim(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('locations')
    .isArray({ min: 1 })
    .withMessage('At least one location must be selected')
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

// Helper function to format address
const formatAddressObjectToString = (address) => {
  if (!address) return '';
  if (typeof address === 'string') return address;
  
  const parts = [];
  if (address.line1) parts.push(address.line1);
  if (address.line2) parts.push(address.line2);
  if (address.city) parts.push(address.city);
  if (address.state) parts.push(address.state);
  if (address.pincode) parts.push(address.pincode);
  
  return parts.length > 0 ? parts.join(', ') : '';
};

// Register new caretaker
export const registerCaretaker = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, email, phone, password, locations } = req.body;

    const existingCaretaker = await Caretaker.findOne({ email });
    if (existingCaretaker) {
      return res.status(409).json({
        success: false,
        error: 'Caretaker with this email already exists'
      });
    }

    const locationDocs = await Location.find({ _id: { $in: locations } });
    if (locationDocs.length !== locations.length) {
      return res.status(400).json({
        success: false,
        error: 'One or more locations are invalid'
      });
    }

    const caretaker = new Caretaker({
      name,
      email,
      phone,
      password,
      locations
    });

    await caretaker.save();

    res.status(201).json({
      success: true,
      message: 'Caretaker registered successfully',
      caretaker: caretaker.toJSON()
    });

  } catch (error) {
    console.error('Caretaker registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Caretaker login
export const loginCaretaker = async (req, res) => {
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

    const caretaker = await Caretaker.findOne({ email }).populate('locations', 'name address');
    if (!caretaker) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const isPasswordValid = await caretaker.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    if (!caretaker.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Caretaker account is deactivated'
      });
    }

    caretaker.lastLogin = new Date();
    await caretaker.save();

    const token = JWTUtils.generateToken({
      id: caretaker._id,
      name: caretaker.name,
      email: caretaker.email,
      role: 'caretaker',
      locations: caretaker.locations.map(loc => loc._id)
    });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      caretaker: caretaker.toJSON()
    });

  } catch (error) {
    console.error('Caretaker login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get bookings with partially_paid/half-paid status (excluding pending)
export const getCaretakerBookings = async (req, res) => {
  try {
    const { 
      status, 
      location, 
      page = 1, 
      limit = 10, 
      search, 
      bookingType = 'all',
      paymentStatus // New parameter to filter by specific payment status
    } = req.query;

    // Build base filter - Only show partially_paid/half-paid by default
    const baseFilter = {
      $or: [
        { paymentStatus: 'partially_paid' },
        { paymentStatus: 'half-paid' }
      ]
    };

    // If paymentStatus filter is explicitly provided, use it
    if (paymentStatus && paymentStatus !== 'all') {
      // Map frontend status to database status
      const statusMap = {
        'half-paid': 'half-paid',
        'partially_paid': 'partially_paid',
        'pending': 'pending',
        'fully-paid': 'full-paid',
        'paid': 'paid'
      };
      baseFilter.paymentStatus = statusMap[paymentStatus] || paymentStatus;
    }

    // Filter by specific location if provided (optional)
    if (location && location !== 'all') {
      // We'll handle this in individual queries
    }

    // Search filter
    const searchFilter = {};
    if (search) {
      searchFilter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { guestName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { 'locationSnapshot.name': { $regex: search, $options: 'i' } },
        { 'locationInfo.name': { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // FETCH SIMPLE BOOKINGS - Only show partially_paid/half-paid (not pending)
    const simpleFilter = {
      paymentStatus: 'partially_paid', // Only show half-paid for simple bookings
      ...(status && status !== 'all' ? { paymentStatus: status } : {}),
      ...(paymentStatus && paymentStatus !== 'all' ? { paymentStatus } : {})
    };

    const simpleBookings = bookingType === 'all' || bookingType === 'simple' 
      ? await Booking.find({
          ...simpleFilter,
          ...(search && searchFilter),
          ...(location && location !== 'all' ? { location: location } : {})
        })
          .populate('location', 'name address')
          .populate('markedPaidBy', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
      : [];

    // FETCH POOL PARTY BOOKINGS - Only show partially_paid (not pending)
    const poolPartyFilter = {
      paymentStatus: 'partially_paid', // Only show partially_paid for pool party
      ...(status && status !== 'all' ? { 
        paymentStatus: status === 'half-paid' ? 'partially_paid' : status 
      } : {}),
      ...(paymentStatus && paymentStatus !== 'all' ? { 
        paymentStatus: paymentStatus === 'half-paid' ? 'partially_paid' : paymentStatus 
      } : {})
    };

    const poolPartyBookings = bookingType === 'all' || bookingType === 'poolparty'
      ? await PoolPartyBooking.find({
          ...poolPartyFilter,
          ...(search && {
            $or: [
              { guestName: { $regex: search, $options: 'i' } },
              { email: { $regex: search, $options: 'i' } },
              { phone: { $regex: search, $options: 'i' } }
            ]
          }),
          ...(location && location !== 'all' ? { locationId: location } : {})
        })
          .populate('poolPartyId', 'locationName timings')
          .populate('locationId', 'name address')
          .populate('markedPaidBy', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
      : [];

    // Format bookings
    const formattedSimpleBookings = simpleBookings.map(booking => ({
      ...booking.toObject(),
      bookingType: 'simple',
      id: booking._id,
      guestName: booking.name,
      locationInfo: booking.location,
      checkInDate: booking.checkInDate,
      checkOutDate: booking.checkOutDate,
      paymentDetails: {
        status: booking.paymentStatus,
        amountPaid: booking.amountPaid,
        remainingAmount: booking.remainingAmount,
        totalAmount: booking.pricing?.totalPrice
      },
      markedPaidBy: booking.markedPaidBy ? {
    _id: booking.markedPaidBy._id,
    name: booking.markedPaidBy.name,
    email: booking.markedPaidBy.email
  } : null,
  markedPaidAt: booking.markedPaidAt
    }));

    const formattedPoolPartyBookings = poolPartyBookings.map(booking => ({
      ...booking.toObject(),
      bookingType: 'poolparty',
      id: booking._id,
      guestName: booking.guestName,
      locationInfo: booking.locationId,
      checkInDate: booking.bookingDate,
      checkOutDate: booking.bookingDate,
      session: booking.session,
      paymentDetails: {
        status: booking.paymentStatus,
        amountPaid: booking.amountPaid,
        remainingAmount: booking.remainingAmount,
        totalAmount: booking.pricing?.totalPrice || booking.pricing?.totalAmount
      },
      // Ensure pricing structure is consistent
      pricing: booking.pricing || {
        pricePerAdult: booking.pricing?.perAdult || 0,
        pricePerKid: booking.pricing?.perKid || 0,
        totalPrice: booking.pricing?.totalPrice || booking.pricing?.totalAmount || 0
      },
        markedPaidBy: booking.markedPaidBy ? {
    _id: booking.markedPaidBy._id,
    name: booking.markedPaidBy.name,
    email: booking.markedPaidBy.email
  } : null,
  markedPaidAt: booking.markedPaidAt
    }));

    // Combine all bookings
    const allBookings = [...formattedSimpleBookings, ...formattedPoolPartyBookings];
    allBookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Get total counts
    const totalSimple = await Booking.countDocuments({
      ...simpleFilter,
      ...(location && location !== 'all' ? { location: location } : {})
    });
    
    const totalPoolParty = await PoolPartyBooking.countDocuments({
      ...poolPartyFilter,
      ...(location && location !== 'all' ? { locationId: location } : {})
    });
    
    const total = totalSimple + totalPoolParty;

    // Get statistics
    const simpleStats = await Booking.aggregate([
      { 
        $match: {
          ...(location && location !== 'all' ? { location: mongoose.Types.ObjectId(location) } : {})
        } 
      },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: "$amountPaid" },
          fullyPaid: { 
            $sum: { 
              $cond: [
                { $in: ["$paymentStatus", ["full-paid", "fully-paid", "paid"]] }, 
                1, 
                0 
              ] 
            } 
          },
          halfPaid: { 
            $sum: { 
              $cond: [{ $eq: ["$paymentStatus", "half-paid"] }, 1, 0] 
            } 
          },
          pending: { 
            $sum: { 
              $cond: [{ $eq: ["$paymentStatus", "pending"] }, 1, 0] 
            } 
          }
        }
      }
    ]);

    const poolPartyStats = await PoolPartyBooking.aggregate([
      { 
        $match: {
          ...(location && location !== 'all' ? { locationId: mongoose.Types.ObjectId(location) } : {})
        } 
      },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: "$amountPaid" },
          fullyPaid: { 
            $sum: { 
              $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] 
            } 
          },
          halfPaid: { 
            $sum: { 
              $cond: [{ $eq: ["$paymentStatus", "partially_paid"] }, 1, 0] 
            } 
          },
          pending: { 
            $sum: { 
              $cond: [{ $eq: ["$paymentStatus", "pending"] }, 1, 0] 
            } 
          }
        }
      }
    ]);

    const statistics = {
      totalBookings: total,
      totalRevenue: (simpleStats[0]?.totalRevenue || 0) + (poolPartyStats[0]?.totalRevenue || 0),
      fullyPaidBookings: (simpleStats[0]?.fullyPaid || 0) + (poolPartyStats[0]?.fullyPaid || 0),
      halfPaidBookings: (simpleStats[0]?.halfPaid || 0) + (poolPartyStats[0]?.halfPaid || 0),
      pendingBookings: (simpleStats[0]?.pending || 0) + (poolPartyStats[0]?.pending || 0)
    };

    res.json({
      success: true,
      bookings: allBookings,
      statistics,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalBookings: total,
        simpleBookings: totalSimple,
        poolPartyBookings: totalPoolParty,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    });

  } catch (error) {
    console.error('Get caretaker bookings error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// controllers/CaretakerController.js
export const updateBookingPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingType = 'simple' } = req.body;

    console.log('Update payment status:', { id, bookingType });

    let booking;
    
    if (bookingType === 'poolparty') {
      // Update pool party booking
      booking = await PoolPartyBooking.findById(id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          error: 'Pool party booking not found'
        });
      }

      // Check if current status allows update
      const allowedStatuses = ['partially_paid', 'pending', 'half-paid'];
      if (!allowedStatuses.includes(booking.paymentStatus)) {
        return res.status(400).json({
          success: false,
          error: `Cannot update booking with status: ${booking.paymentStatus}. Only partially_paid, pending, or half-paid can be updated.`
        });
      }

      // Update to paid
      booking.paymentStatus = 'paid';
      booking.amountPaid = booking.pricing?.totalPrice || booking.pricing?.totalAmount || 0;
      booking.remainingAmount = 0;

      // NEW: Record who marked it paid
      booking.markedPaidBy = new mongoose.Types.ObjectId(req.caretaker._id);
      booking.markedPaidAt = new Date();

      await booking.save();

      console.log('✅ Pool party booking updated successfully');

    } else {
      // Update simple booking
      booking = await Booking.findById(id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          error: 'Booking not found'
        });
      }

      // Check if current status allows update
      if (booking.paymentStatus !== 'partially_paid') {
        return res.status(400).json({
          success: false,
          error: `Can only update bookings with half-paid status to fully-paid. Current status: ${booking.paymentStatus}`
        });
      }

      booking.paymentStatus = 'paid';
      booking.remainingAmount = 0;
      booking.amountPaid = booking.pricing?.totalPrice || 0;

      // NEW: Record who marked it paid
      booking.markedPaidBy = new mongoose.Types.ObjectId(req.caretaker._id);
      booking.markedPaidAt = new Date();

      await booking.save();

      console.log('✅ Simple booking updated successfully');
    }

    res.json({
      success: true,
      message: `Booking payment status updated successfully`,
      booking: booking.toObject()
    });

  } catch (error) {
    console.error('Update booking payment status error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get all locations for caretaker (for filter dropdown)
export const getCaretakerLocations = async (req, res) => {
  try {
    const locations = await Location.find({ isActive: true })
      .select('name address city state')
      .sort({ name: 1 });

    res.json({
      success: true,
      locations
    });
  } catch (error) {
    console.error('Get caretaker locations error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get caretaker profile
export const getCaretakerProfile = async (req, res) => {
  try {
    const caretaker = await Caretaker.findById(req.caretaker._id)
      .populate('locations', 'name address');
    
    res.json({
      success: true,
      caretaker: caretaker.toJSON()
    });
  } catch (error) {
    console.error('Get caretaker profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Debug endpoint to check caretaker data
// controllers/CaretakerController.js - Add these functions

// Get all caretakers (Admin only)
export const getAllCaretakers = async (req, res) => {
  try {
    // Optional: Add admin check here if needed
    // if (req.user.role !== 'admin') {
    //   return res.status(403).json({
    //     success: false,
    //     error: 'Access denied'
    //   });
    // }

    const caretakers = await Caretaker.find()
      .populate('locations', 'name address')
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      caretakers,
      count: caretakers.length
    });
  } catch (error) {
    console.error('Get all caretakers error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get caretaker by ID
export const getCaretakerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid caretaker ID'
      });
    }

    const caretaker = await Caretaker.findById(id)
      .populate('locations', 'name address')
      .select('-password');

    if (!caretaker) {
      return res.status(404).json({
        success: false,
        error: 'Caretaker not found'
      });
    }

    res.json({
      success: true,
      caretaker
    });
  } catch (error) {
    console.error('Get caretaker by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Update caretaker
export const updateCaretaker = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, locations, isActive, password } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid caretaker ID'
      });
    }

    // Check if caretaker exists
    let caretaker = await Caretaker.findById(id);
    if (!caretaker) {
      return res.status(404).json({
        success: false,
        error: 'Caretaker not found'
      });
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== caretaker.email) {
      const existingCaretaker = await Caretaker.findOne({ email });
      if (existingCaretaker && existingCaretaker._id.toString() !== id) {
        return res.status(409).json({
          success: false,
          error: 'Email already in use by another caretaker'
        });
      }
    }

    // Update fields
    if (name) caretaker.name = name;
    if (email) caretaker.email = email;
    if (phone) caretaker.phone = phone;
    if (typeof isActive === 'boolean') caretaker.isActive = isActive;
    
    // Update locations if provided
    if (locations && Array.isArray(locations)) {
      const locationDocs = await Location.find({ _id: { $in: locations } });
      if (locationDocs.length !== locations.length) {
        return res.status(400).json({
          success: false,
          error: 'One or more locations are invalid'
        });
      }
      caretaker.locations = locations;
    }

    // Update password if provided
    if (password && password.length >= 6) {
      caretaker.password = password; // Will be hashed by pre-save hook
    }

    await caretaker.save();

    res.json({
      success: true,
      message: 'Caretaker updated successfully',
      caretaker: caretaker.toJSON()
    });
  } catch (error) {
    console.error('Update caretaker error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Delete caretaker
export const deleteCaretaker = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid caretaker ID'
      });
    }

    // Check if caretaker exists
    const caretaker = await Caretaker.findById(id);
    if (!caretaker) {
      return res.status(404).json({
        success: false,
        error: 'Caretaker not found'
      });
    }

    // Optional: Check if caretaker has any active bookings
    // You can add this logic based on your requirements

    await Caretaker.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Caretaker deleted successfully'
    });
  } catch (error) {
    console.error('Delete caretaker error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};