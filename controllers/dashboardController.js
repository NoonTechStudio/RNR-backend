// controllers/DashboardController.js
import Booking from "../models/Booking.js";
import Location from "../models/Location.js";
import Review from "../models/Review.js";
import PoolPartyBooking from "../models/PoolPartyBooking.js";

export const getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    // Get total bookings count
    const totalBookings = await Booking.countDocuments();
    
    // Get monthly bookings
    const monthlyBookings = await Booking.countDocuments({
      createdAt: { $gte: startOfMonth }
    });
    
    // Get yearly bookings
    const yearlyBookings = await Booking.countDocuments({
      createdAt: { $gte: startOfYear }
    });

    // Get revenue statistics
    const revenueStats = await Booking.aggregate([
      {
        $match: {
          paymentStatus: "paid",
          createdAt: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$pricing.totalPrice" },
          averageBookingValue: { $avg: "$pricing.totalPrice" }
        }
      }
    ]);

    // Get location statistics
    const locationStats = await Location.aggregate([
      {
        $lookup: {
          from: "bookings",
          localField: "_id",
          foreignField: "location",
          as: "bookings"
        }
      },
      {
        $project: {
          name: 1,
          totalBookings: { $size: "$bookings" },
          isActive: 1
        }
      },
      {
        $sort: { totalBookings: -1 }
      }
    ]);

    // Get booking status distribution
    const bookingStatus = await Booking.aggregate([
      {
        $group: {
          _id: "$paymentStatus",
          count: { $sum: 1 }
        }
      }
    ]);

    // Get recent reviews with ratings
    const recentReviews = await Review.find()
      .populate('location', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    // Calculate occupancy rate (simplified)
    const totalLocations = await Location.countDocuments({ isActive: true });
    const bookedLocations = await Booking.distinct("location", {
      checkInDate: { $lte: today },
      checkOutDate: { $gte: today }
    });

    const occupancyRate = totalLocations > 0 
      ? (bookedLocations.length / totalLocations) * 100 
      : 0;

    res.json({
      success: true,
      stats: {
        overview: {
          totalBookings,
          monthlyBookings,
          yearlyBookings,
          totalLocations: await Location.countDocuments({ isActive: true }),
          occupancyRate: Math.round(occupancyRate)
        },
        financial: revenueStats[0] || { totalRevenue: 0, averageBookingValue: 0 },
        locations: locationStats,
        bookingStatus,
        recentReviews,
        occupancy: {
          current: bookedLocations.length,
          total: totalLocations,
          rate: Math.round(occupancyRate)
        }
      }
    });

  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};

export const getRecentActivity = async (req, res) => {
  try {
    // 1. Fetch location bookings
    const recentBookings = await Booking.find()
      .populate('location', 'name')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('name phone checkInDate checkOutDate pricing.totalPrice paymentType remainingAmount amountPaid paymentStatus createdAt');

    // 2. Fetch pool party bookings
    const recentPoolPartyBookings = await PoolPartyBooking.find()
      .populate('poolPartyId', 'locationName')
      .populate('locationId', 'name')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('guestName phone bookingDate session pricing.totalPrice paymentType amountPaid remainingAmount paymentStatus createdAt locationId poolPartyId');

    // 3. Map pool party bookings to a shape similar to location bookings
    const mappedPoolParty = recentPoolPartyBookings.map(pb => ({
      _id: pb._id,
      name: pb.guestName,
      phone: pb.phone,
      checkInDate: pb.bookingDate,
      checkOutDate: pb.bookingDate, // same day for pool party
      session: pb.session,           // include session for display
      pricing: { totalPrice: pb.pricing.totalPrice },
      paymentType: pb.paymentType,
      amountPaid: pb.amountPaid,
      remainingAmount: pb.remainingAmount,
      paymentStatus: pb.paymentStatus,
      createdAt: pb.createdAt,
      location: pb.locationId 
        ? { name: pb.locationId.name } 
        : { name: pb.poolPartyId?.locationName || 'Pool Party' },
      bookingType: 'poolparty'        // marker to distinguish in frontend
    }));

    // 4. Map location bookings with type marker
    const mappedLocation = recentBookings.map(b => ({
      ...b.toObject(),
      bookingType: 'location'
    }));

    // 5. Combine and sort by createdAt, then keep top 10
    const combined = [...mappedLocation, ...mappedPoolParty]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    // 6. Fetch reviews (unchanged)
    const recentReviews = await Review.find()
      .populate('location', 'name')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('guestName rating title createdAt location');

    res.json({
      success: true,
      recentActivity: {
        bookings: combined,
        reviews: recentReviews
      }
    });

  } catch (err) {
    console.error("Recent activity error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};