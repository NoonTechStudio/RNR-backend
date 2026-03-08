import mongoose from "mongoose";
import PoolParty from "../models/poolParty.js";
import PoolPartyBooking from "../models/PoolPartyBooking.js";
import Location from "../models/Location.js";
import Offer from "../models/Offer.js";

export const createPoolParty = async (req, res) => {
  try {
    // Calculate total capacity from all sessions
    const totalCapacity = req.body.timings.reduce((sum, timing) => sum + timing.capacity, 0);
    const poolParty = new PoolParty({
      ...req.body,
      totalCapacity // This will be calculated automatically, but we also set it explicitly
    });
    await poolParty.save();
    res.status(201).json(poolParty);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const updatePoolParty = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Update pool party ID:', id);
    console.log('Request body:', req.body);
    
    // Validate timings exists in request body
    if (!req.body.timings || !Array.isArray(req.body.timings)) {
      return res.status(400).json({ 
        error: "Timings array is required" 
      });
    }
    
    // Validate each timing has required fields
    for (let i = 0; i < req.body.timings.length; i++) {
      const timing = req.body.timings[i];
      if (!timing.session || !timing.startTime || !timing.endTime || timing.capacity === undefined) {
        return res.status(400).json({ 
          error: `Timing at index ${i} is missing required fields` 
        });
      }
      
      // Ensure pricing exists
      if (!timing.pricing) {
        timing.pricing = { perAdult: 0, perKid: 0 };
      }
    }
    
    // Calculate total capacity from all sessions
    const totalCapacity = req.body.timings.reduce((sum, timing) => {
      return sum + (parseInt(timing.capacity) || 0);
    }, 0);
    
    req.body.totalCapacity = totalCapacity;
    
    // Keep existing bookings when updating
    let existingPoolParty;
    if (mongoose.Types.ObjectId.isValid(id)) {
      existingPoolParty = await PoolParty.findById(id);
    }
    
    if (!existingPoolParty) {
      existingPoolParty = await PoolParty.findOne({ locationId: id });
    }
    
    if (!existingPoolParty) {
      return res.status(404).json({ 
        error: "Pool party not found" 
      });
    }
    
    // Preserve existing bookings when updating
    if (existingPoolParty.bookings) {
      req.body.bookings = existingPoolParty.bookings;
    }
    
    // Update the pool party
    const poolParty = await PoolParty.findByIdAndUpdate(
      existingPoolParty._id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!poolParty) {
      return res.status(404).json({ 
        error: "Pool party not found after update" 
      });
    }
    
    res.json(poolParty);
  } catch (err) {
    console.error('Update pool party error:', err);
    res.status(400).json({ error: err.message });
  }
};

