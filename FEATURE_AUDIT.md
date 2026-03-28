# Feature Audit

Audit date: 2026-03-28

This document summarizes the features currently present in the codebase and highlights the most important missing or partially implemented areas.

## Project Snapshot

SARVA / SPARK AI is a multi-tenant business operations platform with:

- React + Vite + TypeScript client
- Express + TypeScript + MongoDB server
- Electron desktop packaging
- Role-based access control per page

## Existing Features

### 1. Platform, Auth, and Administration

- Multi-tenant login using email, password, and optional tenant slug
- Company creation flow controlled by backend configuration
- JWT auth with profile, preferences, and logout audit endpoints
- Role and page-based permissions for admin, accountant, manager, sales, receptionist, and custom roles
- User management UI for create, edit, deactivate/delete, and role assignment
- General settings for business profile, logos, SMTP/test email, print preferences, theme, and font scale
- Database backup, restore, and restore history UI for super admin
- Combined web deployment, separate frontend/backend deployment, and Electron desktop build

### 2. Sales and Customer Operations

- Full POS billing screen with product search, barcode/SKU entry, GST and non-GST billing, cash and credit invoice modes, draft/posted invoice modes, manual or auto invoice numbering, discounts, printing, customer lookup, and membership benefit application
- Sales history screen with pagination, search, invoice edit, reprint, and return entry
- Customer module with search, unified lookup, update, block/unblock, outstanding summary, aging report, ledger, and invoice history
- Return management with approval, rejection, refund method tracking, stats summary, detail view, and CSV export

### 3. Catalog and Inventory

- Product catalog CRUD
- Product fields for SKU, barcode, category, subcategory, GST, image, stock, min stock, batch tracking, expiry required, and negative stock option
- Product list with search, sort, filter, low-stock visibility, and configurable columns
- Category create/list support
- Inventory dashboard with total stock, low stock, and out-of-stock counts
- Stock adjustment flow with reason, warehouse/store/rack/shelf, batch, and expiry data
- Backend support for bulk update, CSV export, product import, inventory transfer, and transfer history

### 4. Accounting and Finance

- Accounting workspace for salary payments, contract payments, day book entries, opening balances with lock, chart of accounts, account ledger view, receipt/payment/journal vouchers, cash book, bank book, bank reconciliation, fund transfer, and financial reports
- Backend support for credit notes and settlements/day-end flows

### 5. HR and Payroll

- Employee master CRUD
- Employee salary summary by month
- Attendance register with mark, register view, and unlock flow
- Shift assignment and employee-wise shift lookup
- Payroll generation by month and CSV export

### 6. Facilities and Events

- Facility setup with image upload, pricing, capacity, location, active status, and edit flow
- Daily facility booking board with availability grid
- Facility booking creation with customer lookup, time slot selection, amount calculation, booked units/courts, notes, payment status, and booking status
- Facility booking actions for complete, paid, cancel, reschedule, receipt, and reminders
- Event booking module for corporate/organizer bookings across multiple facilities
- Event calendar, payment milestone collection, cancellation, reschedule, and printable receipt

### 7. Memberships

- Membership plan creation and update
- Subscription/member creation and profile update
- Lifecycle actions: upgrade, downgrade, extend, cancel, suspend, pause, resume
- Renewal flow with reminder processing and lifecycle sync
- Reward points and discount configuration on plans and subscriptions
- POS membership benefits preview/apply
- Expiry alerts, dashboard reminders, renewal revenue, and renewal counts
- Membership reports for lifecycle, renewal trends, reminder channels, and benefit analytics

### 8. Reporting

- Reports UI currently exposes daily sales summary, item-wise sales, customer-wise sales, sales returns, gross profit, outstanding receivables, attendance summary, cash vs credit sales, and user-wise sales
- Backend also includes tax summary, inventory reporting, and audit-log reporting endpoints

## Missing or Partial Features

These are the highest-confidence gaps found during the audit.

### P1: Backend Features Without Matching UI

- Supplier management is implemented on the server but has no client page
- Purchase order creation, receiving, returns, supplier performance, and purchase history exist on the server but are not exposed in the main UI
- Credit note creation, adjustment, refund, and balance APIs exist but have no dedicated client workflow
- Settlements/day-end APIs exist for receipts, collections, day-end close, and day-end report, but there is no matching page in the client
- Several reports are backend-only today: tax summary, inventory stock summary, inventory low stock, inventory valuation, inventory movement, dead stock, fast moving items, and audit logs
- Membership backend supports points history, reminder history, POS member lookup, and session consumption, but those workflows are not surfaced in the client

### P1: Broken or Incomplete User Flows

- Sales Dashboard links to `/sales/analytics`, but the router only exposes `/reports`; the analytics shortcut is broken
- Category UI expects delete support, but the backend category route currently only implements list and create
- Category client code and category hook still use hardcoded `http://localhost:3000` URLs instead of shared API config, which will break separate deployment and desktop/runtime portability

### P2: Partial UX / Operational Gaps

- Some membership actions still rely on `prompt()` dialogs instead of structured forms or modals
- Event cancellation and rescheduling also rely on `window.prompt()` inputs
- Advanced accounting features are available, but the project does not yet have dedicated supplier, credit-control, or day-end screens that match the backend depth

### P2: Reporting Coverage Gap

- Reports UI covers only part of the reporting surface even though richer server endpoints already exist
- Customer outstanding/aging data exists but is not clearly presented as a dedicated collections workflow

### P3: Engineering / Delivery Gaps

- `npm test` is still a placeholder, so there is effectively no automated test coverage protecting sales, membership, inventory, or accounting flows
- The repo contains overlapping legacy/new page files in some areas, which increases maintenance risk and makes feature ownership less obvious

## Recommended Next Priorities

1. Build a procurement module: Suppliers + Purchase Orders + Goods Receive + Purchase Returns.
2. Build a finance collections module: Credit Notes + Receipts + Day-End Closing + Settlement Reports.
3. Expand Reports UI to include tax, inventory, and audit reports already available on the server.
4. Fix category inconsistencies and the broken Sales Dashboard analytics route.
5. Replace prompt-based membership/event actions with proper dialogs and forms.
6. Add smoke tests for login, sales posting, returns, memberships, and inventory adjustment.

## Short Status Summary

- Strongly implemented: sales, memberships, facilities/events, HR/payroll, settings, RBAC, product/inventory basics
- Partially implemented: categories, reports coverage, advanced accounting exposure
- Missing from UI but present in backend: procurement, credit-note workflows, settlements/day-end, advanced inventory/tax/audit reports, some membership history/session workflows
