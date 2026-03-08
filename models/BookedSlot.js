import mongoose from 'mongoose';

const bookedSlotSchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',       // will reference the main booking
    required: true
  },
  // For regular bookings, session = null.
  // For pool parties, set to 'Morning', 'Evening', or 'Full Day'
  session: {
    type: String,
    enum: ['Morning', 'Evening', 'Full Day', null],
    default: null
  }
}, { timestamps: true });

// 🔐 Unique compound index – this prevents double bookings
bookedSlotSchema.index({ locationId: 1, date: 1, session: 1 }, { unique: true });

export default mongoose.model('BookedSlot', bookedSlotSchema);