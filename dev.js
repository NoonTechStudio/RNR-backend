// dev.js - Local Development Server
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";

// Import the app from server.js
import app from "./server.js";

// Local development server startup
const startServer = async () => {
  try {
    // Initialize database connection
    const connectDB = await import("./config/db.js").then(module => module.default);
    await connectDB();
    
    const PORT = process.env.PORT || 5001;
    
    const server = app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🚀 API URL: http://localhost:${PORT}`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
    });

    // Graceful shutdown for local development
    const gracefulShutdown = async (signal) => {
      console.log(`\n${signal} received, shutting down gracefully...`);
      
      server.close((err) => {
        if (err) {
          console.error('Error closing server:', err);
        } else {
          console.log('✅ HTTP server closed');
        }
        
        mongoose.connection.close(false, () => {
          console.log('✅ MongoDB connection closed');
          process.exit(0);
        });
      });
      
      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.log('⚠️ Forcing shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Handle process termination
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
};

// Start the local development server
startServer();