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

## Reporting Endpoints

All reporting endpoints require authentication.

### Sales Reports

**GET** `/api/reports/daily-sales-summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Returns day-wise invoice count, sales amount, tax amount, and outstanding amount.

**GET** `/api/reports/item-wise-sales?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Returns product/item quantity, taxable value, tax, and total sales.

**GET** `/api/reports/customer-wise-sales?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Returns customer-level invoice count, total sales, and outstanding balance.

**GET** `/api/reports/sales-returns?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Returns approved sales return rows and refund/return summary totals.

**GET** `/api/reports/gross-profit?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Returns revenue, cost of goods, gross profit, and margin percentage.

**GET** `/api/reports/outstanding-receivables?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Returns open credit invoices and total outstanding value.

**GET** `/api/reports/cash-vs-credit?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Returns cash and credit invoice counts and totals.

**GET** `/api/reports/user-wise-sales?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Returns staff/user-wise invoice count and payment-mode totals.

**GET** `/api/reports/tax-summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Returns GST taxable value and tax grouped by rate for sales and approved returns.

### Accounting Reports

**GET** `/api/accounting/reports/income?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Returns posted sales income and manual income rows with category totals.

**GET** `/api/accounting/reports/expense?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Returns manual expenses, salary payments, contract payments, and approved return refunds.

**GET** `/api/accounting/reports/trial-balance?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Returns opening balance, debit, credit, closing balance, and debit/credit balance per account.

**GET** `/api/accounting/reports/profit-loss?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Returns income, expense, and net profit/loss totals.

**GET** `/api/accounting/reports/balance-sheet?asOnDate=YYYY-MM-DD`
Returns asset, liability, retained earnings, and balancing totals as on the selected date.

**GET** `/api/accounting/tds/bootstrap`
Returns TDS company settings, sections, deductees, deductions, challans, returns, certificates, reconciliation runs, warnings, and summary totals used by the TDS report.

**GET** `/api/accounting/tds/reports?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&financialYear=2025-26&quarter=Q1`
Returns the synchronized TDS report suite for Accounting Console reports. Response sections include statutory quarterly returns `24Q`, `26Q`, `27Q`, `27EQ`; certificates `Form16`, `Form16A`, `Form27D`; computation, payable, outstanding, reconciliation, mismatch, challan status, payment register, correction return, audit trail, and tax audit Clause `34(a)` rows.

**POST** `/api/accounting/tds/calculate`
Previews a TDS deduction. The request can include normal section/deductee fields plus optional transaction-level overrides:

```json
{
  "sectionCode": "194I",
  "deducteeName": "Arena Landlord",
  "pan": "ABCDE1234F",
  "grossAmount": 75000,
  "rateOverride": 10,
  "thresholdMonthlyOverride": 50000,
  "tdsUseCaseKey": "sports_facility_building_rent",
  "tdsUseCaseLabel": "Sports facility rent - land/building"
}
```

**POST** `/api/accounting/tds/transactions`
Records the previewed TDS transaction and can optionally post the accounting journal. Use the same override fields as calculation when recording sports-complex cases such as facility rent, commercial room rent, contract labour, professional service, or event prize money.

### Payroll Compliance

**GET** `/api/payroll/generate?month=YYYY-MM`
Returns monthly payroll rows with attendance totals, overtime, arrears, gross pay, PF, ESI, professional tax, TDS, employer contribution, deductions, and net pay.

**GET** `/api/payroll/export/csv?month=YYYY-MM`
Exports the monthly payroll register with statutory deduction and arrears columns.

**GET** `/api/payroll/challans`
Returns generated payroll statutory challans for PF, ESI, PT, and salary TDS.

**POST** `/api/payroll/challans/generate`
Generates a payroll challan worksheet for one month and challan type.

```json
{
  "month": "2026-04",
  "challanType": "pf",
  "penaltyAmount": 0,
  "interestAmount": 0
}
```

**GET** `/api/payroll/challans/:id/download`
Downloads the generated challan worksheet.

**GET** `/api/payroll/arrears`
Returns salary arrears records, optionally filtered by employee or payout month.

**POST** `/api/payroll/arrears`
Calculates retroactive salary revision arrears and optionally updates the employee's current monthly salary.

**GET** `/api/payroll/form16?financialYear=YYYY-YY`
Returns generated draft Form 16 worksheets for a financial year.

**POST** `/api/payroll/form16/generate`
Generates draft Form 16 worksheets for all employees or a selected employee, using company PAN/TAN/legal-name settings and payroll TDS totals.

**GET** `/api/payroll/form16/:id/download`
Downloads the generated draft Form 16 worksheet.

**GET** `/api/payroll/settlements`
Returns full-and-final settlement records.

**POST** `/api/payroll/settlements`
Calculates full-and-final settlement including notice pay, leave encashment, gratuity, other earnings, recoveries, TDS, and net settlement.

**GET** `/api/payroll/settlements/:id/download`
Downloads the full-and-final settlement worksheet.

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
