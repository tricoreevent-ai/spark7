# MongoDB and Multi-Tenant Issues - FIX SUMMARY

## Issues Fixed

### 1. **Multi-Tenant Product Loading Issue** ✅
**Problem:** Products were not loading or were showing products from other tenants due to missing tenant context in product queries.

**Root Causes:**
- Product queries didn't filter by `tenantId`
- Authentication middleware wasn't properly maintaining tenant context through async route handlers
- Product creation didn't set `tenantId`

**Solutions Implemented:**

#### A. Fixed Auth Middleware Tenant Context
**File:** `src/server/middleware/auth.ts`
- Updated to wrap `next()` inside `runWithTenantContext()`
- Uses AsyncLocalStorage to maintain tenant context through async operations
- Ensures all queries in the route handler have access to current tenant ID

#### B. Updated Products Route
**File:** `src/server/routes/products.ts`
- GET `/products` - Now filters by tenantId
- GET `/products/:id` - Now filters by tenantId
- POST `/products` - Now sets tenantId when creating
- PUT `/products/:id` - Now filters and updates only tenant's products
- DELETE `/products/:id` - Now deletes only tenant's products
- All queries check both `req.tenantId` and `getCurrentTenantId()` for robustness

#### C. Database Migration Script
**File:** `src/server/migrations/fixProductsTenantId.ts`
- Ensures all existing products have tenantId set
- Creates default tenant if it doesn't exist
- Updates all products without tenantId to use default tenant

**How to Run Migration:**
```bash
npx tsx src/server/migrations/fixProductsTenantId.ts
```

---

## 2. **MongoDB Connection Error** ⚠️

**Error Message:** `getaddrinfo ENOTFOUND ac-z275cud-shard-00-00.lzglvng.mongodb.net`

**What This Means:**
This error occurs when Node.js tries to connect to MongoDB Atlas but DNS resolution fails, or the network can't reach the MongoDB servers.

**Root Causes:**
1. IP address not whitelisted in MongoDB Atlas
2. Network/firewall blocking the connection
3. DNS resolution issues
4. MongoDB Atlas cluster might be paused or down

**Solution Options:**

### Option 1: Fix MongoDB Atlas Access (RECOMMENDED for production)
1. Login to MongoDB Atlas: https://cloud.mongodb.com
2. Go to your cluster's **Network Access** section
3. Click **Add IP Address**
4. Choose **Add Current IP Address** (automatic)
   OR use **0.0.0.0/0** for development (NOT for production)
5. Save the changes and wait for the security rules to apply (usually 1-5 seconds)

### Option 2: Use Local MongoDB (for development)
1. Download and install MongoDB Community Edition from: https://www.mongodb.com/try/download/community
2. Start MongoDB server:
   ```bash
   mongod
   ```
3. Update `.env` file:
   ```env
   DATABASE_URL=mongodb://localhost:27017/FirebaseDB
   ```
4. Restart the server:
   ```bash
   npm run dev:server
   ```

### Option 3: Diagnose the Issue
Run the diagnostic script to get detailed information:
```bash
npx tsx src/server/diagnostics/mongoDbDiagnostic.ts
```

This will:
- Verify the connection string format
- Check DNS resolution
- Attempt to connect
- Provide specific troubleshooting steps

---

## Implementation Details

### Tenant Context Flow
```
User Request
    ↓
authMiddleware
    ├─ Verify JWT token
    ├─ Get tenantId from token/user
    ├─ Set req.tenantId
    └─ Wrap next() in runWithTenantContext()
        ↓
    Route Handler (inside tenant context)
        ├─ Products queries auto-filtered by tenantId
        ├─ Product creation includes tenantId
        └─ All operations scoped to tenant
```

### Database Schema
Products now include:
```typescript
{
  _id: ObjectId,
  tenantId: String,  // NEW: Identify which tenant owns this product
  name: String,
  sku: String,
  category: String,
  price: Number,
  // ... other fields
}
```

### Indexes for Tenant Filtering
The tenant plugin automatically creates compound indexes:
```
{ tenantId: 1, sku: 1 }    // For uniqueness within tenant
{ tenantId: 1, category: 1 } // For category filtering
```

---

## Testing the Fixes

### 1. Test Product Creation
```bash
# Start server
npm run dev:server

# In another terminal, login first
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Use the returned token in next request
TOKEN="your-token-here"

# Create a product (will be scoped to your tenant)
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Product",
    "sku": "TP001",
    "category": "Electronics",
    "price": 1000,
    "cost": 600,
    "gstRate": 18
  }'
```

### 2. Test Product Listing
```bash
# Get products (will only show your tenant's products)
curl -X GET "http://localhost:3000/api/products" \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Run Migration
```bash
npx tsx src/server/migrations/fixProductsTenantId.ts
```

---

## Next Steps

1. **Immediate:**
   - [ ] Resolve MongoDB connection (choose Option 1 or 2 above)
   - [ ] Run the migration script
   - [ ] Test product loading
   
2. **Verify:**
   - [ ] Login to the application
   - [ ] Create a new product
   - [ ] Verify the product appears in the list
   - [ ] Logout and login as different user (verify isolation)

3. **Production:**
   - [ ] Add proper IP whitelist in MongoDB Atlas
   - [ ] Do NOT use 0.0.0.0/0 in production
   - [ ] Implement backup and monitoring

---

## Files Modified

1. `src/server/middleware/auth.ts` - Fixed tenant context preservation
2. `src/server/routes/products.ts` - Added tenant filtering to all endpoints
3. `src/server/migrations/fixProductsTenantId.ts` - NEW migration script
4. `src/server/diagnostics/mongoDbDiagnostic.ts` - NEW diagnostic tool

---

## Troubleshooting

### Still getting "ENOTFOUND" error?
1. Run the diagnostic: `npx tsx src/server/diagnostics/mongoDbDiagnostic.ts`
2. Check MongoDB Atlas Network Access settings
3. Try using local MongoDB temporarily to verify product functionality
4. Check firewall/proxy settings on your machine

### Products still not showing?
1. Verify token is valid: Check console logs
2. Check server logs for tenant context errors
3. Run migration script to ensure products have tenantId
4. Try creating a new product and verify it shows in the list

### Duplicate SKU errors?
This is expected when you have multiple tenants - each tenant can have their own product with the SKU. The uniqueness check now includes tenantId.

---

## Additional Resources

- [MongoDB Atlas Documentation](https://docs.mongodb.com/manual/)
- [Multi-Tenant SaaS Patterns](https://www.mongodb.com/library/guide/multi-tenant-saas-architecture/)
- [AsyncLocalStorage Guide](https://nodejs.org/api/async_context.html)
