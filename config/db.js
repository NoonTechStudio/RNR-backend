// config/db.js
import mongoose from "mongoose";
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error("❌ MONGO_URI is not defined in environment variables");
}

// Global cache for Vercel / serverless
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = {
    conn: null,
    promise: null,
  };
}

const connectDB = async () => {
  // Reuse existing connection
  if (cached.conn) {
    return cached.conn;
  }

  // Prevent multiple simultaneous connects
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI, {
      maxPoolSize: 5,                // ⭐ CRITICAL
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      retryWrites: true,
    }).then((mongoose) => {
      const conn = mongoose.connection;
      console.log("✅ MongoDB connected");
      console.log("📦 DB Host:", conn.host);
      console.log("🗄️ DB Name:", conn.name);
      return mongoose;
    }).catch(err => {
      cached.promise = null;
      console.error("❌ MongoDB connection error:", err);
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
};

export default connectDB;


