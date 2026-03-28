import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Category } from './models/Category';
import { Product } from './models/Product';

dotenv.config({ path: './.env' });

const seedDatabase = async () => {
  try {
    const mongoUrl = process.env.DATABASE_URL;
    if (!mongoUrl) {
      throw new Error('DATABASE_URL is not defined in your .env file');
    }

    await mongoose.connect(mongoUrl);
    console.log('MongoDB connected for seeding...');

    // Clear existing data
    await Product.deleteMany({});
    await Category.deleteMany({});
    console.log('Cleared existing products and categories.');

    // Seed Categories
    const categories = [
      { name: 'Electronics', description: 'Gadgets and electronic devices' },
      { name: 'Groceries', description: 'Daily food and household items' },
      { name: 'Apparel', description: 'Clothing, shoes, and accessories' },
      { name: 'Home Goods', description: 'Furniture and items for home' },
      { name: 'Books', description: 'Printed and digital books' },
    ];
    const createdCategories = await Category.insertMany(categories);
    console.log(`${createdCategories.length} categories seeded.`);

    // Seed Products
    const products = [
      { name: 'Laptop Pro', sku: 'ELEC-LP-001', category: 'Electronics', price: 1200, cost: 900, stock: 50, minStock: 10, gstRate: 18 },
      { name: 'Smartphone X', sku: 'ELEC-SP-002', category: 'Electronics', price: 800, cost: 600, stock: 100, minStock: 20, gstRate: 18 },
      { name: 'Classic T-Shirt', sku: 'APP-TS-001', category: 'Apparel', price: 25, cost: 10, stock: 200, minStock: 50, gstRate: 5 },
      { name: 'Organic Milk', sku: 'GRO-MK-001', category: 'Groceries', price: 2.5, cost: 1.5, stock: 150, minStock: 30, unit: 'liter', gstRate: 0 },
      { name: 'Espresso Machine', sku: 'HOME-CM-001', category: 'Home Goods', price: 150, cost: 95, stock: 40, minStock: 10, gstRate: 12 },
      { name: 'Sci-Fi Novel', sku: 'BOOK-SF-001', category: 'Books', price: 15, cost: 8, stock: 120, minStock: 25, gstRate: 0 },
    ];
    const createdProducts = await Product.insertMany(products);
    console.log(`${createdProducts.length} products seeded.`);

    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
};

seedDatabase();