const validateEnvironment = () => {
  const requiredEnvVars = [
    'MONGO_URI',
    'JWT_SECRET', 
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'EMAIL_USER',
    'EMAIL_PASS',
    // 'TWILIO_ACCOUNT_SID',
    // 'TWILIO_AUTH_TOKEN',
    // 'TWILIO_PHONE_NUMBER',
    // 'TWILIO_MESSAGING_SERVICE_SID'
  ];

  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing);
    // ❌ Don't use process.exit in Vercel
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  console.log('✅ All environment variables validated');
};

export default validateEnvironment;