export const getPoolPartyByLocationId = async (req, res) => {
  try {
    const { locationId } = req.params;
    
    // ========== FIX START: Get location first ==========
    let location;
    if (mongoose.Types.ObjectId.isValid(locationId)) {
      location = await Location.findById(locationId);
    } else {
      return res.status(400).json({ 
        success: false,
        error: "Invalid location ID format" 
      });
    }
    
    if (!location) {
      return res.status(404).json({ 
        success: false,
        error: "Location not found" 
      });
    }
    
    if (!location.poolPartyConfig?.hasPoolParty || !location.poolPartyConfig?.sharedPoolPartyId) {
      return res.status(404).json({ 
        success: false,
        error: "No shared pool party configured for this location" 
      });
    }
    
    const poolParty = await PoolParty.findById(location.poolPartyConfig.sharedPoolPartyId);
    // ========== FIX END ==========
    
    if (!poolParty) return res.status(404).json({ error: "Pool party not found" });
    res.json(poolParty);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getPoolPartyById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid pool party ID format" 
      });
    }
    
    const poolParty = await PoolParty.findById(id);
    
    if (!poolParty) {
      return res.status(404).json({ 
        success: false,
        error: "Pool party not found" 
      });
    }
    
    res.json({
      success: true,
      poolParty
    });
    
  } catch (err) {
    console.error('Get pool party by ID error:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};

export const deletePoolParty = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format (optional but recommended)
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid pool party ID format"
      });
    }

    // Find and delete the pool party by its own _id
    const poolParty = await PoolParty.findByIdAndDelete(id);

    if (!poolParty) {
      return res.status(404).json({
        success: false,
        error: "Pool party not found"
      });
    }

    // If it's a shared pool, remove references from all linked locations
    if (poolParty.type === 'shared' && poolParty.sharedLocations?.length > 0) {
      await Location.updateMany(
        { _id: { $in: poolParty.sharedLocations } },
        {
          $set: {
            'poolPartyConfig.hasPoolParty': false,
            'poolPartyConfig.sharedPoolPartyId': null
          }
        }
      );
    }
    // If it's a private pool, clear the reference from its single location
    else if (poolParty.type === 'private' && poolParty.locationId) {
      await Location.findByIdAndUpdate(poolParty.locationId, {
        $set: {
          'poolPartyConfig.hasPoolParty': false,
          'poolPartyConfig.privatePoolPartyId': null
        }
      });
    }

    // Optionally delete all associated bookings
    await PoolPartyBooking.deleteMany({ poolPartyId: poolParty._id });

    res.json({
      success: true,
      message: "Pool party deleted successfully"
    });
  } catch (err) {
    console.error("Delete pool party error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const checkPoolPartyAvailability = async (req, res) => {
  try {
    const { locationId } = req.params;
    const { date, session, guests } = req.query;
    
    console.log('Check Availability - Location ID:', locationId);
    console.log('Check Availability - Query:', req.query);
    
    if (!locationId || locationId === 'undefined') {
      return res.status(400).json({ 
        success: false,
        error: "Location ID is required" 
      });
    }
    
    // ========== FIX START: Get location first ==========
    let location;
    if (mongoose.Types.ObjectId.isValid(locationId)) {
      location = await Location.findById(locationId);
    } else {
      return res.status(400).json({ 
        success: false,
        error: "Invalid location ID format" 
      });
    }
    
    if (!location) {
      return res.status(404).json({ 
        success: false,
        error: "Location not found" 
      });
    }
    
    if (!location.poolPartyConfig?.hasPoolParty || !location.poolPartyConfig?.sharedPoolPartyId) {
      return res.status(404).json({ 
        success: false,
        error: "No shared pool party configured for this location" 
      });
    }
    
    const poolParty = await PoolParty.findById(location.poolPartyConfig.sharedPoolPartyId);
    
    if (!poolParty) {
      return res.status(404).json({ 
        success: false,
        error: "Pool party not found" 
      });
    }
    // ========== FIX END ==========
    
    if (!date || !session) {
      return res.status(400).json({ 
        success: false,
        error: "Date and session are required" 
      });
    }
    
    const bookingDate = new Date(date);
    
    // Use the async method from the updated PoolParty model
    const isAvailable = await poolParty.isSessionAvailable(bookingDate, session, totalGuests);
    const availableCapacity = await poolParty.getAvailableCapacity(bookingDate, session);
    const sessionConfig = poolParty.timings.find(t => t.session === session);
    
    // ✅ ADD: Get food package availability
    const foodAvailability = await poolParty.getFoodPackageAvailability(bookingDate, session);
    
    res.json({
      success: true,
      isAvailable,
      availableCapacity,
      totalCapacity: sessionConfig ? sessionConfig.capacity : 0,
      booked: sessionConfig ? sessionConfig.capacity - availableCapacity : 0,
      pricing: sessionConfig ? sessionConfig.pricing : null,
      locationName: poolParty.locationName,
      // ✅ ADD: Food package info
      foodPackages: poolParty.selectedFoodPackages || [],
      foodPackageAvailability: foodAvailability
    });
  } catch (err) {
    console.error('Check availability error:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};

export const getAllSessionsAvailability = async (req, res) => {
  try {
    const { locationId } = req.params;
    const { date } = req.query;
    
    console.log('Get All Sessions - Location ID:', locationId);
    console.log('Get All Sessions - Date:', date);
    
    if (!locationId || locationId === 'undefined') {
      return res.status(400).json({ success: false, error: "Location ID is required" });
    }
    
    if (!date) {
      return res.status(400).json({ success: false, error: "Date is required" });
    }
    
    // Validate locationId
    if (!mongoose.Types.ObjectId.isValid(locationId)) {
      return res.status(400).json({ success: false, error: "Invalid location ID format" });
    }
    
    // Fetch the location
    const location = await Location.findById(locationId);
    if (!location) {
      return res.status(404).json({ success: false, error: "Location not found" });
    }
    
    // Check if pool party is configured
    if (!location.poolPartyConfig?.hasPoolParty) {
      return res.status(404).json({ success: false, error: "No pool party configured for this location" });
    }
    
    // Get the correct pool party ID based on type
    let poolPartyId = null;
    if (location.poolPartyConfig.poolPartyType === 'shared') {
      poolPartyId = location.poolPartyConfig.sharedPoolPartyId;
    } else if (location.poolPartyConfig.poolPartyType === 'private') {
      poolPartyId = location.poolPartyConfig.privatePoolPartyId;
    }
    
    if (!poolPartyId) {
      return res.status(404).json({ success: false, error: "Pool party ID not found in location config" });
    }
    
    // Fetch the pool party
    const poolParty = await PoolParty.findById(poolPartyId);
    if (!poolParty) {
      return res.status(404).json({ success: false, error: "Pool party not found" });
    }
    
    // Optional: verify the pool party is linked to this location (safety check)
    if (poolParty.type === 'shared') {
      if (!poolParty.sharedLocations.some(id => id.toString() === locationId)) {
        return res.status(400).json({ success: false, error: "Pool party not linked to this location" });
      }
    } else {
      if (poolParty.locationId?.toString() !== locationId) {
        return res.status(400).json({ success: false, error: "Pool party not linked to this location" });
      }
    }
    
    // Parse the date
    const bookingDate = new Date(date);
    if (isNaN(bookingDate.getTime())) {
      return res.status(400).json({ success: false, error: "Invalid date format" });
    }
    
    const startOfDay = new Date(bookingDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(bookingDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Query bookings for this date from PoolPartyBooking collection
    const bookingsOnDate = await PoolPartyBooking.find({
      poolPartyId: poolParty._id,
      bookingDate: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });
    
    console.log('=== AVAILABILITY CALCULATION ===');
    console.log('Total bookings:', bookingsOnDate.length);
    console.log('From location bookings:', bookingsOnDate.filter(b => b.isIncludedInLocationBooking).length);
    
    // Calculate availability for each session
    const sessionsAvailability = await Promise.all(
      poolParty.timings.map(async (timing) => {
        const bookingsForSession = bookingsOnDate.filter(b => b.session === timing.session);
        const totalBooked = bookingsForSession.reduce((sum, b) => sum + b.adults + b.kids, 0);
        const availableCapacity = Math.max(0, timing.capacity - totalBooked);
        
        console.log(`=== Session ${timing.session} ===`);
        console.log('  - Total Capacity:', timing.capacity);
        console.log('  - Booked:', totalBooked);
        console.log('  - Available Capacity:', availableCapacity);
        
        return {
          session: timing.session,
          startTime: timing.startTime,
          endTime: timing.endTime,
          totalCapacity: timing.capacity,
          availableCapacity,
          booked: totalBooked,
          isAvailable: availableCapacity > 0,
          pricing: timing.pricing
        };
      })
    );
    
    res.json({
      success: true,
      date: bookingDate.toISOString().split('T')[0],
      locationId: locationId,
      locationName: poolParty.locationName,
      sessions: sessionsAvailability
    });
    
  } catch (err) {
    console.error('Get all sessions availability error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
// Add payment status update function
export const updatePoolPartyPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus, amountPaid, remainingAmount, paymentType } = req.body;

    const booking = await PoolPartyBooking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: "Pool party booking not found"
      });
    }

    const updateData = {};
    
    if (paymentStatus) updateData.paymentStatus = paymentStatus;
    if (amountPaid !== undefined) updateData.amountPaid = parseFloat(amountPaid);
    if (remainingAmount !== undefined) updateData.remainingAmount = parseFloat(remainingAmount);
    if (paymentType) updateData.paymentType = paymentType;

    // Auto-calculate remaining amount if not provided
    if (amountPaid !== undefined && remainingAmount === undefined) {
      const totalAmount = booking.pricing.totalPrice || booking.pricing.totalAmount || 0;
      updateData.remainingAmount = Math.max(0, totalAmount - parseFloat(amountPaid));
    }

    const updatedBooking = await PoolPartyBooking.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('poolPartyId', 'locationName timings')
     .populate('locationId', 'name address city state');

    res.json({
      success: true,
      message: "Payment status updated successfully",
      booking: updatedBooking
    });
  } catch (err) {
    console.error("Update payment status error:", err);
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// Add mark as paid function
export const markPoolPartyAsPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const booking = await PoolPartyBooking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: "Pool party booking not found"
      });
    }

    // Update booking
    booking.paymentStatus = 'paid';
    booking.amountPaid = booking.pricing.totalPrice || booking.pricing.totalAmount || 0;
    booking.remainingAmount = 0;
    booking.paymentType = 'full';
    await booking.save();

    res.json({
      success: true,
      message: "Pool party booking marked as paid successfully",
      booking
    });
  } catch (err) {
    console.error("Mark as paid error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// NEW: Create pool party booking
export const createPoolPartyBooking = async (req, res) => {
  try {
    const {
      poolPartyId,
      locationId,
      guestName,
      email,
      phone,
      address,
      bookingDate,
      session,
      adults,
      kids,
      paymentType = 'full',
      amountPaid = 0,
      remainingAmount = 0,
      withFood = false,
      foodPackage, // This should be an object now, not just a string
      pricing = {}
    } = req.body;
    
    console.log('Creating pool party booking with data:', {
      poolPartyId,
      locationId,
      withFood,
      foodPackage,
      pricing
    });
    
    // Fetch pool party
    const poolParty = await PoolParty.findById(poolPartyId);
    if (!poolParty) {
      return res.status(404).json({ 
        success: false,
        error: "Pool party not found" 
      });
    }

    // ========== CHECK FOR ACTIVE OFFER ==========
    let activeOffer = null;
    const date = new Date(bookingDate);
    if (!isNaN(date.getTime())) {
      const activeOffers = await Offer.find({
        offerType: "poolparty",
        selectedPoolParties: poolPartyId,
        startDate: { $lte: date },
        endDate: { $gte: date },
        isActive: true
      }).sort({ createdAt: -1 });

      if (activeOffers.length > 0) {
        activeOffer = activeOffers[0];
        console.log(`✅ Active offer found for pool party ${poolPartyId} on ${bookingDate}: ${activeOffer.name}`);
      }
    }

    // Determine session pricing
    let sessionConfig = null;
    let basePricing = null;

    if (activeOffer && activeOffer.poolPartyPricing?.sessions) {
      // Find session from offer
      const offerSession = activeOffer.poolPartyPricing.sessions.find(
        s => s.session === session && s.poolPartyId?.toString() === poolPartyId
      );
      if (offerSession) {
        sessionConfig = {
          session: offerSession.session,
          startTime: offerSession.startTime,
          endTime: offerSession.endTime,
          capacity: offerSession.capacity,
          pricing: {
            perAdult: offerSession.perAdult,
            perKid: offerSession.perKid
          }
        };
      }
      basePricing = activeOffer.poolPartyPricing;
    }

    // Fallback to original if no offer or session not found
    if (!sessionConfig) {
      sessionConfig = poolParty.timings.find(t => t.session === session);
      if (!sessionConfig) {
        return res.status(400).json({
          success: false,
          error: "Invalid session selected"
        });
      }
    }

    // Determine available food packages (from offer or original)
    let availableFoodPackages = [];
    if (activeOffer && activeOffer.poolPartyPricing?.foodPackages) {
      availableFoodPackages = activeOffer.poolPartyPricing.foodPackages.filter(
        fp => fp.poolPartyId?.toString() === poolPartyId
      );
    } else {
      availableFoodPackages = poolParty.selectedFoodPackages || [];
    }

    // Calculate base price using sessionConfig
    const basePrice = (sessionConfig.pricing.perAdult * parseInt(adults)) + 
                      (sessionConfig.pricing.perKid * parseInt(kids));
    
    // Calculate food package price if included
    let foodPackagePrice = 0;
    let foodPackageData = null;
    
    if (withFood && foodPackage) {
      // Find the selected food package from available ones
      const selectedFoodPkg = availableFoodPackages.find(
        pkg => pkg.foodPackageId === foodPackage.foodPackageId || 
               pkg._id?.toString() === foodPackage.foodPackageId
      );
      
      if (selectedFoodPkg) {
        foodPackagePrice = (selectedFoodPkg.pricePerAdult * parseInt(adults)) +
                          (selectedFoodPkg.pricePerKid * parseInt(kids));
        
        foodPackageData = {
          foodPackageId: selectedFoodPkg.foodPackageId || selectedFoodPkg._id,
          name: selectedFoodPkg.name,
          pricePerAdult: selectedFoodPkg.pricePerAdult,
          pricePerKid: selectedFoodPkg.pricePerKid
        };
      } else {
        console.warn('Selected food package not found:', foodPackage);
      }
    }
    
    const totalPrice = basePrice + foodPackagePrice;
    
    // Create booking with enhanced data
    const booking = new PoolPartyBooking({
      poolPartyId,
      locationId,
      guestName,
      email,
      phone,
      address: address || '',
      bookingDate: new Date(bookingDate),
      session,
      adults: parseInt(adults),
      kids: parseInt(kids),
      totalGuests: parseInt(adults) + parseInt(kids),
      pricing: {
        pricePerAdult: sessionConfig.pricing.perAdult,
        pricePerKid: sessionConfig.pricing.perKid,
        totalPrice: totalPrice,
        foodPackagePrice: foodPackagePrice
      },
      paymentType,
      amountPaid: parseFloat(amountPaid),
      remainingAmount: parseFloat(remainingAmount),
      paymentStatus: 'pending',
      withFood,
      foodPackage: foodPackageData,
      isAutoCreatedFromLocation: req.body.isAutoCreatedFromLocation || false
      // Optionally store offer ID if you add field to model
      // offer: activeOffer?._id
    });
    
    await booking.save();
    
    // Populate the booking with pool party details
    const populatedBooking = await PoolPartyBooking.findById(booking._id)
      .populate('poolPartyId', 'name locationName selectedFoodPackages')
      .populate('locationId', 'name address');
    
    res.status(201).json({
      success: true,
      message: "Pool party booking created successfully",
      booking: populatedBooking
    });
    
  } catch (err) {
    console.error('Create pool party booking error:', err);
    res.status(400).json({ error: err.message });
  }
};

// GET all pool party bookings (with optional filters)
export const getPoolPartyBookings = async (req, res) => {
  try {
    const { 
      poolPartyId, 
      locationId, 
      date, 
      session, 
      paymentStatus,
      startDate,
      endDate,
      page = 1,
      limit = 10
    } = req.query;
    
    const query = {};
    
    // FIX: Handle poolPartyId query
    if (poolPartyId) {
      if (mongoose.Types.ObjectId.isValid(poolPartyId)) {
        query.poolPartyId = new mongoose.Types.ObjectId(poolPartyId);
      } else {
        query.poolPartyId = poolPartyId;
      }
    }
    
    // FIX: Handle locationId query
    if (locationId) {
      if (mongoose.Types.ObjectId.isValid(locationId)) {
        query.locationId = new mongoose.Types.ObjectId(locationId);
      } else {
        query.locationId = locationId;
      }
    }
    
    if (date) {
      const searchDate = new Date(date);
      const nextDay = new Date(searchDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      query.bookingDate = {
        $gte: searchDate,
        $lt: nextDay
      };
    }
    
    if (session) {
      query.session = session;
    }
    
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }
    
    // Date range filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);
      
      query.bookingDate = {
        $gte: start,
        $lt: end
      };
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const bookings = await PoolPartyBooking.find(query)
      .populate('poolPartyId', 'locationName timings totalCapacity')
      .populate('locationId', 'name address city state')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await PoolPartyBooking.countDocuments(query);
    
    res.json({
      success: true,
      count: bookings.length,
      bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (err) {
    console.error('Get pool party bookings error:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};

// UPDATE pool party booking
export const updatePoolPartyBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate booking ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid booking ID format" 
      });
    }

    // Find the existing booking
    const booking = await PoolPartyBooking.findById(id).populate('poolPartyId');
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: "Booking not found" 
      });
    }

    // If this booking is part of a location booking, restrict editing of critical fields
    if (booking.isIncludedInLocationBooking) {
      // Allow only guest info updates, not date/session/guest count changes
      const allowedFields = ['guestName', 'email', 'phone', 'address', 'paymentStatus', 'status'];
      const restrictedFields = Object.keys(updateData).filter(
        field => !allowedFields.includes(field)
      );
      if (restrictedFields.length > 0) {
        return res.status(403).json({
          success: false,
          error: `Cannot change ${restrictedFields.join(', ')} for location‑linked pool party bookings.`
        });
      }
      // Proceed with update (skip capacity checks)
      const updatedBooking = await PoolPartyBooking.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).populate('poolPartyId', 'locationName timings');
      return res.json({
        success: true,
        message: "Booking updated successfully",
        booking: updatedBooking
      });
    }

    // -----------------------------------------------------------------
    // For standalone bookings, handle capacity if any relevant field changes
    // -----------------------------------------------------------------
    const poolParty = booking.poolPartyId;
    if (!poolParty) {
      return res.status(404).json({ 
        success: false,
        error: "Pool party not found" 
      });
    }

    // Determine if capacity‑affecting fields are being changed
    const capacityFields = ['bookingDate', 'session', 'adults', 'kids'];
    const capacityChanged = capacityFields.some(field => updateData[field] !== undefined);

    if (capacityChanged) {
      // Use new values or fallback to existing ones
      const newDate = updateData.bookingDate ? new Date(updateData.bookingDate) : booking.bookingDate;
      const newSession = updateData.session || booking.session;
      const newAdults = updateData.adults !== undefined ? parseInt(updateData.adults) : booking.adults;
      const newKids = updateData.kids !== undefined ? parseInt(updateData.kids) : booking.kids;
      const newTotalGuests = newAdults + newKids;

      // Get the session configuration
      const sessionConfig = poolParty.timings.find(t => t.session === newSession);
      if (!sessionConfig) {
        return res.status(400).json({
          success: false,
          error: "Invalid session selected"
        });
      }

      // Calculate available capacity excluding the current booking
      const startOfDay = new Date(newDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(newDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get all other bookings for same date and session (excluding this one)
      const otherBookings = await PoolPartyBooking.find({
        poolPartyId: poolParty._id,
        bookingDate: { $gte: startOfDay, $lte: endOfDay },
        session: newSession,
        _id: { $ne: booking._id }
      });

      const totalBookedByOthers = otherBookings.reduce((sum, b) => sum + b.adults + b.kids, 0);
      const availableForUpdate = sessionConfig.capacity - totalBookedByOthers;

      if (availableForUpdate < newTotalGuests) {
        return res.status(409).json({
          success: false,
          error: `Not enough capacity. Only ${availableForUpdate} spots available for this session.`
        });
      }

      // Recalculate pricing if guest counts or session changed
      if (updateData.adults !== undefined || updateData.kids !== undefined || updateData.session !== undefined) {
        const sessionPricing = sessionConfig.pricing;
        const totalPrice = (sessionPricing.perAdult * newAdults) + (sessionPricing.perKid * newKids);
        
        // Update pricing in updateData
        updateData.pricing = {
          pricePerAdult: sessionPricing.perAdult,
          pricePerKid: sessionPricing.perKid,
          totalPrice: totalPrice
        };
        updateData.totalGuests = newTotalGuests;

        // Adjust payment amounts if needed (optional)
        // For simplicity, we keep existing amountPaid and recalculate remainingAmount
        if (updateData.amountPaid === undefined) {
          // keep existing amountPaid, but ensure remainingAmount is correct
          const existingPaid = booking.amountPaid || 0;
          updateData.remainingAmount = Math.max(0, totalPrice - existingPaid);
        }
      }
    }

    // Apply the update
    const updatedBooking = await PoolPartyBooking.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('poolPartyId', 'locationName timings');

    res.json({
      success: true,
      message: "Booking updated successfully",
      booking: updatedBooking
    });

  } catch (err) {
    console.error('Update pool party booking error:', err);
    res.status(400).json({ error: err.message });
  }
};

// DELETE pool party booking
export const deletePoolPartyBooking = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate booking ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid booking ID format" 
      });
    }
    
    // Find and delete the booking
    const booking = await PoolPartyBooking.findByIdAndDelete(id);
    
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: "Booking not found" 
      });
    }
    
    // NO LONGER remove the booking from PoolParty model
    
    res.json({
      success: true,
      message: "Booking deleted successfully"
    });
    
  } catch (err) {
    console.error('Delete pool party booking error:', err);
    res.status(500).json({ error: err.message });
  }
};

