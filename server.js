import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import mongoose from "mongoose";

import connectDB from "./config/db.js";
import { validateRazorpayConfig } from "./config/razorpay.js";
import locationRoutes from "./routes/LocationRoutes.js";
import locationImageRoutes from "./routes/LocationImageRoutes.js";
import bookingRoutes from "./routes/BookingRoutes.js";
import reviewRoutes from "./routes/review.js";
import heroimageRoutes from "./routes/HomepageHeroRoutes.js";
import paymentRoutes from "./routes/PaymentRoutes.js";
import adminRoutes from "./routes/AdminRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import CaretakerRoutes from "./routes/CaretakerRoutes.js";
import PoolPartyRoutes from "./routes/poolPartyRoutes.js";
import validateEnvironment from "./config/envValidation.js";
import termsAndConditionsRoutes from "./routes/termsAndConditionsRoutes.js";
import OfferRoutes from "./routes/OfferRoutes.js";

// Security middleware
import {
  apiLimiter,
  securityHeaders,
  sanitizeInput
} from './middleware/security.js';

// Initialize environment variables
try {
  validateEnvironment();
} catch (error) {
  console.error('Environment validation failed:', error.message);
}

// Environment configuration
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

console.log(`🚀 Starting server in ${process.env.NODE_ENV || 'development'} mode`);

const app = express();
await connectDB();

// Enhanced security middleware with production optimizations
app.use(securityHeaders);
app.use(sanitizeInput);

// Apply rate limiting (adjust for Vercel's serverless environment)
if (process.env.VERCEL_ENV !== 'production') {
  app.use(apiLimiter);
}

// CORS configuration - FIXED VERSION
const allowedOrigins = [
  // Production frontend URLs
  "https://frontend-lilac-seven-36.vercel.app",
  "https://restand-relax-admin-frontend.vercel.app",
  "https://www.restandrelax.in",
  
  // Environment variables
  process.env.FRONTEND_URL,
  process.env.ADMIN_FRONTEND_URL,
  
  // Local development
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
].filter(Boolean); // Remove undefined values

// Log CORS config for debugging
console.log('🛡️ CORS Configuration:', {
  environment: process.env.NODE_ENV || 'development',
  allowedOrigins: allowedOrigins,
  isProduction
});

// SIMPLIFIED AND WORKING CORS CONFIGURATION
app.use(
  cors({
    origin: function (origin, callback) {
      console.log('🔍 Incoming request from origin:', origin);
      
      // Allow requests with no origin (mobile apps, Postman, curl, serverless functions)
      if (!origin) {
        console.log('✅ Allowing request with no origin');
        return callback(null, true);
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        console.log('✅ Origin allowed:', origin);
        return callback(null, true);
      }
      
      // Allow all Vercel preview deployments (both frontend and admin)
      const vercelPatterns = [
        /^https:\/\/.*\.vercel\.app$/,
        /^https:\/\/restand-relax-admin-frontend.*\.vercel\.app$/,
        /^https:\/\/frontend-.*\.vercel\.app$/,
      ];
      
      const isVercelDomain = vercelPatterns.some(pattern => pattern.test(origin));
      if (isVercelDomain) {
        console.log('✅ Vercel domain allowed:', origin);
        return callback(null, true);
      }
      
      // For development, allow localhost on any port
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        console.log('✅ Localhost allowed:', origin);
        return callback(null, true);
      }
      
      // Block all other origins
      console.warn('🚫 CORS blocked request from origin:', origin);
      console.warn('Allowed origins:', allowedOrigins);
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true,
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers'
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204
  })
);

// Handle preflight requests explicitly
app.options('*', cors());

// Body parsing with consistent limits
app.use(express.json({ 
  limit: '50mb'
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb' 
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  next();
});


// ===== ROUTES =====
app.use("/api/locations", locationRoutes);
app.use("/api/location-images", locationImageRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/homepage-hero", heroimageRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/caretaker", CaretakerRoutes);
app.use('/api/pool-parties', PoolPartyRoutes);
app.use("/api/terms-and-conditions", termsAndConditionsRoutes);
app.use("/api/offers", OfferRoutes);

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running on Vercel',
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString(),
    platform: 'Vercel Serverless',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    allowedOrigins: allowedOrigins
  });
});

// ===== ROOT ENDPOINT =====
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Rest & Relax Backend API - Deployed on Vercel',
    environment: process.env.NODE_ENV || 'production',
    version: '1.0.0',
    documentation: '/api/health'
  });
});

// ===== 404 HANDLER =====
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// ===== GLOBAL ERROR HANDLER =====
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  // CORS error handling
  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: 'CORS policy: Origin not allowed',
      origin: req.headers.origin,
      allowedOrigins: allowedOrigins
    });
  }
  
  // JSON parsing error
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body'
    });
  }
  
  // Rate limiting error
  if (error.status === 429) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later'
    });
  }
  
  // Default error response
  const errorResponse = {
    success: false,
    error: isProduction ? 'Internal server error' : error.message
  };
  
  // Include stack trace only in development
  if (isDevelopment) {
    errorResponse.stack = error.stack;
    errorResponse.details = error.toString();
  }
  
  res.status(error.status || 500).json(errorResponse);
});

// Initialize Razorpay config
try {
  validateRazorpayConfig();
  console.log('✅ Razorpay config validated');
} catch (error) {
  console.error('⚠️ Razorpay config validation failed:', error.message);
}

if (process.env.NODE_ENV === 'development') {
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => {
    console.log(`🚀 Server running locally on port ${PORT}`);
  });
}

// Export the app for Vercel serverless functions
export default app;