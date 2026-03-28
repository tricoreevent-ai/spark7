# SPARK AI User Manual

SPARK AI is a business operations platform for sports arenas, retail counters, memberships, facilities, and finance teams. This manual explains the day-to-day workflows used by operators, supervisors, and administrators.

## 1. What SPARK AI Covers

SPARK AI combines the following business areas:

- sales and billing
- quotations and customer follow-up
- products, categories, and stock
- suppliers and procurement
- returns and credit adjustments
- employees, attendance, shifts, and payroll
- facilities and event bookings
- membership plans and subscriptions
- accounting, settlements, and reports
- settings, users, and permissions

## 2. Accessing The Application

### Browser deployment

1. Open the SPARK AI URL provided by your administrator.
2. Enter your email and password.
3. If your company uses tenant-based login, enter the company slug when prompted.

### Windows desktop build

1. Install the Windows package provided by your administrator.
2. Open `SPARK AI` from the desktop or Start menu.
3. Wait until the login screen is available.

## 3. Login And Session Basics

The login screen typically supports:

- email
- password
- optional company or tenant slug
- show password
- remember session or keep signed in

If login fails:

1. Confirm the email address.
2. Confirm the password.
3. Confirm the company slug if your deployment uses one.
4. Ask an administrator to verify that the user account is active.

## 4. Roles And Menu Visibility

SPARK AI uses role-based access. Users only see the modules granted to their role.

Common role examples:

- admin
- manager
- sales
- accountant
- operations

Main menu groups:

- Home
- Sales
- Operations
- Admin

If a menu is missing, first check the user role and page permissions.

## 5. Home Dashboard

The Home dashboard is the main overview screen after login. It is used to monitor:

- sales activity
- stock or product shortcuts
- operational reminders
- booking activity
- membership activity
- accounting or reports shortcuts

Use this screen to move into the right module quickly rather than as a data-entry screen.

## 6. Sales Module

### POS and billing

Use the Sales screen to create invoices and collect payments.

Typical workflow:

1. Search and add products.
2. Select an existing customer or continue as walk-in.
3. Choose payment mode.
4. Save or post the invoice.
5. Print the invoice if needed.

### Orders and sales history

Use Orders to review previous invoices and posted sales.

Common actions:

- search by invoice number
- filter by customer
- review line items
- reopen or print invoices
- convert draft records where allowed

### Quotations

Use Quotations to prepare customer offers before billing.

Common actions:

- create a quote
- add products and quantities
- select pricing type
- set tax mode
- track quote status
- review version history
- approve and convert to draft invoice

### Customers

Use Customers to maintain reusable customer profiles.

Typical data stored:

- customer name
- phone and email
- billing contact
- price tier
- credit limit
- credit days
- account status

### Returns

Use Returns to process item reversals and sales corrections.

Common actions:

- search original invoice
- record returned items
- calculate refund or adjustment
- update stock reversal where applicable

## 7. Product And Inventory Module

### Product entry

Use Product Entry to create new items.

Common fields:

- product name
- category
- barcode or SKU
- unit
- product type
- sales price
- purchase price
- tax behavior
- opening stock
- reorder level

### Product catalog

Use Product Catalog to search and maintain the full product list.

Common actions:

- search products
- edit product details
- review stock-linked information
- move to stock alerts or product entry

### Categories

Use Categories to group products for search and reporting.

### Inventory and stock alerts

Use Inventory and Stock Alerts to monitor:

- current stock
- low-stock items
- out-of-stock items
- stock adjustments

Review these screens regularly to prevent overselling and stock mismatch.

### Procurement

Use Procurement for supplier-linked purchase workflows.

Common actions:

- maintain suppliers
- create purchase orders
- receive stock
- record purchase returns

## 8. Operations Module

### Employees

Use Employees to maintain the employee master.

Common actions:

- add employee
- edit employee details
- assign employment type
- activate or deactivate employees

### Attendance

