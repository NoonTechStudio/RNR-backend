import Offer from "../models/Offer.js";
import Location from "../models/Location.js";
import PoolParty from "../models/poolParty.js";

// Get all offers
export const getAllOffers = async (req, res) => {
  try {
    const offers = await Offer.find()
      .populate("selectedLocations", "name")
      .populate("selectedPoolParties", "name")
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: offers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get active offers for a specific location on a specific date
export const getActiveOffersForLocation = async (req, res) => {
  try {
    const { locationId, bookingDate } = req.query;
    
    if (!locationId || !bookingDate) {
      return res.status(400).json({
        success: false,
        error: "locationId and bookingDate are required"
      });
    }

    const date = new Date(bookingDate);
    
    const activeOffers = await Offer.find({
      offerType: "location",
      selectedLocations: locationId,
      startDate: { $lte: date },
      endDate: { $gte: date },
      isActive: true
    });

    res.json({
      success: true,
      data: activeOffers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get active offers for a specific pool party on a specific date
export const getActiveOffersForPoolParty = async (req, res) => {
  try {
    const { poolPartyId, bookingDate } = req.query;
    
    if (!poolPartyId || !bookingDate) {
      return res.status(400).json({
        success: false,
        error: "poolPartyId and bookingDate are required"
      });
    }

    const date = new Date(bookingDate);
    
    const activeOffers = await Offer.find({
      offerType: "poolparty",
      selectedPoolParties: poolPartyId,
      startDate: { $lte: date },
      endDate: { $gte: date },
      isActive: true
    });

    res.json({
      success: true,
      data: activeOffers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get all active offers for a given date (public)
export const getActiveOffers = async (req, res) => {
  try {
    const { bookingDate } = req.query;
    if (!bookingDate) {
      return res.status(400).json({ success: false, error: 'bookingDate is required' });
    }

    const date = new Date(bookingDate);
    const activeOffers = await Offer.find({
      startDate: { $lte: date },
      endDate: { $gte: date },
      isActive: true
    }).sort({ createdAt: -1 });

    const populated = await Offer.populate(activeOffers, [
      { path: 'selectedLocations', select: 'name' },
      { path: 'selectedPoolParties', select: 'name' }
    ]);

    res.json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Create new offer
export const createOffer = async (req, res) => {
  try {
    const {
      name,
      description,
      offerType,
      selectedLocations,
      selectedPoolParties,
      startDate,
      endDate,
      locationPricing,
      poolPartyPricing
    } = req.body;

    // Validation
    if (!name || !offerType || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name, offerType, startDate, endDate"
      });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({
        success: false,
        error: "Start date must be before end date"
      });
    }

    if (offerType === "location" && (!selectedLocations || selectedLocations.length === 0)) {
      return res.status(400).json({
        success: false,
        error: "At least one location must be selected for location type offers"
      });
    }

    if (offerType === "poolparty" && (!selectedPoolParties || selectedPoolParties.length === 0)) {
      return res.status(400).json({
        success: false,
        error: "At least one pool party must be selected for poolparty type offers"
      });
    }

    // Process locationPricing to ensure each food package has a locationId
    let processedLocationPricing = locationPricing;
    if (
      offerType === "location" &&
      locationPricing &&
      Array.isArray(locationPricing.foodPackages)
    ) {
      const foodPackagesWithLocation = locationPricing.foodPackages.map((pkg) => {
        // If frontend already sent a locationId (per selected location), respect it.
        // As a fallback (e.g. single-location offer), attach the first selected location.
        const fallbackLocationId =
          Array.isArray(selectedLocations) && selectedLocations.length === 1
            ? selectedLocations[0]
            : undefined;

        return {
          ...pkg,
          locationId: pkg.locationId || fallbackLocationId,
        };
      });
      processedLocationPricing = {
        ...locationPricing,
        foodPackages: foodPackagesWithLocation,
      };
    }

    // Process poolPartyPricing to ensure each food package/session has a poolPartyId
    let processedPoolPartyPricing = poolPartyPricing;
    if (
      offerType === "poolparty" &&
      poolPartyPricing &&
      Array.isArray(poolPartyPricing.foodPackages)
    ) {
      const foodPackagesWithPoolParty = poolPartyPricing.foodPackages.map((pkg) => {
        const fallbackPoolPartyId =
          Array.isArray(selectedPoolParties) && selectedPoolParties.length === 1
            ? selectedPoolParties[0]
            : undefined;

        return {
          ...pkg,
          poolPartyId: pkg.poolPartyId || fallbackPoolPartyId,
        };
      });
      const sessionsWithPoolParty = (poolPartyPricing.sessions || []).map((sess) => {
        const fallbackPoolPartyId =
          Array.isArray(selectedPoolParties) && selectedPoolParties.length === 1
            ? selectedPoolParties[0]
            : undefined;
        return {
          ...sess,
          poolPartyId: sess.poolPartyId || fallbackPoolPartyId,
        };
      });
      processedPoolPartyPricing = {
        ...poolPartyPricing,
        foodPackages: foodPackagesWithPoolParty,
        sessions: sessionsWithPoolParty,
      };
    }

    const newOffer = new Offer({
      name,
      description,
      offerType,
      selectedLocations: offerType === "location" ? selectedLocations : [],
      selectedPoolParties: offerType === "poolparty" ? selectedPoolParties : [],
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      locationPricing: offerType === "location" ? processedLocationPricing : {},
      poolPartyPricing: offerType === "poolparty" ? processedPoolPartyPricing : {},
      isActive: true
    });

    // Capture original pricing snapshots for audit / revert
    if (offerType === "location" && Array.isArray(selectedLocations) && selectedLocations.length > 0) {
      const locs = await Location.find({ _id: { $in: selectedLocations } });
      newOffer.originalLocationPricing = locs.map(loc => ({
        locationId: loc._id,
        pricingSnapshot: {
          pricePerAdultDay: loc.pricing?.pricePerAdultDay || 0,
          pricePerKidDay: loc.pricing?.pricePerKidDay || 0,
          pricePerPersonNight: loc.pricing?.pricePerPersonNight || 0,
          extraPersonCharge: loc.pricing?.extraPersonCharge || 0,
          foodPackages: (loc.pricing?.foodPackages || []).map(pkg => ({
            foodPackageId: pkg._id?.toString() || pkg.packageId || null,
            name: pkg.name || pkg.title || "",
            description: pkg.description || "",
            pricePerAdult: pkg.pricePerAdult || 0,
            pricePerKid: pkg.pricePerKid || 0,
            locationId: loc._id
          }))
        }
      }));
    }

    if (offerType === "poolparty" && Array.isArray(selectedPoolParties) && selectedPoolParties.length > 0) {
      const pps = await PoolParty.find({ _id: { $in: selectedPoolParties } });
      newOffer.originalPoolPartyPricing = pps.map(pp => ({
        poolPartyId: pp._id,
        pricingSnapshot: {
          sessions: (pp.timings || []).map(t => ({
            session: t.session,
            startTime: t.startTime,
            endTime: t.endTime,
            capacity: t.capacity,
            perAdult: t.pricing?.perAdult || 0,
            perKid: t.pricing?.perKid || 0
          })),
          foodPackages: (pp.selectedFoodPackages || []).map(fp => ({
            foodPackageId: fp.foodPackageId || fp._id?.toString() || null,
            name: fp.name || "",
            description: fp.description || "",
            pricePerAdult: fp.pricePerAdult || 0,
            pricePerKid: fp.pricePerKid || 0,
            poolPartyId: pp._id
          }))
        }
      }));
    }

    await newOffer.save();

    const savedOffer = await newOffer.populate([
      { path: "selectedLocations", select: "name" },
      { path: "selectedPoolParties", select: "name" }
    ]);

    res.status(201).json({
      success: true,
      data: savedOffer,
      message: "Offer created successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Update offer
export const updateOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const {
      name,
      description,
      selectedLocations,
      selectedPoolParties,
      startDate,
      endDate,
      locationPricing,
      poolPartyPricing,
      isActive
    } = req.body;

    const offer = await Offer.findById(offerId);
    if (!offer) {
      return res.status(404).json({
        success: false,
        error: "Offer not found"
      });
    }

    if (startDate && endDate) {
      if (new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({
          success: false,
          error: "Start date must be before end date"
        });
      }
    }

    // Update fields
    if (name) offer.name = name;
    if (description !== undefined) offer.description = description;
    if (startDate) offer.startDate = new Date(startDate);
    if (endDate) offer.endDate = new Date(endDate);
    
    if (selectedLocations && offer.offerType === "location") {
      offer.selectedLocations = selectedLocations;
      
      // Update original pricing snapshot
      const locs = await Location.find({ _id: { $in: selectedLocations } });
      offer.originalLocationPricing = locs.map(loc => ({
        locationId: loc._id,
        pricingSnapshot: {
          pricePerAdultDay: loc.pricing?.pricePerAdultDay || 0,
          pricePerKidDay: loc.pricing?.pricePerKidDay || 0,
          pricePerPersonNight: loc.pricing?.pricePerPersonNight || 0,
          extraPersonCharge: loc.pricing?.extraPersonCharge || 0,
          foodPackages: (loc.pricing?.foodPackages || []).map(pkg => ({
            foodPackageId: pkg._id?.toString() || pkg.packageId || null,
            name: pkg.name || pkg.title || "",
            description: pkg.description || "",
            pricePerAdult: pkg.pricePerAdult || 0,
            pricePerKid: pkg.pricePerKid || 0,
            locationId: loc._id
          }))
        }
      }));
    }
    
    if (selectedPoolParties && offer.offerType === "poolparty") {
      offer.selectedPoolParties = selectedPoolParties;
      
      // Update original pricing snapshot
      const pps = await PoolParty.find({ _id: { $in: selectedPoolParties } });
      offer.originalPoolPartyPricing = pps.map(pp => ({
        poolPartyId: pp._id,
        pricingSnapshot: {
          sessions: (pp.timings || []).map(t => ({
            session: t.session,
            startTime: t.startTime,
            endTime: t.endTime,
            capacity: t.capacity,
            perAdult: t.pricing?.perAdult || 0,
            perKid: t.pricing?.perKid || 0
          })),
          foodPackages: (pp.selectedFoodPackages || []).map(fp => ({
            foodPackageId: fp.foodPackageId || fp._id?.toString() || null,
            name: fp.name || "",
            description: fp.description || "",
            pricePerAdult: fp.pricePerAdult || 0,
            pricePerKid: fp.pricePerKid || 0,
            poolPartyId: pp._id
          }))
        }
      }));
    }
    
    if (locationPricing && offer.offerType === "location") {
      // Add locationId to food packages if not present
      const processedLocationPricing = {
        ...locationPricing,
        foodPackages: locationPricing.foodPackages?.map(pkg => ({
          ...pkg,
          locationId: pkg.locationId || selectedLocations?.[0]
        })) || []
      };
      offer.locationPricing = processedLocationPricing;
    }
    
    if (poolPartyPricing && offer.offerType === "poolparty") {
      // Add poolPartyId to food packages and sessions if not present
      const fallbackPoolPartyId =
        (selectedPoolParties && selectedPoolParties[0]) ||
        (offer.selectedPoolParties && offer.selectedPoolParties[0]);

      const processedPoolPartyPricing = {
        ...poolPartyPricing,
        foodPackages: poolPartyPricing.foodPackages?.map(pkg => ({
          ...pkg,
          poolPartyId: pkg.poolPartyId || fallbackPoolPartyId
        })) || [],
        sessions: poolPartyPricing.sessions?.map(sess => ({
          ...sess,
          poolPartyId: sess.poolPartyId || fallbackPoolPartyId
        })) || []
      };
      offer.poolPartyPricing = processedPoolPartyPricing;
    }
    
    if (isActive !== undefined) offer.isActive = isActive;
    
    offer.updatedAt = new Date();

    await offer.save();

    const updatedOffer = await offer.populate([
      { path: "selectedLocations", select: "name" },
      { path: "selectedPoolParties", select: "name" }
    ]);

    res.json({
      success: true,
      data: updatedOffer,
      message: "Offer updated successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Delete offer
export const deleteOffer = async (req, res) => {
  try {
    const { offerId } = req.params;

    const offer = await Offer.findByIdAndDelete(offerId);
    if (!offer) {
      return res.status(404).json({
        success: false,
        error: "Offer not found"
      });
    }

    res.json({
      success: true,
      message: "Offer deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get offer by ID
export const getOfferById = async (req, res) => {
  try {
    const { offerId } = req.params;

    const offer = await Offer.findById(offerId)
      .populate("selectedLocations", "name")
      .populate("selectedPoolParties", "name");

    if (!offer) {
      return res.status(404).json({
        success: false,
        error: "Offer not found"
      });
    }

    res.json({
      success: true,
      data: offer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
