/**
 * MongoDB Connection Diagnostic Script
 * This script helps diagnose MongoDB connection issues
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';
import { promisify } from 'util';

dotenv.config({ path: '.env' });

const resolveSrv = promisify(dns.resolveSrv);

const diagnoseMongoDb = async () => {
  console.log('📋 MongoDB Connection Diagnostic Report\n');
  console.log('=' .repeat(60));

  // 1. Check if MongoDB URL is configured
  const mongoUrl = process.env.DATABASE_URL;
  if (!mongoUrl) {
    console.log('❌ ERROR: DATABASE_URL not set in .env file');
    process.exit(1);
  }
  console.log('✓ DATABASE_URL is configured');
  console.log(`  URL: ${mongoUrl.substring(0, 50)}...`);

  // 2. Parse the MongoDB connection string
  let parsedUrl;
  try {
    parsedUrl = new URL(mongoUrl);
  } catch (error) {
    console.log(`❌ ERROR: Invalid MongoDB connection string: ${error}`);
    process.exit(1);
  }
  console.log('✓ Connection string is valid');

  // 3. Extract hostname and check DNS resolution
  const hostname = parsedUrl.hostname;
  console.log(`\n🔍 Checking DNS resolution for: ${hostname}`);

  try {
    // For MongoDB+SRV, try to resolve the SRV record
    if (mongoUrl.includes('+srv')) {
      console.log(`  This is a MongoDB+SRV connection (Atlas Cluster)`);
      try {
        const srvRecords = await resolveSrv(`_mongodb._tcp.${hostname}`);
        console.log(`✓ SRV record resolved successfully`);
        console.log(`  Found ${srvRecords.length} replica set members:`);
        srvRecords.forEach((record, i) => {
          console.log(`    ${i + 1}. ${record.name}:${record.port}`);
        });
      } catch (srvError) {
        console.log(`⚠ SRV resolution warning: ${srvError}`);
        console.log(`  This might indicate DNS issues or network connectivity problems.`);
      }
    } else {
      // For regular MongoDB URLs, just do A record lookup
      console.log(`  This is a regular MongoDB connection (non-Atlas)`);
      const addresses = await promisify(dns.resolve4)(hostname);
      console.log(`✓ DNS A record resolved`);
      console.log(`  IP Addresses: ${addresses.join(', ')}`);
    }
  } catch (dnsError) {
    console.log(`❌ DNS Resolution Failed: ${dnsError}`);
    console.log(`\n🔧 Troubleshooting steps:`);
    console.log(`  1. Check your internet connection`);
    console.log(`  2. Verify the MongoDB connection string is correct`);
    console.log(`  3. For MongoDB Atlas:
     - Check if your IP is whitelisted in Network Access settings
     - Ensure the cluster is running
     - Try adding 0.0.0.0/0 temporarily to allow all IPs (for testing only)`);
    console.log(`  4. Check your firewall and proxy settings`);
  }

  // 4. Try to connect to MongoDB
  console.log(`\n🔗 Attempting to connect to MongoDB...`);
  try {
    await mongoose.connect(mongoUrl, { 
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    console.log(`✓ MongoDB connection successful!`);
    
    // Get cluster info
    const admin = mongoose.connection.db?.admin();
    if (admin) {
      try {
        const info = await admin.ping();
        console.log(`✓ MongoDB ping response: ${JSON.stringify(info)}`);
      } catch {
        console.log(`⚠ Could not ping MongoDB`);
      }
    }
    
    await mongoose.connection.close();
  } catch (mongoError: any) {
    console.log(`❌ MongoDB Connection Failed`);
    console.log(`  Error: ${mongoError.message}`);
    console.log(`\n🔧 Troubleshooting suggestions:`);
    
    if (mongoError.message.includes('ENOTFOUND')) {
      console.log(`  • The hostname could not be resolved. Check DNS settings.`);
      console.log(`  • For MongoDB Atlas, ensure your cluster name is correct.`);
    } else if (mongoError.message.includes('ECONNREFUSED')) {
      console.log(`  • Connection refused. The MongoDB server might not be running.`);
      console.log(`  • For MongoDB Atlas, check if the cluster is active.`);
    } else if (mongoError.message.includes('Authentication failed')) {
      console.log(`  • Authentication error. Check your username and password.`);
    } else if (mongoError.message.includes('Server selection timed out')) {
      console.log(`  • Could not connect within timeout period.`);
      console.log(`  • Check network connectivity and firewall rules.`);
      console.log(`  • For MongoDB Atlas, check IP whitelist settings.`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📌 Next Steps:');
  console.log('  1. If MongoDB Atlas: https://cloud.mongodb.com');
  console.log('     - Login to your MongoDB Atlas account');
  console.log('     - Go to Network Access');
  console.log('     - Add your current IP or use 0.0.0.0/0 (testing only)');
  console.log('  2. If using local MongoDB:');
  console.log('     - Install MongoDB Community Edition');
  console.log('     - Start MongoDB service');
  console.log('     - Update DATABASE_URL to: mongodb://localhost:27017/FirebaseDB');
  console.log('  3. Run: npm run dev:server');
  console.log('\n');
};

diagnoseMongoDb().catch((error) => {
  console.error('Diagnostic error:', error);
  process.exit(1);
});
