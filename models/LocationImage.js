import mongoose from "mongoose";

const ImageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  cloudinaryId: { type: String }, // Store Cloudinary public_id
  alt: { type: String },
  title: { type: String, required: true },
  isMainImage: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  format: { type: String, default: 'webp' }, // Store image format
  fileSize: { type: Number } // Store file size
});

const LocationImageSchema = new mongoose.Schema({
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Location",
    required: true,
  },
  images: [ImageSchema],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("LocationImage", LocationImageSchema);