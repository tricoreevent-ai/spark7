/**
 * Migration: Ensure all products have tenantId
 * This script will:
 * 1. Ensure default tenant exists
 * 2. Update all products without tenantId to have the default tenantId
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Product } from '../models/Product.js';
import { Tenant } from '../models/Tenant.js';

dotenv.config({ path: '.env' });

const runMigration = async () => {
  try {
    const mongoUrl = process.env.DATABASE_URL;
    if (!mongoUrl) {
      throw new Error('DATABASE_URL not set in .env');
    }

    await mongoose.connect(mongoUrl);
    console.log('Connected to MongoDB');

    // Ensure default tenant exists
    let defaultTenant = await Tenant.findOne({ slug: 'default' });
    if (!defaultTenant) {
      defaultTenant = await Tenant.create({
        name: 'Default Business',
        slug: 'default',
        isActive: true,
      });
      console.log('Created default tenant:', defaultTenant._id);
    } else {
      console.log('Default tenant exists:', defaultTenant._id);
    }

    const defaultTenantId = defaultTenant._id.toString();

    // Check products without tenantId
    const missingCount = await Product.countDocuments({ tenantId: { $exists: false } });
    console.log(`Found ${missingCount} products without tenantId`);

    if (missingCount > 0) {
      // Update products without tenantId
      const result = await Product.updateMany(
        { tenantId: { $exists: false } },
        { $set: { tenantId: defaultTenantId } }
      );
      console.log(`Updated ${result.modifiedCount} products with default tenantId`);
    }

    // Verify all products now have tenantId
    const totalProducts = await Product.countDocuments({});
    const productsWithTenant = await Product.countDocuments({ tenantId: { $exists: true } });
    
    console.log(`Total products: ${totalProducts}`);
    console.log(`Products with tenantId: ${productsWithTenant}`);

    if (totalProducts === productsWithTenant) {
      console.log('✓ Migration successful! All products have tenantId');
    } else {
      console.log('⚠ Warning: Some products still missing tenantId');
    }

    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

runMigration();
