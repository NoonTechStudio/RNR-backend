import Booking from "../models/Booking.js";
import Location from "../models/Location.js";
import PoolParty from "../models/poolParty.js";
import PoolPartyBooking from "../models/PoolPartyBooking.js";
import Offer from "../models/Offer.js";
import BookedSlot from "../models/BookedSlot.js";

export const createBooking = async (req, res) => {
  try {
    const {
      locationId,
      checkInDate,
      checkOutDate,
      checkInTime,
      name,
      phone,
      email,
      address,
      adults = 1,
      kids = 0,
      withFood = false,
      foodPackageId,
      dailyFoodSelections = [],
      paymentType = "token",
      amountPaid = 0,
      remainingAmount = 0,
      pricing = {},
      sameDayCheckout = false
    } = req.body;

    console.log('📦 Booking Request Body:', {
      locationId,
      checkInDate,
      checkOutDate,
      sameDayCheckout
    });

    // Normalize dates
    const startDate = new Date(checkInDate);
    startDate.setUTCHours(0, 0, 0, 0);

    let endDate;
    if (sameDayCheckout) {
      endDate = new Date(checkInDate);
      endDate.setUTCHours(23, 59, 59, 999);
    } else {
      endDate = new Date(checkOutDate || checkInDate);
      endDate.setUTCHours(23, 59, 59, 999);
    }

    // Get location details
    const location = await Location.findById(locationId);
    if (!location) {
      return res.status(404).json({
        success: false,
        error: "Location not found"
      });
    }

    // =========================================================
    // 🔒 NEW ATOMIC LOCK START – replaces old overlap check
    // =========================================================

    // Generate list of dates that need to be locked
    const datesToLock = [];
    let current = new Date(startDate);
    const end = new Date(endDate);

    if (!sameDayCheckout && location.propertyDetails?.nightStay) {
      // Night stay: lock every day except the checkout day
      const checkoutDay = new Date(end);
      checkoutDay.setUTCHours(0, 0, 0, 0);
      while (current < checkoutDay) {
        datesToLock.push(new Date(current));
        current.setUTCDate(current.getUTCDate() + 1);
      }
    } else {
      // Same‑day checkout or day picnic: lock only the check‑in date
      datesToLock.push(new Date(startDate));
    }

    // ========== CHECK FOR ACTIVE OFFER (your existing code) ==========
    let activeOffer = null;
    const activeOffers = await Offer.find({
      offerType: "location",
      selectedLocations: locationId,
      startDate: { $lte: startDate },
      endDate: { $gte: startDate },
      isActive: true
    }).sort({ createdAt: -1 });
    if (activeOffers.length > 0) {
      activeOffer = activeOffers[0];
    }

    const basePricing = activeOffer ? activeOffer.locationPricing : location.pricing;

    // Calculate days and nights (your existing logic)
    const timeDiff = Math.abs(endDate - startDate);
    const totalDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    let effectiveDays = sameDayCheckout ? 1 : Math.max(1, totalDays);
    let effectiveNights = 0;
    if (location?.propertyDetails?.nightStay === true && !sameDayCheckout) {
      effectiveNights = Math.max(0, effectiveDays - 1);
      effectiveDays = effectiveNights;
    }
    const totalGuests = parseInt(adults) + parseInt(kids);
    const pricePerPersonNight = basePricing?.pricePerPersonNight || 0;
    const pricePerAdultDay = basePricing?.pricePerAdultDay || 0;
    const pricePerKidDay = basePricing?.pricePerKidDay || 0;
    const extraPersonCharge = basePricing?.extraPersonCharge || 0;
    const isNightStayAvailable = location?.propertyDetails?.nightStay === true && !sameDayCheckout;

    // Accommodation pricing (your existing logic)
    let accommodationPrice = 0;
    if (isNightStayAvailable && pricePerPersonNight > 0) {
      const nightPrice = pricePerPersonNight * totalGuests * effectiveNights;
      const dayPrice = (pricePerAdultDay * parseInt(adults) * effectiveNights) +
                       (pricePerKidDay * parseInt(kids) * effectiveNights);
      accommodationPrice = nightPrice + dayPrice;
    } else {
      accommodationPrice = (pricePerAdultDay * adults * effectiveDays) +
                           (pricePerKidDay * kids * effectiveDays);
    }

    // Extra person charge (your existing logic)
    if (totalGuests > location.capacityOfPersons && extraPersonCharge > 0) {
      const extraPersons = totalGuests - location.capacityOfPersons;
      const extraMultiplier = isNightStayAvailable ? effectiveNights : effectiveDays;
      const extraCharge = extraPersonCharge * extraPersons * extraMultiplier;
      accommodationPrice += extraCharge;
    }

    // Food packages (your existing logic)
    let availableFoodPackages = [];
    if (activeOffer && activeOffer.locationPricing?.foodPackages) {
      availableFoodPackages = activeOffer.locationPricing.foodPackages.filter(
        pkg => pkg.locationId?.toString() === locationId
      );
    } else {
      availableFoodPackages = basePricing?.foodPackages || [];
    }

    let foodPackagePrice = 0;
    let selectedFoodPackage = null;

    if (withFood && foodPackageId) {
      selectedFoodPackage = availableFoodPackages.find(pkg => 
        pkg.foodPackageId === foodPackageId || pkg._id?.toString() === foodPackageId
      );
      if (selectedFoodPackage) {
        if (sameDayCheckout || effectiveDays === 1) {
          foodPackagePrice = (selectedFoodPackage.pricePerAdult * adults) +
                             (selectedFoodPackage.pricePerKid * kids);
        } else if (dailyFoodSelections && dailyFoodSelections.length > 0) {
          let totalFoodPrice = 0;
          for (const selection of dailyFoodSelections) {
            const pkg = availableFoodPackages.find(p => 
              p.foodPackageId === selection.packageId || p._id?.toString() === selection.packageId
            );
            if (pkg) {
              totalFoodPrice += (pkg.pricePerAdult * adults) + (pkg.pricePerKid * kids);
            }
          }
          foodPackagePrice = totalFoodPrice;
        } else {
          foodPackagePrice = (selectedFoodPackage.pricePerAdult * adults +
                              selectedFoodPackage.pricePerKid * kids) * effectiveDays;
        }
      }
    }

    const calculatedTotalPrice = accommodationPrice + foodPackagePrice;

    // Create a booking instance (not saved yet) so we have an _id
    const booking = new Booking({
      location: locationId,
      checkInDate: startDate,
      checkOutDate: endDate,
      checkInTime: checkInTime || "10:00 AM",
      name,
      phone,
      email: email || "",
      address,
      adults: parseInt(adults) || 1,
      kids: parseInt(kids) || 0,
      withFood: Boolean(withFood),
      foodPackage: selectedFoodPackage ? {
        packageId: selectedFoodPackage.foodPackageId || selectedFoodPackage._id,
        name: selectedFoodPackage.name,
        pricePerAdult: selectedFoodPackage.pricePerAdult,
        pricePerKid: selectedFoodPackage.pricePerKid,
        description: selectedFoodPackage.description
      } : null,
      dailyFoodPackages: dailyFoodSelections.map(selection => {
        const pkg = availableFoodPackages.find(p => 
          p.foodPackageId === selection.packageId || p._id?.toString() === selection.packageId
        );
        if (!pkg) return null;
        let dateStr = selection.date.toString();
        if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];
        const utcDate = new Date(`${dateStr}T00:00:00.000Z`);
        return {
          date: utcDate,
          packageId: pkg.foodPackageId || pkg._id,
          name: pkg.name,
          pricePerAdult: pkg.pricePerAdult,
          pricePerKid: pkg.pricePerKid,
          description: pkg.description
        };
      }).filter(Boolean),
      sameDayCheckout,
      paymentType,
      amountPaid: parseFloat(amountPaid) || 0,
      remainingAmount: parseFloat(remainingAmount) || 0,
      paymentStatus: "pending",
      pricing: {
        pricePerPersonNight,
        pricePerAdultDay,
        pricePerKidDay,
        extraPersonCharge,
        selectedFoodPackage: selectedFoodPackage ? {
          packageId: selectedFoodPackage.foodPackageId || selectedFoodPackage._id,
          name: selectedFoodPackage.name,
          pricePerAdult: selectedFoodPackage.pricePerAdult,
          pricePerKid: selectedFoodPackage.pricePerKid,
          description: selectedFoodPackage.description
        } : null,
        dailyBreakdown: (() => {
          const breakdown = [];
          let currentDate = new Date(startDate);
          for (let i = 0; i < effectiveDays; i++) {
            const date = new Date(currentDate);
            const dayAccommodationPrice = isNightStayAvailable && i < effectiveNights 
              ? pricePerPersonNight * totalGuests
              : (pricePerAdultDay * adults) + (pricePerKidDay * kids);
            let dayFoodPrice = 0;
            if (withFood) {
              const selection = dailyFoodSelections.find(s => 
                new Date(s.date).toISOString().split('T')[0] === date.toISOString().split('T')[0]
              );
              if (selection) {
                const pkg = availableFoodPackages.find(p => 
                  p.foodPackageId === selection.packageId || p._id?.toString() === selection.packageId
                );
                if (pkg) {
                  dayFoodPrice = (pkg.pricePerAdult * adults) + (pkg.pricePerKid * kids);
                }
              } else if (selectedFoodPackage) {
                dayFoodPrice = (selectedFoodPackage.pricePerAdult * adults) + 
                               (selectedFoodPackage.pricePerKid * kids);
              }
            }
            breakdown.push({
              date: date,
              accommodationPrice: dayAccommodationPrice,
              foodPrice: dayFoodPrice,
              extraCharges: 0 
            });
            currentDate.setDate(currentDate.getDate() + 1);
          }
          return breakdown;
        })(),
        accommodationPrice,
        foodPackagePrice,
        totalPrice: calculatedTotalPrice,
        nights: effectiveNights,
        days: effectiveDays
      },
      locationSnapshot: {
        name: location.name,
        address: location.address,
        amenities: location.amenities || []
      }
    });

    // Prepare slot documents (session = null for regular bookings)
    const slotDocs = datesToLock.map(date => ({
      locationId: location._id,
      date,
      bookingId: booking._id,
      session: null
    }));

    // Attempt to insert all slots atomically
    try {
      await BookedSlot.insertMany(slotDocs, { ordered: false });
    } catch (err) {
      if (err.code === 11000) { // duplicate key error
        // Clean up any slots that may have been inserted (safety)
        await BookedSlot.deleteMany({ bookingId: booking._id });
        return res.status(409).json({
          success: false,
          error: 'Selected dates are already booked for this location'
        });
      }
      // Some other database error
      console.error('Slot insertion error:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to secure booking dates'
      });
    }

    // All slots are now locked – save the booking
    try {
      await booking.save();
    } catch (saveErr) {
      // If booking save fails, release the slots
      await BookedSlot.deleteMany({ bookingId: booking._id });
      throw saveErr;
    }

    // =========================================================
    // 🔒 END OF ATOMIC LOCK
    // =========================================================

    // =========================================================
    // 🏊 POOL PARTY LOGIC (your existing code, unchanged)
    // =========================================================
    if (location.poolPartyConfig?.hasPoolParty) {
      let poolParty = null;
      let isLocationInPool = false;
      
      if (location.poolPartyConfig?.poolPartyType === 'shared' && location.poolPartyConfig?.sharedPoolPartyId) {
        poolParty = await PoolParty.findById(location.poolPartyConfig.sharedPoolPartyId);
        if (poolParty) {
          isLocationInPool = poolParty.sharedLocations.some(
            locId => locId.toString() === location._id.toString()
          );
        }
      } else if (location.poolPartyConfig?.poolPartyType === 'private') {
        poolParty = await PoolParty.findOne({
          type: 'private',
          locationId: location._id,
          isActive: true
        });
        if (poolParty) {
          isLocationInPool = true;
        }
      }
      
      if (poolParty && isLocationInPool) {
        let sessionToUse = 'Full Day';
        const sessionConfig = poolParty.timings.find(t => t.session === sessionToUse);
        if (sessionConfig) {
          let poolPartyDays = effectiveDays;
          if (!sameDayCheckout) {
            poolPartyDays = Math.max(0, effectiveDays - 1);
          }
          for (let i = 0; i < poolPartyDays; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(currentDate.getDate() + i);
            const poolPartyPrice = (sessionConfig.pricing.perAdult * adults) +
                                   (sessionConfig.pricing.perKid * kids);
            const availableCapacity = await poolParty.getAvailableCapacity(currentDate, sessionToUse);
            if (availableCapacity >= (adults + kids)) {
              const poolPartyBooking = new PoolPartyBooking({
                poolPartyId: poolParty._id,
                locationId: location._id,
                guestName: name,
                email: email || '',
                phone: phone,
                address: address,
                bookingDate: new Date(currentDate),
                session: sessionToUse,
                adults: adults,
                kids: kids,
                totalGuests: adults + kids,
                pricing: {
                  pricePerAdult: sessionConfig.pricing.perAdult,
                  pricePerKid: sessionConfig.pricing.perKid,
                  totalPrice: poolPartyPrice,
                  foodPackagePrice: 0
                },
                paymentType: booking.paymentType || 'token',
                amountPaid: 0,
                remainingAmount: 0,
                paymentStatus: 'location-booking',
                isIncludedInLocationBooking: true,
                mainBookingId: booking._id,
                isAutoCreatedFromLocation: true,
                withFood: false,
                foodPackage: null,
                foodFromLocation: false,
                notes: `Auto-created for location booking from ${location.name}. Payment handled in main booking. Pool party type: ${poolParty.type}`
              });
              await poolPartyBooking.save();
            }
          }
        }
      }
    }

    await booking.populate("location");

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking,
      priceBreakdown: {
        accommodation: accommodationPrice,
        food: foodPackagePrice,
        total: calculatedTotalPrice,
        effectiveNights,
        effectiveDays
      }
    });

  } catch (err) {
    console.error("Booking creation error:", err);
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

export const getBookedDates = async (req, res) => {
  try {
    const { locationId } = req.params;

    const slots = await BookedSlot.find({
      locationId,
      session: null   // regular bookings only (ignore pool party slots)
    }).distinct('date');

    const bookedDates = slots.map(date => {
      const d = new Date(date);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    });

    return res.json({ success: true, bookedDates });
  } catch (err) {
    console.error("Get booked dates error:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

export const getBookings = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, paymentType, startDate, endDate } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter object
    const filter = {};

    if (status) {
      filter.paymentStatus = status;
    }

    if (paymentType) {
      filter.paymentType = paymentType;
    }

    // Date range filter (based on checkInDate)
    if (startDate || endDate) {
      filter.checkInDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        filter.checkInDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        filter.checkInDate.$lte = end;
      }
    }

    // Text search (if provided)
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { razorpayOrderId: { $regex: search, $options: 'i' } },
        { 'location.name': { $regex: search, $options: 'i' } }
      ];
    }

    // Fetch bookings with pagination
    const bookings = await Booking.find(filter)
      .populate('location', 'name address') // select only needed fields
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Booking.countDocuments(filter);

    // Add payment summary (optional, can be computed client‑side)
    const bookingsWithPaymentSummary = bookings.map(booking => ({
      ...booking.toObject(),
      paymentSummary: {
        type: booking.paymentType,
        paid: booking.amountPaid,
        remaining: booking.remainingAmount,
        total: booking.pricing.totalPrice,
        status: booking.paymentStatus
      }
    }));

    res.json({
      success: true,
      count: bookings.length,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      bookings: bookingsWithPaymentSummary
    });
  } catch (err) {
    console.error('Get bookings error:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};

export const getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("location");
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: "Booking not found" 
      });
    }

    const bookingWithPaymentDetails = {
      ...booking.toObject(),
      paymentDetails: {
        type: booking.paymentType,
        amountPaid: booking.amountPaid,
        remainingAmount: booking.remainingAmount,
        totalAmount: booking.pricing.totalPrice,
        paymentStatus: booking.paymentStatus,
        isTokenPayment: booking.paymentType === 'token',
        isFullyPaid: booking.remainingAmount === 0
      }
    };

    res.json({
      success: true,
      booking: bookingWithPaymentDetails
    });
  } catch (err) {
    console.error("Get booking by ID error:", err);
    res.status(404).json({ 
      success: false,
      error: "Booking not found" 
    });
  }
};