// GET all pool parties (with pagination and filters)
export const getPoolPartys = async (req, res) => {
  try {
    const { 
      locationId, 
      isActive,
      search,
      page = 1,
      limit = 10
    } = req.query;
    
    const query = {};
    
    if (locationId) {
      if (mongoose.Types.ObjectId.isValid(locationId)) {
        query.locationId = new mongoose.Types.ObjectId(locationId);
      }
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (search) {
      query.$or = [
        { locationName: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const poolParties = await PoolParty.find(query)
      .populate('locationId', 'name address')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await PoolParty.countDocuments(query);
    
    // Calculate booking count for each pool party
    const poolPartiesWithStats = await Promise.all(
      poolParties.map(async (poolParty) => {
        // Get total bookings count from PoolPartyBooking collection
        const bookingCount = await PoolPartyBooking.countDocuments({ 
          poolPartyId: poolParty._id 
        });
        
        // Get today's bookings count
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const todayBookingsCount = await PoolPartyBooking.countDocuments({
          poolPartyId: poolParty._id,
          bookingDate: {
            $gte: today,
            $lt: tomorrow
          }
        });
        
        return {
          ...poolParty.toObject(),
          stats: {
            totalBookings: bookingCount,
            bookedToday: todayBookingsCount,
            sessionsCount: poolParty.timings.length
          }
        };
      })
    );
    
    res.json({
      success: true,
      poolParties: poolPartiesWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (err) {
    console.error('Get pool parties error:', err);
    res.status(500).json({ error: err.message });
  }
};

export const getAllPoolParties = async (req, res) => {
  try {
    const { 
      type,
      page = 1,
      limit = 10,
      search
    } = req.query;
    
    const query = {};
    
    if (type) query.type = type;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { locationName: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const poolParties = await PoolParty.find(query)
      .populate('sharedLocations', 'name address')
      .populate('locationId', 'name address')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await PoolParty.countDocuments(query);
    
    const poolPartiesWithStats = await Promise.all(
      poolParties.map(async (poolParty) => {
        const bookingCount = await PoolPartyBooking.countDocuments({ 
          poolPartyId: poolParty._id 
        });
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const todayBookingsCount = await PoolPartyBooking.countDocuments({
          poolPartyId: poolParty._id,
          bookingDate: {
            $gte: today,
            $lt: tomorrow
          }
        });
        
        let linkedLocationsCount = 0;
        if (poolParty.type === 'shared') {
          linkedLocationsCount = poolParty.sharedLocations?.length || 0;
        } else {
          linkedLocationsCount = poolParty.locationId ? 1 : 0;
        }
        
        return {
          ...poolParty.toObject(),
          stats: {
            totalBookings: bookingCount,
            bookedToday: todayBookingsCount,
            sessionsCount: poolParty.timings.length,
            linkedLocationsCount
          }
        };
      })
    );
    
    res.json({
      success: true,
      poolParties: poolPartiesWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (err) {
    console.error('Get all pool parties error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Create shared pool party
export const createSharedPoolParty = async (req, res) => {
  try {
    const {
      name,
      description,
      locationName,
      timings,
      sharedLocations = [],
      locationFoodPackagePrices // Add this parameter
    } = req.body;
    
    // Validate shared locations
    if (sharedLocations.length > 0) {
      const locations = await Location.find({ _id: { $in: sharedLocations } });
      if (locations.length !== sharedLocations.length) {
        return res.status(400).json({ 
          success: false,
          error: "One or more shared locations not found" 
        });
      }
      
      // Get food package prices from first location if not provided
      let foodPackage1Price = 0;
      let foodPackage2Price = 0;
      
      if (locationFoodPackagePrices) {
        foodPackage1Price = locationFoodPackagePrices.foodPackage1 || 0;
        foodPackage2Price = locationFoodPackagePrices.foodPackage2 || 0;
      } else if (locations.length > 0) {
        // Use pricing from first location
        const firstLocation = locations[0];
        foodPackage1Price = firstLocation.pricing?.foodPackage1?.price || 0;
        foodPackage2Price = firstLocation.pricing?.foodPackage2?.price || 0;
      }
      
      // Process timings with food package pricing
      const processedTimings = (timings || []).map(timing => ({
        ...timing,
        pricing: {
          ...timing.pricing,
          foodPackage1: {
            name: "Breakfast, Lunch, Hightea",
            pricePerAdult: foodPackage1Price,
            pricePerKid: Math.round(foodPackage1Price / 2)
          },
          foodPackage2: {
            name: "Breakfast, Lunch, Hightea, Dinner",
            pricePerAdult: foodPackage2Price,
            pricePerKid: Math.round(foodPackage2Price / 2)
          }
        }
      }));
      
      const poolParty = new PoolParty({
        name,
        description,
        type: 'shared',
        sharedLocations,
        locationName,
        timings: processedTimings, // Use processed timings
        isActive: true
      });
      
      await poolParty.save();
      
      // Update each location's pool party config
      for (const locationId of sharedLocations) {
        await Location.findByIdAndUpdate(locationId, {
          'poolPartyConfig.hasPoolParty': true,
          'poolPartyConfig.poolPartyType': 'shared',
          'poolPartyConfig.sharedPoolPartyId': poolParty._id,
          'poolPartyConfig.privatePoolPartyId': null
        });
      }
      
      res.status(201).json({
        success: true,
        message: "Shared pool party created successfully",
        poolParty
      });
    }
  } catch (err) {
    console.error('Create shared pool party error:', err);
    res.status(400).json({ error: err.message });
  }
};

// Update shared pool party
export const updateSharedPoolParty = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, timings, sharedLocations } = req.body;
    
    const poolParty = await PoolParty.findById(id);
    if (!poolParty || poolParty.type !== 'shared') {
      return res.status(404).json({ 
        error: "Shared pool party not found" 
      });
    }
    
    // Get old shared locations to compare
    const oldSharedLocations = poolParty.sharedLocations.map(id => id.toString());
    const newSharedLocations = sharedLocations || [];
    
    // Update pool party
    poolParty.name = name || poolParty.name;
    poolParty.description = description || poolParty.description;
    if (timings) poolParty.timings = timings;
    
    // Update shared locations
    if (sharedLocations) {
      poolParty.sharedLocations = newSharedLocations;
      
      // Update locations that were removed
      const removedLocations = oldSharedLocations.filter(id => 
        !newSharedLocations.includes(id)
      );
      
      for (const locationId of removedLocations) {
        await Location.findByIdAndUpdate(locationId, {
          'poolPartyConfig.hasPoolParty': false,
          'poolPartyConfig.poolPartyType': 'none',
          'poolPartyConfig.sharedPoolPartyId': null
        });
      }
      
      // Update locations that were added
      const addedLocations = newSharedLocations.filter(id => 
        !oldSharedLocations.includes(id)
      );
      
      for (const locationId of addedLocations) {
        await Location.findByIdAndUpdate(locationId, {
          'poolPartyConfig.hasPoolParty': true,
          'poolPartyConfig.poolPartyType': 'shared',
          'poolPartyConfig.sharedPoolPartyId': poolParty._id,
          'poolPartyConfig.privatePoolPartyId': null
        });
      }
    }
    
    poolParty.updatedAt = new Date();
    await poolParty.save();
    
    res.json({
      success: true,
      message: "Shared pool party updated successfully",
      poolParty
    });
    
  } catch (err) {
    console.error('Update shared pool party error:', err);
    res.status(400).json({ error: err.message });
  }
};
