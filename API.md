# API Documentation

## Base URL
- Development: `http://localhost:3000/api`
- Production: `https://api.sarva.com/api`

## Authentication
Most endpoints require authentication via Bearer token in Authorization header:
```
Authorization: Bearer <token>
```

---

## Authentication Endpoints

### Register User
**POST** `/auth/register`

Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "9876543210",
  "businessName": "John's Store",
  "gstin": "27AABCC0001R1ZM"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "user"
  }
}
```

---

### Login
**POST** `/auth/login`

User login to get authentication token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "user",
    "businessName": "John's Store"
  }
}
```

---

### Get Current User
**GET** `/auth/me`

Requires authentication.

**Response:**
```json
{
  "success": true,
  "message": "User retrieved successfully",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "user",
    "businessName": "John's Store",
    "gstin": "27AABCC0001R1ZM"
  }
}
```

---

### Update Profile
**PUT** `/auth/profile`

Requires authentication.

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "9876543210",
  "businessName": "John's Updated Store",
  "gstin": "27AABCC0001R1ZM",
  "address": {
    "street": "123 Main St",
    "city": "Mumbai",
    "state": "Maharashtra",
    "zipCode": "400001",
    "country": "India"
  }
}
```

---

## Product Endpoints

### Get All Products
**GET** `/products`

Public endpoint to list products.

**Query Parameters:**
- `category` (optional): Filter by category
- `isActive` (optional): Filter by status (default: true)
- `skip` (optional): Pagination skip (default: 0)
- `limit` (optional): Pagination limit (default: 20)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Product Name",
      "sku": "SKU001",
      "description": "Product description",
      "category": "Electronics",
      "price": 999,
      "cost": 700,
      "gstRate": 18,
      "stock": 50,
      "minStock": 10,
      "unit": "piece",
      "isActive": true
    }
  ],
  "pagination": {
    "total": 100,
    "skip": 0,
    "limit": 20
  }
}
```

---

### Get Product by ID
**GET** `/products/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Product Name",
    "sku": "SKU001",
    "price": 999,
    "stock": 50
  }
}
```

---

### Create Product
**POST** `/products`

Requires authentication.

**Request Body:**
```json
{
  "name": "New Product",
  "sku": "SKU001",
  "description": "Product description",
  "category": "Electronics",
  "price": 999,
  "cost": 700,
  "gstRate": 18,
  "stock": 50,
  "minStock": 10,
  "unit": "piece"
}
```

---

### Update Product
**PUT** `/products/:id`

Requires authentication.

**Request Body:** (All fields optional)
```json
{
  "name": "Updated Product",
  "price": 1099,
  "stock": 45
}
```

---

### Delete Product
**DELETE** `/products/:id`

Requires authentication.

---

## Order Endpoints

### Create Order
**POST** `/orders`

Requires authentication.

**Request Body:**
```json
{
  "items": [
    {
      "productId": "507f1f77bcf86cd799439011",
      "quantity": 2
    }
  ],
  "paymentMethod": "upi",
  "notes": "Order notes"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "orderNumber": "ORD-20260119-123456",
    "userId": "507f1f77bcf86cd799439011",
    "items": [
      {
        "productId": "507f1f77bcf86cd799439011",
        "quantity": 2,
        "price": 1998,
        "gstAmount": 359.64
      }
    ],
    "totalAmount": 1998,
    "gstAmount": 359.64,
    "paymentMethod": "upi",
    "paymentStatus": "pending",
    "orderStatus": "pending"
  }
}
```

---

### Get User Orders
**GET** `/orders`

Requires authentication.

**Query Parameters:**
- `orderStatus` (optional): Filter by order status
- `paymentStatus` (optional): Filter by payment status
- `skip` (optional): Pagination skip
- `limit` (optional): Pagination limit

---

### Get Order Details
**GET** `/orders/:id`

Requires authentication.

---

### Update Order Status
**PUT** `/orders/:id/status`

Requires authentication.

**Request Body:**
```json
{
  "orderStatus": "completed",
  "paymentStatus": "completed"
}
```

---

## Inventory Endpoints

### Get All Inventory
**GET** `/inventory`

**Query Parameters:**
- `skip` (optional): Pagination skip
- `limit` (optional): Pagination limit

---

### Get Product Inventory
**GET** `/inventory/:productId`

---

### Initialize Inventory
**POST** `/inventory`

Requires authentication.

**Request Body:**
```json
{
  "productId": "507f1f77bcf86cd799439011",
  "quantity": 100,
  "warehouseLocation": "WH1-A1",
  "batchNumber": "BATCH001"
}
```

---

### Update Inventory Quantity
**PUT** `/inventory/:productId`

Requires authentication.

**Request Body:**
```json
{
  "quantity": 50,
  "action": "add",
  "warehouseLocation": "WH1-A1",
  "expiryDate": "2026-12-31",
  "batchNumber": "BATCH001"
}
```

**Action Values:**
- `set`: Set quantity to specified value
- `add`: Add to current quantity
- `subtract`: Subtract from current quantity

---

### Get Low Stock Items
**GET** `/inventory/status/low-stock`

Returns items below minimum stock level.

---

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message"
}
```

### HTTP Status Codes
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict
- `500`: Server Error

---

## Authentication Token Format

Tokens are JWT tokens valid for 7 days by default. Include in every authenticated request:

```
Authorization: Bearer <your-token-here>
```

---

## Rate Limiting

Currently no rate limiting is implemented. Production deployment should include:
- 100 requests per minute for authenticated users
- 20 requests per minute for public endpoints
