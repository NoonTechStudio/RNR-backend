import mongoose from 'mongoose';

const homepageHeroSchema = new mongoose.Schema({
  images: [{
    url: { type: String, required: true },
    cloudinaryId: { type: String },
    alt: { type: String },
    title: { type: String, required: true },
    isMainImage: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    format: { type: String, default: 'webp' },
    fileSize: { type: Number }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
homepageHeroSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('HomepageHero', homepageHeroSchema);