export const updateBooking = async (req, res) => {
  try {
    const { 
      checkInDate,
      checkOutDate,
      checkInTime,
      name,
      phone,
      email,
      address,
      adults,
      kids,
      withFood,
      foodPackageId,
      dailyFoodSelections,
      paymentType, 
      amountPaid, 
      remainingAmount,
      pricing,
      sameDayCheckout,
      ...updateData 
    } = req.body;

    const booking = await Booking.findById(req.params.id).populate("location");
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: "Booking not found" 
      });
    }

    const location = booking.location;

    // -----------------------------------------------------------------
    // Step 1: If any capacity‑affecting fields are present, handle pool party bookings
    //         AND recalculate pricing exactly like createBooking
    // -----------------------------------------------------------------
    const capacityFieldsChanged = 
      checkInDate !== undefined ||
      checkOutDate !== undefined ||
      adults !== undefined ||
      kids !== undefined ||
      sameDayCheckout !== undefined ||
      withFood !== undefined ||
      foodPackageId !== undefined ||
      dailyFoodSelections !== undefined;

    let recalculatedData = {};

    if (capacityFieldsChanged) {
      // 1.1 Delete all existing pool party bookings linked to this main booking
      await PoolPartyBooking.deleteMany({
        mainBookingId: booking._id,
        isIncludedInLocationBooking: true
      });

      // 1.2 Determine the new effective dates and guest counts (same as createBooking)
      const startDate = new Date(checkInDate || booking.checkInDate);
      startDate.setUTCHours(0, 0, 0, 0);

      const useSameDayCheckout = sameDayCheckout !== undefined 
        ? sameDayCheckout 
        : booking.sameDayCheckout;

      let endDate;
      if (useSameDayCheckout) {
        endDate = new Date(startDate);
        endDate.setUTCHours(23, 59, 59, 999);
      } else {
        endDate = new Date(checkOutDate || booking.checkOutDate);
        endDate.setUTCHours(23, 59, 59, 999);
      }

      const timeDiff = Math.abs(endDate - startDate);
      const totalDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
      let effectiveDays = useSameDayCheckout ? 1 : Math.max(1, totalDays);
      let effectiveNights = 0;
      
      if (location?.propertyDetails?.nightStay === true && !useSameDayCheckout) {
        effectiveNights = Math.max(0, effectiveDays - 1);
      }

      const adultsCount = adults !== undefined ? parseInt(adults) : booking.adults;
      const kidsCount = kids !== undefined ? parseInt(kids) : booking.kids;
      const totalGuests = adultsCount + kidsCount;

      // ---------- PRICE RECALCULATION (copied from createBooking) ----------
      // Check for active offer
      let activeOffer = null;
      const activeOffers = await Offer.find({
        offerType: "location",
        selectedLocations: location._id,
        startDate: { $lte: startDate },
        endDate: { $gte: startDate },
        isActive: true
      }).sort({ createdAt: -1 });

      if (activeOffers.length > 0) {
        activeOffer = activeOffers[0];
      }

      const basePricing = activeOffer ? activeOffer.locationPricing : location.pricing;

      const pricePerPersonNight = basePricing?.pricePerPersonNight || 0;
      const pricePerAdultDay = basePricing?.pricePerAdultDay || 0;
      const pricePerKidDay = basePricing?.pricePerKidDay || 0;
      const extraPersonCharge = basePricing?.extraPersonCharge || 0;

      const isNightStayAvailable = location?.propertyDetails?.nightStay === true && !useSameDayCheckout;

      // Accommodation pricing
      let accommodationPrice = 0;
      if (isNightStayAvailable && pricePerPersonNight > 0) {
        accommodationPrice = pricePerPersonNight * totalGuests * effectiveNights;
      } else {
        accommodationPrice = (pricePerAdultDay * adultsCount * effectiveDays) +
                            (pricePerKidDay * kidsCount * effectiveDays);
      }

      // Extra person charge
      if (totalGuests > location.capacityOfPersons && extraPersonCharge > 0) {
        const extraPersons = totalGuests - location.capacityOfPersons;
        const extraMultiplier = isNightStayAvailable ? effectiveNights : effectiveDays;
        const extraCharge = extraPersonCharge * extraPersons * extraMultiplier;
        accommodationPrice += extraCharge;
      }

      // Food packages
      let availableFoodPackages = [];
      if (activeOffer && activeOffer.locationPricing?.foodPackages) {
        availableFoodPackages = activeOffer.locationPricing.foodPackages.filter(
          pkg => pkg.locationId?.toString() === location._id.toString()
        );
      } else {
        availableFoodPackages = basePricing?.foodPackages || [];
      }

      let foodPackagePrice = 0;
      let selectedFoodPackage = null;

      const useWithFood = withFood !== undefined ? withFood : booking.withFood;
      const useFoodPackageId = foodPackageId || booking.foodPackage?.packageId;

      if (useWithFood && useFoodPackageId) {
        selectedFoodPackage = availableFoodPackages.find(pkg => 
          pkg.foodPackageId === useFoodPackageId || pkg._id?.toString() === useFoodPackageId
        );

        if (selectedFoodPackage) {
          if (useSameDayCheckout || effectiveDays === 1) {
            foodPackagePrice = (selectedFoodPackage.pricePerAdult * adultsCount) +
                              (selectedFoodPackage.pricePerKid * kidsCount);
          } else if (dailyFoodSelections && dailyFoodSelections.length > 0) {
            let totalFoodPrice = 0;
            for (const selection of dailyFoodSelections) {
              const pkg = availableFoodPackages.find(p => 
                p.foodPackageId === selection.packageId || p._id?.toString() === selection.packageId
              );
              if (pkg) {
                totalFoodPrice += (pkg.pricePerAdult * adultsCount) + (pkg.pricePerKid * kidsCount);
              }
            }
            foodPackagePrice = totalFoodPrice;
          } else {
            foodPackagePrice = (selectedFoodPackage.pricePerAdult * adultsCount +
                              selectedFoodPackage.pricePerKid * kidsCount) * effectiveDays;
          }
        }
      }

      const calculatedTotalPrice = accommodationPrice + foodPackagePrice;
      // ---------- END PRICE RECALCULATION ----------

      // 1.3 Now create new pool party bookings (only if location has pool party)
      if (location.poolPartyConfig?.hasPoolParty) {
        let poolParty = null;
        let isLocationInPool = false;

        // Handle SHARED pool parties
        if (location.poolPartyConfig?.poolPartyType === 'shared' && location.poolPartyConfig?.sharedPoolPartyId) {
          poolParty = await PoolParty.findById(location.poolPartyConfig.sharedPoolPartyId);
          if (poolParty) {
            isLocationInPool = poolParty.sharedLocations.some(
              locId => locId.toString() === location._id.toString()
            );
          }
        } 
        // Handle PRIVATE pool parties
        else if (location.poolPartyConfig?.poolPartyType === 'private') {
          poolParty = await PoolParty.findOne({
            type: 'private',
            locationId: location._id,
            isActive: true
          });
          if (poolParty) isLocationInPool = true;
        }

        if (poolParty && isLocationInPool) {
          const sessionToUse = 'Full Day';
          const sessionConfig = poolParty.timings.find(t => t.session === sessionToUse);

          if (sessionConfig) {
            // Determine number of days for pool party
            let poolPartyDays = effectiveDays;
            if (!useSameDayCheckout) {
              poolPartyDays = Math.max(0, effectiveDays - 1); // exclude checkout day
            }

            for (let i = 0; i < poolPartyDays; i++) {
              const currentDate = new Date(startDate);
              currentDate.setDate(currentDate.getDate() + i);

              const poolPartyPrice = (sessionConfig.pricing.perAdult * adultsCount) +
                                     (sessionConfig.pricing.perKid * kidsCount);

              const availableCapacity = await poolParty.getAvailableCapacity(currentDate, sessionToUse);

              if (availableCapacity >= (adultsCount + kidsCount)) {
                const poolPartyBooking = new PoolPartyBooking({
                  poolPartyId: poolParty._id,
                  locationId: location._id,
                  guestName: name || booking.name,
                  email: email || booking.email || '',
                  phone: phone || booking.phone,
                  address: address || booking.address,
                  bookingDate: new Date(currentDate),
                  session: sessionToUse,
                  adults: adultsCount,
                  kids: kidsCount,
                  totalGuests: adultsCount + kidsCount,
                  pricing: {
                    pricePerAdult: sessionConfig.pricing.perAdult,
                    pricePerKid: sessionConfig.pricing.perKid,
                    totalPrice: poolPartyPrice,
                    foodPackagePrice: 0
                  },
                  paymentType: paymentType || booking.paymentType || 'token',
                  amountPaid: 0,
                  remainingAmount: 0,
                  paymentStatus: 'location-booking',
                  isIncludedInLocationBooking: true,
                  mainBookingId: booking._id,
                  isAutoCreatedFromLocation: true,
                  withFood: false,
                  foodPackage: null,
                  foodFromLocation: false,
                  notes: `Auto-created for location booking from ${location.name}. Payment handled in main booking.`
                });

                await poolPartyBooking.save();
              }
            }
          }
        }
      }

      // Build recalculatedData for the main booking update
      recalculatedData = {
        ...(checkInDate && { checkInDate: startDate }),
        ...(checkOutDate && { checkOutDate: endDate }),
        ...(adults !== undefined && { adults: adultsCount }),
        ...(kids !== undefined && { kids: kidsCount }),
        ...(withFood !== undefined && { withFood: useWithFood }),
        ...(sameDayCheckout !== undefined && { sameDayCheckout: useSameDayCheckout }),
        ...(foodPackageId !== undefined && {
          foodPackage: selectedFoodPackage ? {
            packageId: selectedFoodPackage.foodPackageId || selectedFoodPackage._id,
            name: selectedFoodPackage.name,
            pricePerAdult: selectedFoodPackage.pricePerAdult,
            pricePerKid: selectedFoodPackage.pricePerKid,
            description: selectedFoodPackage.description
          } : null
        }),
        ...(dailyFoodSelections !== undefined && {
          dailyFoodPackages: dailyFoodSelections.map(selection => {
            const pkg = availableFoodPackages.find(p => 
              p.foodPackageId === selection.packageId || p._id?.toString() === selection.packageId
            );
            return pkg ? {
              date: new Date(selection.date),
              packageId: pkg.foodPackageId || pkg._id,
              name: pkg.name,
              pricePerAdult: pkg.pricePerAdult,
              pricePerKid: pkg.pricePerKid,
              description: pkg.description
            } : null;
          }).filter(Boolean)
        }),
        pricing: {
          pricePerPersonNight,
          pricePerAdultDay,
          pricePerKidDay,
          extraPersonCharge,
          selectedFoodPackage: selectedFoodPackage ? {
            packageId: selectedFoodPackage.foodPackageId || selectedFoodPackage._id,
            name: selectedFoodPackage.name,
            pricePerAdult: selectedFoodPackage.pricePerAdult,
            pricePerKid: selectedFoodPackage.pricePerKid,
            description: selectedFoodPackage.description
          } : null,
          accommodationPrice,
          foodPackagePrice,
          totalPrice: calculatedTotalPrice,
          nights: effectiveNights,
          days: effectiveDays
        }
      };
    }

    // -----------------------------------------------------------------
    // Step 2: Handle payment updates (existing logic)
    // -----------------------------------------------------------------
    let paymentUpdateData = {};
    if (amountPaid !== undefined || remainingAmount !== undefined || paymentType) {
      const newAmountPaid = amountPaid !== undefined ? parseFloat(amountPaid) : booking.amountPaid;
      const newRemainingAmount = remainingAmount !== undefined ? parseFloat(remainingAmount) : booking.remainingAmount;
      const newPaymentType = paymentType || booking.paymentType;
      
      let paymentStatus = booking.paymentStatus;
      
      if (newAmountPaid > 0 && newRemainingAmount > 0) {
        paymentStatus = 'partially_paid';
      } else if (newRemainingAmount === 0 && newAmountPaid > 0) {
        paymentStatus = 'paid';
      } else if (newAmountPaid === 0) {
        paymentStatus = 'pending';
      }
      
      paymentUpdateData = {
        ...(paymentType && { paymentType: newPaymentType }),
        ...(amountPaid !== undefined && { amountPaid: newAmountPaid }),
        ...(remainingAmount !== undefined && { remainingAmount: newRemainingAmount }),
        paymentStatus
      };
    }

    // -----------------------------------------------------------------
    // Step 3: Build final update object and save
    // -----------------------------------------------------------------
    const finalUpdateData = {
      ...updateData,
      ...(checkInTime && { checkInTime }),
      ...(name && { name }),
      ...(phone && { phone }),
      ...(email !== undefined && { email }),
      ...(address && { address }),
      ...recalculatedData,
      ...paymentUpdateData
    };

    const updatedBooking = await Booking.findByIdAndUpdate(
      req.params.id,
      finalUpdateData,
      { new: true, runValidators: true }
    ).populate("location");

    if (!updatedBooking) {
      return res.status(404).json({ 
        success: false,
        error: "Booking not found" 
      });
    }

    res.json({
      success: true,
      message: "Booking updated successfully",
      booking: updatedBooking
    });

  } catch (err) {
    console.error("Update booking error:", err);
    res.status(400).json({ 
      success: false,
      error: err.message 
    });
  }
};

