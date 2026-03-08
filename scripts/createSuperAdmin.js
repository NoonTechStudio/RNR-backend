import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import Admin from '../models/Admin.js';
import connectDB from '../config/db.js';

const createSuperAdmin = async () => {
  try {
    await connectDB();
    
    // Check if super admin already exists
    const existingAdmin = await Admin.findOne({ role: 'superadmin' });
    if (existingAdmin) {
      console.log('✅ Super admin already exists');
      process.exit(0);
    }

    // Create super admin
    const superAdmin = new Admin({
      username: process.env.DEFAULT_ADMIN_USERNAME || 'superadmin',
      email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@resort.com',
      password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123!',
      role: 'superadmin'
    });

    await superAdmin.save();
    console.log('✅ Super admin created successfully');
    console.log('📧 Email:', superAdmin.email);
    console.log('👤 Username:', superAdmin.username);
    console.log('🔑 Password: [hidden]');
    console.log('🎯 Role:', superAdmin.role);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating super admin:', error);
    process.exit(1);
  }
};

createSuperAdmin();