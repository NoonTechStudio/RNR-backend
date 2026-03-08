import Offer from "../models/Offer.js";

/**
 * Get active offer for a location on a specific date
 * Returns the first active offer found (highest priority if multiple offers)
 */
export const getActiveOfferForLocation = async (locationId, bookingDate) => {
  try {
    const date = new Date(bookingDate);
    date.setHours(0, 0, 0, 0);
    
    const offer = await Offer.findOne({
      offerType: "location",
      selectedLocations: locationId,
      startDate: { $lte: date },
      endDate: { $gte: date },
      isActive: true
    }).sort({ startDate: -1 }); // Get most recent offer if multiple exist
    
    return offer;
  } catch (error) {
    console.error("Error fetching offer for location:", error);
    return null;
  }
};

/**
 * Get active offer for a pool party on a specific date
 */
export const getActiveOfferForPoolParty = async (poolPartyId, bookingDate) => {
  try {
    const date = new Date(bookingDate);
    date.setHours(0, 0, 0, 0);
    
    const offer = await Offer.findOne({
      offerType: "poolparty",
      selectedPoolParties: poolPartyId,
      startDate: { $lte: date },
      endDate: { $gte: date },
      isActive: true
    }).sort({ startDate: -1 });
    
    return offer;
  } catch (error) {
    console.error("Error fetching offer for pool party:", error);
    return null;
  }
};

/**
 * Get all active offers for a location within a date range
 * Useful for checking multiple days of a booking
 */
export const getActiveOffersForLocationRange = async (locationId, startDate, endDate) => {
  try {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    const offers = await Offer.find({
      offerType: "location",
      selectedLocations: locationId,
      startDate: { $lte: end },
      endDate: { $gte: start },
      isActive: true
    }).sort({ startDate: 1 });
    
    return offers;
  } catch (error) {
    console.error("Error fetching offers for location range:", error);
    return [];
  }
};

/**
 * Apply location offer pricing to booking
 * Returns modified pricing object
 */
export const applyLocationOfferPricing = (offer, pricing, adults, kids, days, nights) => {
  if (!offer || !offer.locationPricing) {
    return pricing;
  }

  const modifiedPricing = { ...pricing };
  const offerPricing = offer.locationPricing;

  // Apply day pricing if available
  if (offerPricing.pricePerAdultDay !== undefined && offerPricing.pricePerKidDay !== undefined) {
    const dayAccommodation = 
      (offerPricing.pricePerAdultDay * adults * days) + 
      (offerPricing.pricePerKidDay * kids * days);
    
    modifiedPricing.accommodationPrice = dayAccommodation;
    modifiedPricing.pricePerAdultDay = offerPricing.pricePerAdultDay;
    modifiedPricing.pricePerKidDay = offerPricing.pricePerKidDay;
  }
  
  // Apply night pricing if available
  if (offerPricing.pricePerPersonNight !== undefined && nights > 0) {
    const totalGuests = adults + kids;
    const nightAccommodation = offerPricing.pricePerPersonNight * totalGuests * nights;
    
    modifiedPricing.accommodationPrice = nightAccommodation;
    modifiedPricing.pricePerPersonNight = offerPricing.pricePerPersonNight;
  }

  // Apply extra person charge if available
  if (offerPricing.extraPersonCharge !== undefined) {
    modifiedPricing.extraPersonCharge = offerPricing.extraPersonCharge;
  }

  // Mark offer as applied
  modifiedPricing.appliedOffer = offer._id;
  modifiedPricing.offerName = offer.name;

  return modifiedPricing;
};

/**
 * Get offer pricing for a food package
 */
export const getOfferFoodPackagePricing = (offer, foodPackageId) => {
  if (!offer || !offer.locationPricing || !offer.locationPricing.foodPackages) {
    return null;
  }

  const offerFoodPackage = offer.locationPricing.foodPackages.find(
    pkg => pkg.foodPackageId === foodPackageId || pkg.foodPackageId?.toString() === foodPackageId?.toString()
  );

  return offerFoodPackage || null;
};

/**
 * Apply pool party offer pricing to booking
 */
export const applyPoolPartyOfferPricing = (offer, session, pricing, adults, kids) => {
  if (!offer || !offer.poolPartyPricing) {
    return pricing;
  }

  const modifiedPricing = { ...pricing };
  const offerPricing = offer.poolPartyPricing;

  // Apply session pricing if available
  if (offerPricing.sessions && offerPricing.sessions.length > 0) {
    const sessionPricing = offerPricing.sessions.find(s => s.session === session);
    
    if (sessionPricing) {
      const totalPrice = 
        (sessionPricing.perAdult * adults) + 
        (sessionPricing.perKid * kids);
      
      modifiedPricing.totalPrice = totalPrice;
      modifiedPricing.pricePerAdult = sessionPricing.perAdult;
      modifiedPricing.pricePerKid = sessionPricing.perKid;
    }
  }

  // Mark offer as applied
  modifiedPricing.appliedOffer = offer._id;
  modifiedPricing.offerName = offer.name;

  return modifiedPricing;
};

/**
 * Get offer pool party food package pricing
 */
export const getOfferPoolPartyFoodPackagePricing = (offer, foodPackageId) => {
  if (!offer || !offer.poolPartyPricing || !offer.poolPartyPricing.foodPackages) {
    return null;
  }

  const offerFoodPackage = offer.poolPartyPricing.foodPackages.find(
    pkg => pkg.foodPackageId === foodPackageId || pkg.foodPackageId?.toString() === foodPackageId?.toString()
  );

  return offerFoodPackage || null;
};

/**
 * Check if a date is within offer duration
 */
export const isDateWithinOfferDuration = (date, offer) => {
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  const offerStart = new Date(offer.startDate);
  offerStart.setHours(0, 0, 0, 0);
  
  const offerEnd = new Date(offer.endDate);
  offerEnd.setHours(23, 59, 59, 999);
  
  return checkDate >= offerStart && checkDate <= offerEnd;
};

/**
 * Get applicable offer for each day in a booking range
 * Returns object with date as key and offer as value
 */
export const getDailyOffersForRange = async (locationId, startDate, endDate) => {
  try {
    const offers = await getActiveOffersForLocationRange(locationId, startDate, endDate);
    
    const dailyOffers = {};
    const currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    
    while (currentDate <= end) {
      const dateKey = currentDate.toISOString().split('T')[0];
      
      // Find offer applicable to this date
      const applicableOffer = offers.find(offer => 
        isDateWithinOfferDuration(currentDate, offer)
      );
      
      if (applicableOffer) {
        dailyOffers[dateKey] = applicableOffer;
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dailyOffers;
  } catch (error) {
    console.error("Error fetching daily offers:", error);
    return {};
  }
};