export const updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus, amountPaid, remainingAmount, paymentType } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: "Booking not found"
      });
    }

    const updateData = {};
    
    if (paymentStatus) updateData.paymentStatus = paymentStatus;
    if (amountPaid !== undefined) updateData.amountPaid = parseFloat(amountPaid);
    if (remainingAmount !== undefined) updateData.remainingAmount = parseFloat(remainingAmount);
    if (paymentType) updateData.paymentType = paymentType;

    if (amountPaid !== undefined && remainingAmount === undefined) {
      updateData.remainingAmount = Math.max(0, booking.pricing.totalPrice - parseFloat(amountPaid));
    }

    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate("location");

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

export const getBookingsByPaymentType = async (req, res) => {
  try {
    const { paymentType } = req.params;
    const { status } = req.query;

    const filter = { paymentType };
    if (status) filter.paymentStatus = status;

    const bookings = await Booking.find(filter)
      .populate("location")
      .sort({ createdAt: -1 });

    const stats = await Booking.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: "$amountPaid" },
          totalRemaining: { $sum: "$remainingAmount" },
          paidBookings: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] }
          },
          pendingBookings: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "pending"] }, 1, 0] }
          }
        }
      }
    ]);

    const statistics = stats[0] ? {
      totalBookings: stats[0].totalBookings,
      totalRevenue: stats[0].totalRevenue,
      totalRemaining: stats[0].totalRemaining,
      paidBookings: stats[0].paidBookings,
      pendingBookings: stats[0].pendingBookings
    } : {
      totalBookings: 0,
      totalRevenue: 0,
      totalRemaining: 0,
      paidBookings: 0,
      pendingBookings: 0
    };

    res.json({
      success: true,
      paymentType,
      statistics,
      count: bookings.length,
      bookings
    });
  } catch (err) {
    console.error("Get bookings by payment type error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

export const deleteBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: "Booking not found"
      });
    }

    // Delete all associated pool party bookings (your existing code)
    const poolPartyBookings = await PoolPartyBooking.find({
      mainBookingId: booking._id,
      isIncludedInLocationBooking: true
    });
    if (poolPartyBookings.length > 0) {
      await PoolPartyBooking.deleteMany({
        mainBookingId: booking._id,
        isIncludedInLocationBooking: true
      });
      console.log(`🗑️ Deleted ${poolPartyBookings.length} associated pool party bookings`);
    }

    // 🆕 Delete all booked slots for this booking
    await BookedSlot.deleteMany({ bookingId: booking._id });

    // Finally delete the main booking
    await Booking.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Booking deleted successfully",
      booking,
      deletedPoolPartyBookings: poolPartyBookings.length
    });
  } catch (err) {
    console.error("Delete booking error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

export const getPaymentAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const analytics = await Booking.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$paymentType",
          totalBookings: { $sum: 1 },
          totalAmountPaid: { $sum: "$amountPaid" },
          totalRemainingAmount: { $sum: "$remainingAmount" },
          totalRevenue: { $sum: "$pricing.totalPrice" },
          paidBookings: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] }
          },
          pendingBookings: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "pending"] }, 1, 0] }
          },
          averagePayment: { $avg: "$amountPaid" }
        }
      }
    ]);

    const overall = await Booking.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          totalAmountPaid: { $sum: "$amountPaid" },
          totalRemainingAmount: { $sum: "$remainingAmount" },
          totalRevenue: { $sum: "$pricing.totalPrice" },
          collectionRate: {
            $avg: {
              $divide: ["$amountPaid", "$pricing.totalPrice"]
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      analytics,
      overall: overall[0] || {
        totalBookings: 0,
        totalAmountPaid: 0,
        totalRemainingAmount: 0,
        totalRevenue: 0,
        collectionRate: 0
      },
      timeframe: {
        startDate,
        endDate
      }
    });
  } catch (err) {
    console.error("Get payment analytics error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};