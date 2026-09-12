const validateEnvironment = () => {
  const requiredEnvVars = [
    'MONGO_URI',
    'JWT_SECRET', 
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
  ];

  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);

  // Check email configuration (either Resend or Gmail)
  if (!process.env.RESEND_API_KEY && (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)) {
    missing.push('RESEND_API_KEY (or EMAIL_USER & EMAIL_PASS)');
  }
  
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing);
    // ❌ Don't use process.exit in Vercel
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  console.log('✅ All environment variables validated');
};

export default validateEnvironment;