Use Attendance to record daily presence and working hours.

Typical data:

- date
- attendance status
- check-in
- check-out
- overtime
- notes

### Shifts

Use Shifts to plan or assign daily work schedules.

### Payroll

Use Payroll to generate salary output based on employee and attendance records.

### Facilities and bookings

Use Facilities to maintain courts, halls, grounds, or other bookable spaces.

Use booking screens to:

- create reservations
- update booking status
- collect or verify payment
- reschedule or cancel

### Events

Use Event Booking for organizer-driven or scheduled events that need booking status and payment tracking.

## 9. Membership Module

SPARK AI supports memberships through plans, subscriptions, and reports.

### Membership plans

Use plan management to:

- create plans
- edit plan pricing
- activate or deactivate plans
- control validity and renewal settings

### Subscriptions

Use subscriptions to:

- enroll a member
- assign a plan
- start or renew a subscription
- review validity dates
- update member status

### Membership reports

Use reports to review:

- active subscriptions
- expiring subscriptions
- renewal opportunities
- membership summaries

## 10. Accounting And Settlement

Use Accounting for finance operations and ledger-related workflows.

Common areas include:

- opening balances
- expenses and income
- vouchers
- chart of accounts
- salary and contract entries
- cash and bank views

Use Settlement Center for:

- receipt vouchers
- credit notes
- settlement review
- day-end closure support

Finance access should be restricted to authorized users only.

## 11. Reports

Use Reports for operational and financial analysis.

Common report types include:

- daily sales summary
- item-wise sales
- customer-wise sales
- sales returns
- gross profit
- outstanding receivables
- attendance summaries
- cash vs credit sales
- user-wise sales

Most reports support filters, search, and export-friendly review.

## 12. Settings And Administration

### Settings

Use Settings to configure:

- business information
- branding
- invoice details
- print settings
- email settings
- backup and restore support

### User management

Use Users and role controls to:

- create users
- edit users
- activate or deactivate users
- assign roles
- manage page permissions

### Company creation

Some deployments allow company creation from the login area. If enabled, administrators can create a new tenant or company using the configured onboarding flow.

## 13. Keyboard Shortcuts

The shortcut panel can usually be opened with `?` and closed with `Esc`.

Typical sales shortcuts include:

- `Ctrl + S` or `F9` to save invoice
- `Alt + 1` cash
- `Alt + 2` card
- `Alt + 3` UPI
- `Alt + 4` bank
- `Alt + P` post invoice
- `Alt + D` save draft

Shortcut behavior is mainly intended for the Sales screen.

## 14. Backups, Printing, And Exports

Common output and recovery features:

- invoice print
- receipt print
- report exports
- payroll exports
- database backup
- database restore

Best practice:

1. Take regular backups.
2. Take a fresh backup before restore.
3. Test print formats after printer or paper changes.

## 15. Troubleshooting

### Data is missing

Check:

1. the correct tenant or company login
2. user permissions
3. date filters
4. search filters
5. that the backend is connected to the intended database

### Product or customer lists are blank

Check:

1. that the backend API is running
2. that the browser is calling the correct API base URL
3. that the logged-in user has the needed module access

### Email is not sending

Check:

1. SMTP settings
2. sender credentials
3. whether test email succeeds from Settings

### Desktop build is not opening correctly

Check:

1. that the installed build is current
2. that backend env settings are correct
3. local logs if your deployment captures them

## 16. First-Time Administrator Checklist

After a fresh deployment:

1. confirm database connectivity
2. log in as admin
3. complete business settings
4. configure email settings
5. create roles and users
6. add categories and products
7. verify inventory and pricing
8. configure customers, suppliers, and procurement if needed
9. configure employees, facilities, and membership plans if needed
10. test sales, quotations, reports, and permissions

## 17. Support Information To Share

When reporting an issue, provide:

- user email
- tenant or company slug
- screen name
- exact error message
- time of issue
- whether it happened in browser or desktop mode
