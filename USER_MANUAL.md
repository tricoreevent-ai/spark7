# Sarva Sports Complex Management Platform

User Manual and Product Documentation

Last updated: April 17, 2026

## Latest Highlights

- Customer CRM now separates profiles, enquiries, campaigns, and reports for cleaner follow-up.
- Event quotations now support revision history, PDF preview, print output, email sending, and booking conversion.
- Membership workflows cover plan setup, subscription issue, active-member tracking, renewals, and reporting.
- Accounting reports now include one-click help cards explaining the formula, source data, and report logic used on the dashboard and each report tab.
- A separate Validation Dashboard is available for accounting health checks, drill-down review, exports, scheduled checks, and alerts.
- A safe accounting transaction reset batch file is available for test cycles while preserving master/setup data.
- The public Sarva website now includes Home, Products, About, Contact, Login, and the public User Manual.

## Quick Index

- [1. Introduction](#1-introduction)
- [2. Objective of the Application](#2-objective-of-the-application)
- [3. Application Structure](#3-application-structure)
- [4. User Navigation Flow](#4-user-navigation-flow)
- [5. Main Menu Modules](#5-main-menu-modules)
- [6. Catalog Menu](#6-catalog-menu)
- [7. People Menu](#7-people-menu)
- [8. Sales Menu](#8-sales-menu)
- [9. Operations Menu](#9-operations-menu)
- [10. Accounts Menu](#10-accounts-menu)
- [11. Admin Menu](#11-admin-menu)
- [12. Transaction Screen Guides](#12-transaction-screen-guides)
- [13. Report Logic In Simple Terms](#13-report-logic-in-simple-terms)
- [14. Sample Data Entry Examples](#14-sample-data-entry-examples)
- [15. How Data Moves From Entry Screen To Report](#15-how-data-moves-from-entry-screen-to-report)
- [16. Final Summary](#16-final-summary)

## 1. Introduction

Sarva is an integrated business and operations management platform designed to handle all activities of a sports complex in a structured and efficient way.

The application connects multiple business functions such as sales, inventory, employee management, facility booking, memberships, and accounting into a single platform. It reduces manual work by providing one centralized solution instead of separate disconnected systems.

The system is designed for front desk staff, operations teams, sales teams, HR managers, accountants, and administrators.

## 2. Objective of the Application

The main objective of the application is to streamline daily operations and improve efficiency across all departments.

The system helps teams:

- Manage customer bookings and sales transactions
- Maintain product and inventory records
- Handle employee data, attendance, shifts, and payroll
- Organize facility usage, events, memberships, and subscriptions
- Track financial transactions, settlements, and reports
- Control system access, settings, and configuration

## 3. Application Structure

The application is divided into the following main modules:

- [Home](/)
- [Sales](/sales-dashboard)
- [Catalog](/products)
- [People](/employees)
- [Operations](/facilities)
- [Accounts](/accounting)
- [Validation](/accounting/validation)
- [Admin](/settings)

Each module contains specific pages designed to perform related tasks.

## 4. User Navigation Flow

A typical usage flow in the system is:

1. Admin sets up company details, users, permissions, and settings
2. Catalog team adds products and categories
3. Operations team sets up facilities, plans, and subscriptions
4. Sales team handles customer profiles, enquiries, campaigns, quotations, bookings, and transactions
5. People module manages employees, attendance, shifts, and payroll
6. Accounts team tracks payments, reconciliation, and settlements
7. Validation checks confirm accounting data health before management review
8. Management reviews reports and performance

## 5. Main Menu Modules

### 5.1 Home

Direct link: [Open Home Dashboard](/)

Purpose  
The Home page serves as the central dashboard of the application.

Description  
Users can view summaries such as bookings, sales activity, alerts, reminders, and notifications without navigating into each module separately. It helps users understand the current business status quickly and provides shortcuts to the main work areas.

Key Uses

- Monitor daily activity
- View recent transactions
- Identify pending actions
- Access quick navigation

### 5.2 Sales

Direct links: [Sales Dashboard](/sales-dashboard), [Sales Orders](/orders), [Quotations](/sales/quotes), [Reports](/reports), [Customer Profiles](/customers/profiles), [CRM Enquiries](/customers/enquiries), [CRM Campaigns](/customers/campaigns), [CRM Reports](/customers/reports)

Purpose  
The Sales module manages all customer-related transactions and revenue activities in a structured way.

Description  
It handles the full sales cycle from dashboard monitoring and quotations to confirmed orders, returns, CRM follow-up, campaigns, and detailed sales reporting. It ensures that commercial transactions are recorded properly and remain traceable for follow-up and review.

Key Uses

- Open the sales dashboard and POS shortcuts
- Manage customer orders
- Provide quotations
- Track sales
- Handle returns
- Run CRM follow-up and campaigns
- View sales reports

### 5.3 Catalog

Direct links: [Product Center](/products), [Product Entry](/products/entry), [Product Catalog](/products/catalog)

Purpose  
The Catalog module manages product and inventory information used across the system.

Description  
It stores product details, organizes them into categories, tracks stock levels, and supports procurement and replenishment activities. This module supports both sales and stock control.

Key Uses

- Maintain product data
- Monitor stock
- Organize inventory
- Support sales

### 5.4 People

Direct links: [Employees](/employees), [Employee Check In](/attendance/self), [Attendance Reports](/attendance/reports), [Attendance Register](/attendance), [Payroll](/payroll)

Purpose  
The People module manages employee data and workforce operations.

Description  
It centralizes employee information, self attendance, manual attendance review, shift management, and payroll handling so staff operations can be managed accurately.

Key Uses

- Store employee data
- Track employee self check-in and check-out
- Track attendance corrections and review
- Manage shifts
- Process payroll

### 5.5 Operations

Direct links: [Facility Booking](/facilities), [Event Booking](/events), [Memberships](/memberships)

Purpose  
The Operations module manages service-related activities of the sports complex.

Description  
It includes facility setup, bookings, event management, membership plans, subscriptions, and membership reports. It focuses on customer usage of arena services.

Key Uses

- Manage bookings
- Organize events
- Handle memberships
- Create plans

### 5.6 Accounts

Direct links: [Accounting](/accounting), [Settlements](/accounting/settlements), [Validation Dashboard](/accounting/validation)

Purpose  
The Accounts module manages financial transactions and records.

Description  
It provides a complete accounting workspace with section-wise navigation, operational posting, reconciliation, voucher printing, and financial reporting so the business can maintain clean and auditable financial records.

Key Uses

- Track finances
- Run section-wise accounting operations from one workspace
- Create invoices, payments, vouchers, assets, periods, and ledgers
- Perform settlements and reconciliation
- Generate exports and financial statements

### 5.7 Validation

Direct link: [Validation Dashboard](/accounting/validation)

Purpose  
The Validation module verifies accounting data quality.

Description  
It runs read-only validation checks, shows critical and warning findings, supports drill-down review, and helps accountants confirm whether Trial Balance, Balance Sheet, TDS, and other accounting reports are reliable.

Key Uses

- Run accounting health checks
- Review failed checks with causes and suggested fixes
- Export validation results
- Schedule nightly checks and alerts

### 5.8 Admin

Direct links: [Settings](/settings), [Users](/user-management), [Company Create](/admin/company-create), [Admin Reports](/admin/reports)

Purpose  
The Admin module controls system configuration and access.

Description  
It allows administrators to manage users, permissions, company information, print settings, mail settings, admin reporting, and other shared system behavior.

Key Uses

- Manage users
- Control access
- Configure system
- Review admin activity and audit reports

## 6. Catalog Menu

### 6.1 Product Entry

Direct links: [Product Entry](/products/entry), [Product Catalog](/products/catalog), [Categories](/categories)

Purpose  
Used to create and manage product details.

Description  
This page allows adding new products and updating existing ones for accurate use in billing, stock control, alerts, and reporting. It is the primary product master entry screen.

Key Uses

- Add products
- Update pricing
- Maintain data

### 6.2 Product Catalog

Direct links: [Product Catalog](/products/catalog), [Stock Alerts](/products/alerts)

Purpose  
Displays all products in the system.

Description  
This page provides a complete view of products with search, filters, and pagination. It is useful for reviewing existing items, checking availability, and confirming product setup.

Key Uses

- View products
- Search items
- Check availability

### 6.3 Stock Alerts

Direct links: [Stock Alerts](/products/alerts), [Procurement](/inventory/procurement)

Purpose  
Monitors inventory levels.

Description  
This page notifies users when stock is low or when action is required. It helps the business plan timely restocking and avoid stock shortages.

Key Uses

- Identify low stock
- Plan restocking

### 6.4 Procurement

Direct links: [Procurement](/inventory/procurement), [Product Catalog](/products/catalog)

Purpose  
Handles purchasing and restocking.

Description  
This page manages supplier purchase activity and inventory replenishment so items can be restocked in an organized way.

Key Uses

- Purchase products
- Track procurement

### 6.5 Categories

Direct links: [Categories](/categories), [Product Entry](/products/entry)

Purpose  
Organizes products into groups.

Description  
This page helps structure product data for easier search, filtering, reporting, and product maintenance.

Key Uses

- Create groups
- Improve search

## 7. People Menu

### 7.1 Employees

Direct link: [Employees](/employees)

Purpose  
Stores employee details.

Description  
This page maintains staff records in one place and acts as the base data source for attendance, payroll, and workforce administration.

### 7.2 Employee Check In

Direct link: [Employee Check In](/attendance/self)

Purpose  
Allows an employee to mark attendance personally from the sports complex.

Description  
This page is meant for self attendance. The employee opens the page on a mobile device, allows GPS, and taps `Check In Now` when arriving. The system records the current time automatically. When leaving, the employee taps `Check Out Now`, and the system again records the current time automatically. If the administrator has enabled location restriction, the employee must be inside the allowed sports complex radius or the attendance action will not be accepted.

Example  
Rakesh arrives at the arena on `2026-04-08` at `09:02`. He opens `Employee Check In`, allows location access, and taps `Check In Now`. The system saves `09:02` as check-in. At `18:11`, he opens the same page inside the arena and taps `Check Out Now`. The system saves `18:11` as check-out and locks the day as completed.

How it affects reports  
The saved check-in and check-out become the day’s attendance record for that employee. The hours then support attendance summary and payroll review for the month.

### 7.3 Attendance Register

Direct link: [Attendance Register](/attendance)

Purpose  
Tracks employee presence through supervisor or admin manual entry.

Description  
This page is the manual attendance register. It is used for corrections, back-dated entries, and supervisor-controlled attendance updates. Employees should normally use `Employee Check In`, while this register remains for authorized staff who need to review or adjust entries.

Example  
On `2026-04-08`, supervisor Meera sees that one employee forgot to check out. She opens `Attendance Register`, selects the date, updates the employee entry to `Present`, `Check In 09:00`, `Check Out 18:10`, and saves the corrected record.

How it affects reports  
The saved manual entry becomes the attendance record used by attendance summary and payroll calculations.

### 7.4 Attendance Reports

Direct link: [Attendance Reports](/attendance/reports)

Purpose  
Reviews attendance in report format.

Description  
This page gives two attendance report styles in one place. The `Employee-wise Detail` report shows date-wise check-in, check-out, total worked time, overtime, and map links for the attendance entry location. The `Monthly Attendance Sheet` shows one full month in one grid with date columns and tick marks for presence so the sheet can be printed or exported easily.

Example  
For `2026-04-01` to `2026-04-30`, HR opens `Attendance Reports`, keeps the employee filter as `All employees`, and loads the detail report to review every saved check-in and check-out row. Then HR switches to `Monthly Attendance Sheet`, selects `2026-04`, and prints the full month sheet with tick marks for each day of presence.

How it affects reports  
This page does not create new attendance data. It reads the attendance already saved from `Employee Check In` and `Attendance Register` and presents it in either a detailed row format or a monthly printable sheet format.

### 7.5 Shifts

Direct link: [Shifts](/shifts)

Purpose  
Manages employee schedules.

Description  
This page assigns working hours and shift patterns to ensure proper staffing coverage across the arena.

### 7.6 Payroll

Direct link: [Payroll](/payroll)

Purpose  
Calculates monthly payroll and statutory payroll compliance outputs.

Description  
This page processes employee payments based on attendance and shifts, calculates PF/ESI/PT/TDS deductions, and helps the organization review payroll output in a structured way. It also provides payroll compliance panels for PF, ESI, PT, and salary TDS challan worksheets, salary arrears, draft Form 16 worksheets, and full-and-final settlement calculations.

## 8. Sales Menu

### 8.1 Sales Dashboard

Direct link: [Sales Dashboard](/sales-dashboard)

Purpose  
Provides a quick action and monitoring workspace for the sales team.

Description  
This page combines fast links to POS billing, sales history, returns, analytics, seven-day sales trend visibility, and stock alert cards. It helps front desk or sales users move quickly between the most common sales tasks without opening each page separately.

Key Uses

- Open POS and billing actions quickly
- Review seven-day sales trend
- Check stock alerts before selling
- Jump to orders, returns, and reports

### 8.2 Sales Orders

Direct link: [Sales Orders](/orders)

Purpose  
Records confirmed sales.

Description  
This page tracks completed transactions and provides a structured history of finalized customer sales.

### 8.3 Quotations

Direct link: [Quotations](/sales/quotes)

Purpose  
Provides price estimates.

Description  
This page helps customers review pricing before purchase confirmation and supports the pre-sales process.

### 8.4 Returns

Direct link: [Returns](/returns)

Purpose  
Handles returned items.

Description  
This page maintains accurate sales and stock records by capturing return activity and related adjustments.

### 8.5 Reports

Direct link: [Reports](/reports)

Purpose  
Provides sales and POS insights.

Description  
This page is the tabbed `Sales & POS Reports` workspace. It helps management and front desk users analyze business performance through filters, exports, and multiple report tabs covering store-level finance views, sales analysis, GST datasets, receivables, inventory movement, user performance, and tax review.

### 8.5.1 Sales Reports Tabs

Inside `Sales -> Reports`, use the `Reports Menu` tabs for the exact report needed:

- `Profit & Loss (Store-level)`: store-level income versus expense view for the selected period
- `Balance Sheet (Store-level)`: store-level position view for assets, liabilities, and balance
- `Sales Summary (Daily / Shift)`: daily and shift-wise sales closure comparison
- `Daily Sales Summary`: day-by-day invoice count, sales amount, tax, and outstanding
- `Item-wise Sales Report`: quantity, value, and tax grouped item by item
- `Customer-wise Sales Report`: invoice count, total billed value, and pending amount grouped by customer
- `Sales Return Report`: approved return value, tax reversal, and refund impact
- `Gross Profit Report`: revenue, item cost, gross profit, and margin
- `HSN-wise Sales Report`: sales grouped by HSN or SAC classification
- `Taxable / Exempt / Nil / Non-GST`: billing value grouped by GST treatment bucket
- `B2B vs B2C Invoice Report`: registered-party versus consumer invoice split
- `Credit / Debit Note Register (GST)`: GST note activity for corrected or adjusted invoices
- `Sales Register (Detailed)`: detailed invoice-level sales register for review and export
- `Payment Reconciliation Report`: invoice-side and payment-side comparison for settlement review
- `Z-Report (End of Day)`: day-close summary for counter and billing closure
- `Inventory Movement (POS only)`: stock movement created only by POS selling activity
- `Membership Sales Report`: membership or plan-related sales captured through sales billing
- `GST Handoff Datasets`: GST-facing export and verification datasets from sales transactions
- `Outstanding Receivables Report`: open credit invoices still awaiting collection
- `Attendance Report`: attendance-related operational snapshot inside the sales reporting workspace
- `Cash vs Credit Sales Report`: invoice split by cash billing and credit billing
- `User-wise Sales Report`: sales grouped by staff user with payment-mode mix
- `Tax Summary Report`: GST taxable value and tax amount grouped by rate with return reversal effect

Export tools  
The active report tab can be exported to Excel or PDF after applying the selected date range.

### 8.6 Customer CRM Desk

Direct links: [Customer Profiles](/customers/profiles), [Customer Enquiries](/customers/enquiries), [CRM Campaigns](/customers/campaigns), [CRM Reports](/customers/reports)

Purpose  
Runs the customer CRM workspace.

Description  
This workspace combines customer profiles, enquiry follow-up, campaigns, visit and payment history, repeat-customer review, and collection watchlists in one place. The CRM desk is split into separate route-based tabs so staff can open the exact CRM function they need from the Sales menu.

### 8.6.1 CRM Desk Tabs

- `Customer Profiles`: create and maintain customer master records, contact details, preferences, notes, and contact roles
- `CRM Enquiries`: capture walk-in, phone, and website leads, assign follow-up, and convert enquiries into quotation or booking activity
- `CRM Campaigns`: create brochure campaigns, save drafts, send outreach, and keep campaign history inside the CRM
- `CRM Reports`: review conversion rate, repeat-customer trends, preferred facilities or time slots, and collection watchlist signals

Example  
Create a profile for `Rahul Menon`, save his phone, email, preferred badminton slot `06:00 PM to 08:00 PM`, and note that he usually buys shuttle tubes from the sports shop. Later, when he asks about a weekend court block by phone, create an enquiry, assign it to front desk staff, and then open the booking or quotation screen directly from that enquiry.

How it affects reports  
The CRM workspace itself does not create sales or booking figures. It collects customer, lead, and campaign information that later connects to bookings, quotations, invoices, payment follow-up, and CRM summary cards.

## 9. Operations Menu

### 9.1 Facility Setup

Direct link: [Facility Setup](/facilities/setup)

Purpose  
Defines sports facilities.

Description  
This page configures courts, slots, pools, halls, rates, and related rules before facilities are made available for booking.

### 9.2 Facility Booking

Direct link: [Facility Booking](/facilities)

Purpose  
Manages bookings.

Description  
This page allows the reservation of facilities for customers and supports slot-based usage control.

### 9.3 Event Booking

Direct link: [Event Booking](/events)

Purpose  
Handles events.

Description  
This page manages registrations, organizer details, event quotations, schedules, facilities, payments, and printable event confirmations. The linked quotation workflow now supports revision history, PDF preview, print output, email sending, and booking conversion without retyping the event details.

### 9.4 Create Plan

Direct link: [Create Plan](/membership-plans/create)

Purpose  
Defines service plans.

Description  
This page creates pricing and usage packages for membership or subscription-based services.

### 9.5 Create Subscription

Direct link: [Create Subscription](/membership-subscriptions/create)

Purpose  
Manages recurring services.

Description  
This page handles subscription-based access by linking a member to a plan and active service period.

### 9.6 Memberships

Direct link: [Memberships](/memberships)

Purpose  
Manages members.

Description  
This page tracks membership details, status, and active member records in one operational view.

### 9.7 Membership Reports

Direct link: [Membership Reports](/membership-reports)

Purpose  
Analyzes membership data.

Description  
This page provides insight into usage, renewals, and growth so management can evaluate membership performance.

## 10. Accounts Menu

### 10.1 Accounting

Direct link: [Accounting](/accounting)

Purpose  
Maintains financial records.

Description  
This page is the central accounting workspace. It supports day-to-day posting, control, review, reconciliation, and export workflows from one screen.

### 10.1.1 Navigation and Layout

Navigation path: `Top menu -> Accounts -> Accounting`  
Inside the accounting page, use the **left sidebar menu** to move between sections without leaving the page.

### 10.1.2 Accounting Console Sections (Left Sidebar)

- `MIS Dashboard`: revenue, expense, profit, and GST summary with recent invoices, payments, and journal entries
- `Invoices & Payments`: create accounting invoices, record vendor expenses/bills, add invoice payments, and cancel invoices
- `Vendors / Assets / Periods`: vendor master, fixed asset creation, depreciation posting, and financial period lock/unlock
- `Salary & Contract`: salary payments, contract payments, and day-book entries
- `Opening Balances`: opening cash/bank/stock and customer/supplier opening setup with lock control
- `Expenses & Income`: manual expense/income day-book posting with edit/cancel actions
- `Vouchers`: receipt voucher, payment voucher, journal voucher, transfer voucher, and voucher print actions
- `Cash & Bank Book`: cash/bank movements, pending bank reconciliation rows, and CSV statement matching
- `Treasury & Banks`: bank account master, bank transfers, cheque tracking, deposit slips, and treasury movement review
- `Chart & Ledger`: chart account creation and account-level ledger drill-down
- `GST & Filing`: GST period status, return working data, reconciliation, and filing controls
- `TDS Compliance`: company PAN/TAN setup, sections, deductees, deductions, challans, returns, certificates, and reconciliation
- `Reports`: overview cards, recent accounting activity, vendor/assets/period reports, invoice/payment/voucher reports, salary/contract/day-book reports, cash/bank entries, trial balance, profit and loss, balance sheet, TDS report, and CSV exports

### 10.1.3 TDS Sports Complex Use Cases

Inside `Accounting -> TDS Compliance -> Deductions`, the `Sports Complex Use Case` selector helps the accounts team choose the correct section, rate, and threshold before previewing or recording a deduction.

Available presets:

- `Sports facility rent - equipment`: Section `194I`, rate `2%`, monthly threshold `50000`
- `Sports facility rent - land/building`: Section `194I`, rate `10%`, monthly threshold `50000`
- `Commercial room / hall rent`: Section `194I`, rate `10%`, monthly threshold `50000`
- `Residential room rent`: Section `194-IB`, rate `2%`, monthly threshold `50000`
- `Contract labour - Individual/HUF`: Section `194C`, rate `1%`, single threshold `30000`, annual threshold `100000`
- `Contract labour - Company/Firm`: Section `194C`, rate `2%`, single threshold `30000`, annual threshold `100000`
- `Professional services`: Section `194J`, rate `10%`, annual threshold `50000`
- `Event prize money`: Section `194B`, rate `30%`, single threshold `10000`

Note
The preset values are transaction-level overrides. Users can still edit the rate or threshold fields before previewing the calculation if the accountant confirms a different treatment. If PAN is missing or invalid, the system applies the higher-rate rule where applicable. The official Finance Act 2025 TDS rate table shows `194-IB` at `2%`; use the override field if a legacy or special residential rent case needs a different rate.

### 10.1.4 Payment Voucher (Reference Layout)

The Payment Voucher form and print template support the following fields:

- `No. / Reference No`
- `Date`
- `Name of the account`
- `Being Payment of`
- `For the period`
- `Received by`
- `Authorized by`
- `Amount`
- `Payment mode`
- `Expense category / account head`

Note  
Signature lines for the printed voucher can be turned on or off from `Settings -> Printing Preferences`. The form keeps the business details, while physical signing can be handled outside the system when required.

### 10.1.5 Recommended Daily Workflow

1. Confirm date range and refresh the active section.
2. Post transactions (invoice, expense, voucher, salary, contract, or manual entry).
3. Reconcile bank rows and period controls.
4. Review ledger and report totals.
5. Export required CSV statements for audit and reporting.

### 10.2 Settlements

Direct link: [Settlements](/accounting/settlements)

Purpose  
Handles payment reconciliation.

Description  
This page ensures transactions match actual payments and settlement activity, supporting financial accuracy and closure.

### 10.3 Validation Dashboard

Direct link: [Validation Dashboard](/accounting/validation)

Navigation path: `Top menu -> Validation -> Validation Dashboard`

Purpose  
Checks whether accounting reports, ledgers, and compliance figures are reliable before audit, filing, or management review.

Description  
This is a separate accounting health workspace. It consumes the validation API and does not write to existing accounting transaction collections. The page includes a `Validation Command Center` activity log, run controls, summary cards, health gauge, timeline, saved report list, detailed findings, drill-down records, export tools, repair support for selected findings, schedule settings, alert recipients, and an assistant panel for accounting review.

Main checks  

- `Double-entry integrity`: confirms debit and credit lines balance for each transaction.
- `Trial Balance`: checks total debit balances against total credit balances.
- `Balance Sheet equation`: checks Assets = Liabilities + Equity including retained earnings.
- `TDS / GST compliance`: compares deducted or payable amounts with challans/deposits and ledger balances.
- `Vendor / Customer reconciliation`: compares subsidiary balances against control accounts.
- `Missing sequences`: detects gaps in invoices, vouchers, and other number series.
- `Closed period posting`: flags entries dated inside locked financial periods.
- `Orphan records`: flags transactions linked to missing vendors, customers, ledgers, or documents.
- `Suspense / round-off review`: highlights balances that need accountant review.

How to use it  

1. Open `Validation -> Validation Dashboard`.
2. Select the accounting period to test from the run controls.
3. Click `Run Full Validation Now`.
4. Watch the `Validation Command Center` log to see which checks are running or completed.
5. Review the health score, critical count, warning count, and passed count.
6. Open failed checks, read `Why?`, review the suggested fix, and use drill-down records for correction.
7. Export PDF or Excel if the report is needed for audit follow-up.

### 10.4 One-click Help On Accounting Reports

The Accounting Dashboard and each Accounting Reports tab now includes in-screen help. Depending on the screen, it appears as a drawer button or expandable help card. The help panel shows:

- `Formula / Logic`: the calculation method used by the screen.
- `Data Used`: the collections or business records feeding the result.
- `Open full help`: a direct link to the matching manual topic.

This helps users verify how Total Income, Total Expense, Net Profit/Loss, Trial Balance, Balance Sheet, TDS, payroll, and book reports are derived without searching through the full manual.

## 11. Admin Menu

### 11.1 Settings

Direct link: [Settings](/settings)

Purpose  
Controls system behavior.

Description  
This page manages application configuration, business details, logos, SMTP settings, print settings, and database-related tools.

Sidebar menu inside Settings  
Use the left settings menu to move between:

- `Appearance`
- `Business Details`
- `Mail Settings`
- `Invoice Configuration`
- `Printing Preferences`
- `Security`
- `Backup & Restore`

### 11.2 Users

Direct link: [Users](/user-management)

Purpose  
Manages user access.

Description  
This page controls roles, permissions, and account access so administrators can decide who can use which pages.

### 11.3 Company Create

Direct link: [Company Create](/admin/company-create)

Purpose  
Defines company details.

Description  
This page stores organization-level information used during onboarding and major company setup activity.

### 11.4 Admin Reports

Direct link: [Admin Reports](/admin/reports)

Purpose  
Reviews system activity, audit trails, and login history.

Description  
This page is the admin reporting workspace for system controls. It includes `Overview`, `Audit Logs`, `Login Activity`, and `Transaction Logs` tabs so administrators can review system usage, export activity data, search by date or keyword, and monitor whether audit-log volume has crossed warning limits.

Key Uses

- Review overall admin-report summary and warning thresholds
- Search audit log rows by module or action
- Review login success, failure, OTP, and logout history
- Inspect transaction-side system logs
- Export admin-report review data

### 11.5 Accounting Transaction Reset Utility

File: `clear-accounting-transactions.bat`

Purpose  
Clears accounting-facing transaction data for testing while preserving master/setup data.

What it clears  
The reset utility clears transaction collections such as ledger entries, journal entries, customer ledger entries, accounting invoices, payments, vouchers, day-book rows, salary and contract payments, sales, returns, orders, quotations, facility/event booking transactions, member subscriptions, attendance rows used for payroll testing, purchase transactions, inventory balance/batch records, stock movement, bank feed/reconciliation rows, TDS/GST working records, payroll statutory outputs, and validation reports.

What the batch file also resets  
When run through `clear-accounting-transactions.bat`, the utility also resets derived and opening-balance style fields so the accounting workspace becomes clean again for testing. This includes customer outstanding balances, product stock-style totals, chart account opening balances, vendor opening balances, customer opening balances, treasury opening balances, product opening stock values, and the opening-balance setup lock or initialized state.

What it preserves  
It does not delete master/setup collections such as users, tenants, chart accounts, account groups, vendors, customers, products, categories, suppliers, employees, facilities, fixed assets, financial periods, stock locations, inventory valuation settings, membership plans, TDS sections, TDS deductee profiles, treasury accounts, app settings, and validation settings.

Safe usage  

1. Take a backup first.
2. Run `clear-accounting-transactions.bat --dry-run` or `node scripts\clear-accounting-transactions.cjs --dry-run --full-reset` to preview counts.
3. Run `clear-accounting-transactions.bat`.
4. Enter a tenant ID if only one tenant must be cleared, or leave blank for all tenants.
5. Type the confirmation phrase exactly when prompted.

Direct CLI options  

- `--dry-run` previews the delete plan without removing data.
- `--full-reset` runs transaction deletion plus derived/opening balance reset together.
- `--tenant=<tenantId>` limits the reset to one tenant.

## 12. Transaction Screen Guides

This section explains each main transaction screen in plain business language so a user can understand what to enter, why the screen matters, and how the saved entry affects later reports. In the application, each transaction page now includes a `Help for this screen` link that opens the matching topic directly.

### 12.1 Booking, Sales, And Membership Transactions

| Screen | What the screen does and example | How the saved entry reaches reports |
| --- | --- | --- |
| [Facility Booking](/user-manual#transaction-facility-booking) | Reserves a facility slot for a customer. Example: book `Badminton Court 2` for `Rahul Menon` on `2026-04-10` from `18:00` to `19:00` for `600` and mark it paid. | The booking increases facility usage history, supports occupancy review, and can contribute to booking revenue summaries. |
| [Event Booking](/user-manual#transaction-event-booking) | Blocks one or more facilities for an event organizer over a defined date and time window. Example: create `Summer Shuttle League` for `Metro Sports Club` from `2026-05-01` to `2026-05-03` with `5000` advance collected. | The event appears in event schedules, advance and balance tracking, and operational event reports. |
| [Event Quotation](/user-manual#transaction-event-quotation) | Prepares a quotation before the organizer confirms the booking. Example: quote `State Badminton Camp` for `Court 1` and `Court 2`, edit the default rental charges, apply `10%` discount, add `18%` GST, preview the PDF, and send it by email. | The quote stays in quotation tracking and revision history only. It affects booking and payment views only after the user loads it into the booking form and confirms the actual event booking. |
| [Sales Invoice](/user-manual#transaction-sales-invoice) | Creates the final customer bill for products sold at the counter or on credit. Example: sell shuttle tubes and grips to `Anjali Nair`, apply `100` discount, choose `UPI`, and post the invoice. | The sale increases sales totals, customer totals, GST summaries, payment-mode summaries, and reduces stock for the items sold. |
| [Quotation](/user-manual#transaction-quotation) | Prepares a price offer before the customer confirms purchase. Example: send a quotation to `Rising Stars Academy` for jerseys and cones, valid until `2026-04-30`. | Quotations stay in pre-sales tracking and version history. They affect final sales reports only after they are converted into an invoice. |
| [Returns](/user-manual#transaction-returns) | Records goods coming back from the customer and the related refund or adjustment decision. Example: return `2` shuttle tubes from invoice `INV-260407-00012` because the seal was damaged. | Approved returns reduce net sales impact and update sales return, refund, and customer adjustment reports. |
| [Membership Plan](/user-manual#transaction-membership-plan) | Defines the rules of a membership product such as price, validity, benefits, and renewal behavior. Example: create `Monthly Badminton Prime` for `2500`, valid `30` days, with `10%` booking discount. | The plan becomes available for subscriptions and later controls membership revenue, benefit usage, expiry, and renewal reporting. |
| [Membership Subscription](/user-manual#transaction-membership-subscription) | Enrolls a member into a selected plan and records the start of the membership cycle. Example: subscribe `Sreya Thomas` to `Monthly Badminton Prime` starting `2026-04-08` with `2500` paid. | The member appears in active-member counts, expiry alerts, renewal reminders, membership revenue, and benefit analytics. |

### 12.2 People Transactions

| Screen | What the screen does and example | How the saved entry reaches reports |
| --- | --- | --- |
| [Employee Check In](/user-manual#transaction-employee-attendance) | Lets the employee mark attendance from the sports complex with current time and GPS. Example: check in at `09:02` when arriving and check out at `18:11` when leaving. | The self attendance entry becomes the day’s attendance record and supports attendance and payroll review. |
| [Attendance Register](/user-manual#transaction-attendance) | Records employee presence for the day and locks the record after save. Example: mark one staff member `Present`, `Check In 09:00`, `Check Out 18:15`, and `OT 0.5`. | The entry increases attendance totals such as present days, leave days, and overtime hours for payroll and attendance reports. |
| [Attendance Reports](/user-manual#attendance-reports) | Shows two report styles: date-wise employee detail and one full monthly attendance sheet. Example: review all attendance rows from `2026-04-01` to `2026-04-30` and then print the month sheet. | The page reads saved attendance entries and presents them for review, printing, and export without changing the original attendance data. |
| [Payroll](/user-manual#transaction-payroll) | Converts the month’s attendance into payable salary figures. Example: generate payroll for `2026-04` after finishing the month’s attendance entries. | The output supports payroll summaries, salary planning, and management review of total payout for the month. |

#### Transaction: Employee Check In

Navigation path: `Top menu -> People -> Employee Check In`

What this screen does  
This screen lets an employee mark personal attendance without manual typing. The employee uses a mobile phone, turns on GPS, and taps the action button. The system saves the current time automatically.

How check in works  
When the employee is physically present at the sports complex, they open the page and tap `Check In Now`. The system reads the phone location and compares it with the sports complex location defined in `General Settings -> Security`. If the employee is inside the allowed radius, the system saves the day’s check-in time.

How check out works  
At the time of leaving, the employee opens the same page again and taps `Check Out Now`. The system again checks the phone location, records the current time, and completes that day’s attendance entry.

Practical example  
On `2026-04-08`, employee `Rakesh Kumar` reaches the arena at `09:02`. He opens `Employee Check In`, allows location access, and taps `Check In Now`. At `18:11`, while leaving from the same arena, he opens the page again and taps `Check Out Now`. The day is now saved with `Check In 09:02` and `Check Out 18:11`.

What happens if the employee is outside the sports complex  
If GPS is turned off, permission is denied, or the employee is outside the allowed sports complex radius, the system does not accept the check-in or check-out. This prevents attendance from being marked from home or from another location.

How it affects reports  
The check-in and check-out become the official attendance entry for that employee. Those times then support attendance summary, present-day counts, and monthly payroll review.

#### Transaction: Attendance Register

Navigation path: `Top menu -> People -> Attendance Register`

What this screen does  
This is the manual attendance page used by supervisors and administrators. It is meant for corrections, back-dated entries, or bulk review of daily staff attendance.

Practical example  
If one employee forgot to check out on `2026-04-08`, the supervisor opens the register, selects the date, updates `Check Out` to `18:10`, and saves the corrected row.

How it affects reports  
The saved or corrected entry becomes the attendance record used by attendance summary and payroll generation.

### 12.3 Accounting Transactions

| Screen | What the screen does and example | How the saved entry reaches reports |
| --- | --- | --- |
| [Accounting Invoice](/user-manual#transaction-accounting-invoice) | Creates an accounts-side invoice for services, rentals, or other income outside the retail sales screen. Example: raise an invoice to `Sunrise Sports School` for `12000` base amount plus GST with `5000` initial payment. | The invoice increases income and receivables, and any unpaid amount appears in outstanding reports until collected. |
| [Expense / Vendor Bill](/user-manual#transaction-expense-vendor-bill) | Records a business expense and any amount already paid to the vendor. Example: enter `LED floodlight repair` for `4500`, paid `2000`, against vendor `Bright Power Services`. | The bill updates expense totals, vendor balances, profit and loss, and payable tracking. |
| [Salary Payment](/user-manual#transaction-salary-payment) | Records salary paid to an employee for a month, with optional bonus. Example: pay `Nikhil Raj` salary for `2026-04` on `2026-04-30` with `22000` salary and `1500` bonus. | The payment appears in salary history, salary expense totals, profit and loss, and payslip follow-up. |
| [Contract Payment](/user-manual#transaction-contract-payment) | Records payment made to an outside contractor or service provider. Example: pay `Aqua Tech Solutions` `8000` for `Pool filtration AMC`. | The payment contributes to contract expense history and overall expense reporting. |
| [Daily Expense / Income Entry](/user-manual#transaction-daybook-entry) | Captures day-to-day cash or bank income and expense entries that are not part of normal invoicing. Example: record `Electricity` expense `3250` in cash or `Sponsorship` income `10000` in bank. | These entries feed income report, expense report, profit and loss, cash book, and bank book based on entry type and payment mode. |
| [Opening Balances](/user-manual#transaction-opening-balances) | Sets the starting cash, bank, stock, customer, and supplier balances when accounts begin from a chosen opening point. Example: set `Cash 25000 debit`, `Bank 180000 debit`, and supplier `Bright Power Services 7000 credit`. | These become the base figures for ledgers, trial balance, balance sheet, and future period reports. |
| [Receipt Voucher](/user-manual#transaction-receipt-voucher) | Records money received directly into accounts, usually for other income or non-sales receipts. Example: save `3500` cash received from `Arena Cafe` as stall space fee. | The voucher increases receipt records and affects cash or bank reports depending on payment mode. |
| [Payment Voucher](/user-manual#transaction-payment-voucher) | Records a direct outgoing payment with a clear business reference. Example: save a cash payment of `1800` for plumbing repair under `Repairs and Maintenance`. | The voucher appears in payment history and updates cash or bank movement for that period. |
| [Journal Voucher](/user-manual#transaction-journal-voucher) | Adjusts account balances without a physical cash or bank movement. Example: move `2500` from prepaid expense to another account through a month-end adjustment. | The voucher updates ledger balances, trial balance, and balance-sheet style reports. |
| [Cash-Bank Transfer](/user-manual#transaction-cash-bank-transfer) | Moves money between cash and bank without treating it as income or expense. Example: deposit `15000` cash into bank on `2026-04-07`. | Cash decreases, bank increases, and both cash book and bank book show the transfer. |
| [Bank Reconciliation Pending](/user-manual#transaction-bank-reconciliation) | Shows unreconciled bank-side ledger entries so the user can mark cleared items. Example: tick bank deposits or UPI receipts that already appear in the bank statement and then reconcile them. | Once reconciled, those entries stop appearing in pending reconciliation follow-up and the bank review becomes cleaner. |

### 12.4 CSV Bank Reconciliation

Direct manual link: [CSV Bank Reconciliation](/user-manual#transaction-csv-bank-reconciliation)

This screen matches bank statement entries with system ledger entries to ensure all bank transactions are recorded. It helps the accounts team confirm that the business books and the bank statement are telling the same story.

| User Action | System Response |
| --- | --- |
| Paste CSV | The screen reads the pasted bank statement rows and prepares them for comparison. It expects at least a `Date` and `Amount` column. |
| Click `Compare CSV` | The screen compares the pasted statement rows with unreconciled bank ledger rows and shows which rows match and which do not. |
| Click `Compare And Mark Matched` | The screen compares the rows and immediately marks matching ledger entries as reconciled so they do not remain in future pending reconciliation follow-up. |

Step-by-step real example:

1. A `UPI payment of 2000` dated `April 1, 2026` is already present in the system ledger.
2. The user pastes the following into the CSV area:

```text
Date,Amount,Description
2026-04-01,2000,UPI receipt
```

3. The user clicks `Compare CSV`.
4. The screen shows a matched result like this:

| Statement Row | Ledger Row | Match Status |
| --- | --- | --- |
| `2026-04-01 | 2000 | UPI receipt` | `2026-04-01 | 2000 | UPI receipt` | `Matched` |

5. The user clicks `Compare And Mark Matched`.
6. The entry is now reconciled, so it no longer appears in future reconciliation reports unless another unmatched issue is found later.

Common mismatch examples:

- `Date mismatch`: the bank statement shows `2026-04-01`, but the ledger entry was saved as `2026-04-02`. The amount may be correct, but the system will not treat it as a clean match.
- `Amount mismatch`: the bank statement shows `2000`, but the ledger has `1800` or `2200`. The entry needs checking before it should be reconciled.
- `Missing entry`: the bank statement row exists, but no matching ledger entry exists in the system. This usually means the business transaction has not yet been recorded or was posted under the wrong details.

Note  
The help icon on the CSV Bank Reconciliation screen opens this manual section directly.

### 12.5 Settlement And Procurement Transactions

| Screen | What the screen does and example | How the saved entry reaches reports |
| --- | --- | --- |
| [Settlement Receipt Voucher](/user-manual#transaction-settlement-receipt) | Collects money against outstanding sales or as an advance receipt. Example: receive `8000` by bank transfer from `Sunrise Sports School` and allocate it against the invoice shown in receivables. | The receipt reduces outstanding balance, increases collection totals, and updates receipt history. |
| [Credit Note](/user-manual#transaction-credit-note) | Records a customer credit that can later be adjusted or refunded. Example: create a credit note for `1416` because the wrong product was billed. | The credit affects customer balances, credit note reports, and any later refund or adjustment totals. |
| [Day-End Closing](/user-manual#transaction-day-end-closing) | Confirms the day’s opening cash, expected closing cash, and actual counted cash. Example: save `Opening Cash 12000` and `Physical Closing Cash 28450`. | The closing report shows expected cash, actual cash, and any shortage or excess as variance. |
| [Create Purchase Order](/user-manual#transaction-purchase-order) | Places a purchase request to a supplier before stock is received. Example: order `50` shuttle boxes and `4` replacement nets from `Ace Sports Wholesale`. | The purchase order appears in procurement tracking, but stock increases only after receipt is recorded. |
| [Receive Stock](/user-manual#transaction-receive-stock) | Confirms the quantity actually received from the supplier. Example: receive `40` shuttle boxes into `Main Store` with batch `SH-APR-26-A`. | Stock on hand increases and inventory movement reflects stock coming in. |
| [Purchase Return](/user-manual#transaction-purchase-return) | Sends damaged or unwanted received stock back to the supplier. Example: return `1` replacement net because of damaged stitching. | Inventory movement shows stock going out again and purchase return history is updated. |

Note  
Each transaction screen listed above has a `Help for this screen` link in the application that opens the matching topic directly.

## 13. Report Logic In Simple Terms

This section explains how report figures are calculated from the day-to-day entries made in Sarva. The wording below avoids technical details and focuses on the business meaning of each number.

### 13.1 General Rules Used Across Reports

- Reports use the transactions saved in the system for the selected date range.
- Final reports normally count active, posted, approved, or completed records. Draft, cancelled, archived, or inactive records are usually not included in final totals.
- If a payment is added later, the original transaction amount stays the same, but the balance or outstanding amount changes.
- If a return, refund, credit note, or cancellation is entered later, the related reports change to reflect that correction.
- Operational reports show activity such as bookings, memberships, or attendance. Financial reports show income, expenses, balances, and cash movement.

### 13.2 Sales And Customer Reports

`Sales Reports Menu Tabs`  
The `Sales & POS Reports` page is a tabbed workspace. Start by selecting the date range, then open the required tab from the `Reports Menu`. The page supports Excel and PDF export for the active tab.

`Profit And Loss (Store-level)`  
This tab gives a store-level profit-and-loss style view for the selected period. It helps management review sales-side income versus expense without leaving the Sales reports workspace.

`Balance Sheet (Store-level)`  
This tab gives a store-level position-style view for assets, liabilities, and net balance as on the selected period end.

`Sales Summary (Daily / Shift)`  
This tab groups business volume by day and shift so the team can compare counter performance, day-close patterns, and shift-wise sales activity.

`Daily Sales Summary`  
This report adds together all posted sales invoices for each day in the selected period. `Invoices` is the number of bills created that day. `Sales Amount` is the total bill value including the saved invoice total. `Tax Amount` comes from the GST recorded on those invoices. `Outstanding` is the unpaid balance still left on those invoices.

`Item-wise Sales`  
This report reads every item line entered on each sales invoice. Quantity sold is the total of all quantities for that item. Sales amount is the total line value for that item. Taxable value is the value before tax, and tax is the GST saved against the item lines.

`Customer-wise Sales`  
This report groups posted invoices customer by customer. Invoice count is how many invoices were raised for that customer. Amount is the total invoiced value. Outstanding is the unpaid portion still pending from that customer.

`Sales Returns`  
This report uses approved return entries only. `Returned Amount` is the value of the goods being returned. `Returned Tax` is the tax reversal recorded on those returned items. `Refund Amount` is the actual money given back or adjusted against the customer.

`Gross Profit Report`  
This report compares what the business sold against the recorded item cost. `Revenue` is the total invoice value. `Cost of Goods` is the total cost of the items sold. `Gross Profit` is revenue minus item cost. `Margin %` shows the profit as a percentage of revenue.

`HSN-wise Sales Report`  
This report groups sales by HSN or SAC classification so the business can review taxable value and tax amount by classification code.

`Taxable / Exempt / Nil / Non-GST`  
This report separates billed values by GST treatment bucket. It helps users understand how much billing was taxable and how much was exempt, nil-rated, or outside GST.

`B2B vs B2C Invoice Report`  
This report splits invoices into registered-party and consumer billing groups. It is useful for GST review and invoice scrutiny.

`Credit / Debit Note Register (GST)`  
This report shows GST-impacting credit or debit note activity linked to sales corrections and later document adjustments.

`Sales Register (Detailed)`  
This report lists invoice-level rows with customer, document, tax, value, and status details. It acts as the detailed sales register for audit review and export.

`Payment Reconciliation Report`  
This report compares invoice-side values with payment-side values so the team can identify what is fully settled, partially settled, or still mismatched.

`Z-Report (End of Day)`  
This report summarizes day-close billing and payment totals for counter operations. It supports front desk closure and end-of-day review.

`Inventory Movement (POS only)`  
This report shows stock movement caused only by POS selling activity. It helps the team review how sales reduced item quantities without mixing procurement-side stock changes.

`Membership Sales Report`  
This report summarizes membership or plan-related sales captured through the sales-side billing flow. It helps management review membership-linked billing without leaving the reports page.

`GST Handoff Datasets`  
This report prepares GST-facing export or verification datasets from sales transactions. It is used as handoff data for deeper GST workspace review and filing preparation.

`Outstanding Receivables`  
This report lists posted credit invoices that still have money left to collect. The total outstanding amount is simply the sum of all remaining balances on those open credit invoices.

`Attendance Report`  
This report shows attendance-linked operational counts inside the sales reporting workspace for quick comparison with the business period.

`Cash vs Credit Report`  
This report separates invoices by invoice type. Cash invoices are counted in the cash section. Credit invoices are counted in the credit section. Each side shows the number of invoices and their total value.

`User-wise Sales`  
This report groups invoices by the staff user who created the sale. It shows how many invoices each user handled and how much value they processed. Payment-mode columns such as cash, card, and UPI come from the payment method saved on those invoices.

`Tax Summary`  
This report uses the GST information saved on invoice item lines and return item lines. It shows taxable value and tax amount rate by rate, so the business can see how much tax was billed and how much tax was reversed through returns.

### 13.3 Inventory And Stock Reports

`Inventory Stock Summary`  
This report uses the current stock balance saved for each active stock-tracked product. It shows how many products are in stock, low stock, or out of stock. It also calculates stock value at cost price and at selling price.

`Low Stock Report`  
This report compares current stock against the minimum stock level set on each product. If stock is equal to or below the minimum, the product appears here.

`Inventory Valuation`  
This report multiplies current stock quantity by unit cost to get cost value, and by selling price to get retail value. The difference between those two values is shown as the potential margin value.

`Inventory Movement`  
This report summarizes stock coming in, going out, being transferred, and being adjusted. It is based on purchasing, stock receipt, stock return, transfer, and stock adjustment activity already recorded in the system.

`Dead Stock`  
This report finds products that still have stock on hand but have not been sold within the chosen number of days. It is useful for identifying slow-moving or idle stock.

`Fast Moving Report`  
This report ranks products by total quantity sold within the selected period. The most frequently sold items appear first.

### 13.4 Attendance And Payroll Figures

`Attendance Detail And Monthly Sheet`  
The employee-wise detail report reads each saved attendance row and shows the date, employee, status, check-in, check-out, worked time, overtime, and location link. The monthly sheet reads the same attendance rows and places them into a one-month calendar-style grid with a tick mark wherever presence was recorded.

`Payroll Output`  
Payroll is generated from employee master data, attendance entries, weekly offs, and overtime. `Base Pay` comes from salary or rate setup, `Overtime Pay` comes from overtime hours, and `Total Payable` is the amount due for the selected month.

### 13.5 Accounts And Settlement Reports

<a id="accounting-dashboard-logic"></a>

`Accounting Dashboard Logic`  
The accounting dashboard combines posted accounting movement for the selected dates with recent invoices, payments, journals, and compliance activity.

- `Selected Revenue` = posted sales/accounting income between the selected start date and end date.
- `Month-to-date Revenue` = posted income from the first day of the selected end-date month through the selected end date.
- `Expenses` = posted expense ledger movement inside the selected date range, with fallback rows used only where required.
- `Profit` = Selected Revenue - Expenses for the selected date range.
- `GST Payable` = output GST payable less input/settled GST movement from GST ledger accounts as on the selected end date.
- Data used: account ledger entries, accounting invoices, accounting payments, journal entries, and TDS/GST workspaces.

<a id="accounting-report-logic"></a>

`Accounting Reports Overview`  
The accounting reports overview combines the selected date range into summary cards and recent activity. Recent activity is sorted by latest transaction date and includes accounting invoices, payments, vouchers, journals, and TDS deductions so management can quickly verify what changed most recently before opening a detailed report tab.

- `Total Income` = income ledger credits minus income ledger debits, plus legacy POS/manual income fallback rows only where needed.
- `Total Expense` = expense ledger debits minus expense ledger credits, plus legacy payroll/contract/manual expense fallback rows only where needed.
- `Net Profit/Loss` = Total Income - Total Expense.
- `Balance Sheet Difference` = Assets - Liabilities - Equity after retained earnings and diagnostic rows.

`Income Report`  
This report combines posted sales income and manual income entries recorded in the day book. Total income is the sum of those income sources during the selected period.

`Expense Report`  
This report combines manual expense entries, salary payments, contract payments, and approved sales-return refunds. Total expense is the sum of those outgoing amounts.

<a id="accounting-trial-balance-logic"></a>

`Trial Balance`  
This report shows each account with its opening balance, period debits, period credits, and closing balance. In simple terms, it starts with the previous balance, adds money going into the account, subtracts money going out, and shows where the account stands at the end of the period.

- `Opening Balance` = chart opening balance unless an opening ledger entry already exists, plus ledger movement before the start date.
- `Period Debit` = sum of debit ledger entries inside the selected date range.
- `Period Credit` = sum of credit ledger entries inside the selected date range.
- `Closing Balance` = Opening Balance + Period Debit - Period Credit.
- `Debit Balance` and `Credit Balance` are derived from the closing balance normal side.
- Check expected by accounting principle: total debit balances should equal total credit balances.

<a id="accounting-profit-loss-logic"></a>

`Profit And Loss Statement`  
This report compares income against expense for the selected period. Sales income and manual income form the income side. Salary, contract, return refunds, and manual expenses form the expense side. `Net Profit` is income minus expense.

- `Income` = income ledger credits minus debits, excluding opening entries.
- `Expense` = expense ledger debits minus credits, excluding opening entries.
- Legacy fallback income/expense is included only when source documents do not already have ledger postings.
- `Net Profit/Loss` = Total Income - Total Expense.

<a id="accounting-balance-sheet-logic"></a>

`Balance Sheet`  
This report shows the business position as on one date. Assets such as cash, bank, stock, and other asset balances appear on one side. Liabilities and earnings appear on the other side. It is a snapshot of what the business owns and what it owes.

- `Assets` = debit-positive closing balances of asset accounts.
- `Liabilities` = credit-positive closing balances of liability accounts.
- `Equity` = capital/equity/opening-balance accounts plus retained earnings.
- `Retained Earnings` = profit/loss accumulated up to the selected as-on date.
- `Difference` = Assets - Liabilities - Equity. It should be zero after diagnostics are resolved.

<a id="accounting-tds-report-logic"></a>

`TDS Report`
This report suite summarizes the complete TDS lifecycle recorded in the TDS compliance workspace. The sub-tabs include `TDS Computation`, `TDS Payables`, `TDS Outstanding`, quarterly returns `24Q / 26Q / 27Q / 27EQ`, certificates `Form 16 / 16A / 27D`, `Form 26AS / AIS Reconciliation`, `TDS Mismatch`, `Challan Status`, `TDS Payment Register`, `Correction Returns`, `Audit Trail`, and `Tax Audit Clause 34(a)`. Each table supports search, filters, sorting, pagination, and CSV export from the accounting reports page.

- `TDS Deducted` = sum of TDS transaction amounts.
- `Deposited` = non-cancelled challan payments recorded against TDS.
- `Outstanding` = deducted amount minus deposited/allocated amount.
- Mismatch rows compare books, challans, returns, and reconciliation imports where available.

<a id="accounting-master-report-logic"></a>

`Master Reports`  
Vendor, fixed asset, and financial period reports use master/setup data.

- `Vendor Balance` = vendor opening balance and linked supplier ledger movement where available.
- `Asset Book Value` = original cost minus accumulated depreciation posted through asset workflows.
- `Financial Period Status` = open, closed, or locked status used by entry screens and validation checks.

<a id="accounting-transaction-report-logic"></a>

`Invoice, Payment, And Voucher Reports`  
These reports summarize transaction documents posted into accounting.

- `Invoice Balance` = invoice total amount minus paid amount.
- Payment amount is the saved posted amount by party and payment mode.
- Cancelled payments are excluded from final summaries.
- Voucher total is the saved voucher amount.
- Balanced vouchers must have equal debit and credit lines.

<a id="accounting-payroll-report-logic"></a>

`Salary And Contract Reports`  
Salary reports include gross salary, statutory deductions, voluntary deductions, net pay, employer payroll taxes, benefits expense, and total payroll cost.

- `Net Pay` = Gross Salary - statutory deductions - voluntary deductions.
- `Total Payroll Cost` = Gross Salary + employer payroll taxes + benefits expense.
- Contract expense is the posted contractor payment amount.
- Contract TDS is calculated from the applicable section/rate where enabled.

<a id="accounting-book-report-logic"></a>

`Cash Book`  
This report shows all cash-related entries during the period, including receipts, payments, expenses, sales collections, and transfers that affect cash.

- `Cash Closing` = opening cash + cash inflows - cash outflows.

`Bank Book`  
This report shows all bank-related entries during the period, including bank receipts, bank payments, and transfers between cash and bank.

- `Bank Closing` = opening bank balance + bank inflows - bank outflows.

`Day Book`  
Day Book is the chronological register of manual income/expense entries and operational accounting movement. Income entries increase income totals, expense entries increase expense totals, and payment mode decides whether the cash book or bank book is affected.

`Accounts Summary / MIS Summary`  
This summary combines major totals such as sales income, manual income, salary expense, contract expense, return-related refunds, manual expenses, credit note activity, and net profit. It gives management a quick accounting snapshot for the chosen period.

`Daily Collection Summary`  
This settlement view compares same-day cash movement. `Cash Sales` is cash collected through posted sales. `Cash Receipts` is money collected through receipt vouchers. `Cash Expenses` is cash paid out through expense entries. `Net Cash` is inflow minus outflow.

`User-wise Collection`  
This settlement report compares the number and value of invoices and receipts handled by each user during the selected period.

`Day-End Closing`  
This closing report starts with opening cash, adds the day's cash sales and cash receipts, subtracts cash expenses, and arrives at system closing cash. The user then enters physical closing cash, and the report shows the difference as variance.

### 13.6 Validation Dashboard And Accounting Health

<a id="validation-dashboard-logic"></a>

`Validation Dashboard`  
The Validation Dashboard runs read-only checks against accounting data and saves results in separate validation collections. It is designed to help the accountant identify whether reports can be trusted before closing, filing, or audit review.

- `Total Checks` = number of validation rules executed for the selected period.
- `Critical` = failures that can materially affect reports, such as unbalanced entries or balance sheet differences.
- `Warning` = items needing review, such as missing sequences, outstanding TDS, or closed-period postings.
- `Passed` = checks that completed without issues.
- `Health Score` = a management indicator based on pass/fail severity. Critical failures reduce the score most.
- `Drill Down` = source records behind a failed check, such as unbalanced vouchers or missing invoice numbers.
- `False Positive` feedback is stored separately and does not edit accounting data.

Checks covered include double-entry integrity, trial balance, balance sheet equation, TDS/GST reconciliation, vendor/customer reconciliation, missing sequences, closed-period postings, orphan records, cash/bank review, depreciation review, suspense balances, and round-off differences.

### 13.7 Membership Reports

`Active Members` and `Expired Members`  
These counts come from the current status of member subscriptions.

`Revenue From Memberships`  
This comes from the subscription amounts already collected and recorded for memberships.

`Renewal Rate`  
This shows how many renewals happened during the current month compared with the number of active members.

`Member Retention Rate`  
This shows how many members have stayed with the business long enough to have renewal history, compared with the total members considered.

`Most Popular Plan`  
This is the membership plan with the highest number of assigned subscriptions.

`Expiring In 7 Days`, `Expiring In 30 Days`, and `Grace Period`  
These figures come from comparing membership end dates and grace dates with today's date.

`Renewal Revenue`  
This is the total amount collected from renewal entries during the chosen reporting window.

`Reminder Channel Analytics`  
This shows how many reminders were sent, failed, skipped, or remained pending through each reminder channel such as email or SMS.

`Benefits Analytics`  
This report uses membership benefits applied at billing time. It shows how often benefits were used, how much discount or point redemption was given, and how many points were earned.

## 14. Sample Data Entry Examples

The examples below are realistic sample entries. Users can copy the same style when training staff. Adjust dates, names, prices, and amounts to match your own business.

### 14.1 Booking And Event Screens

`Facility Booking`  
Sample values: `Facility` Badminton Court 2, `Booking Date` 2026-04-10, `Customer Phone` 9876543210, `Customer Name` Rahul Menon, `Customer Email` rahul@example.com, `Start Time` 18:00, `End Time` 19:00, `Courts` 1, `Payment Status` Paid, `Amount` 600, `Notes` Weekend coaching slot.  
Result: the booking appears on the facility board, the customer history is updated, and the revenue can later be seen in booking-related summaries.

`Event Booking`  
Sample values: `Event Name` Summer Shuttle League, `Organizer Name` Metro Sports Club, `Organization` Metro Sports Club, `Phone` 9895012345, `Email` events@metrosports.in, `Facilities` Court 1 and Court 2, `Date Range` 2026-05-01 to 2026-05-03, `Time` 09:00 to 18:00, `Status` Confirmed, `Total Amount` 18000, `Advance Payment` 5000, `Advance Payment Method` Bank Transfer, `Remarks` Inter-club doubles tournament.  
Result: the event schedule is blocked in operations, the balance due is tracked, and payments for the event can be collected later.

`Event Quotation`  
Sample values: `Event Name` State Badminton Camp, `Organizer Name` Kerala Shuttle Academy, `Organization` Kerala Shuttle Academy, `Phone` 9847012345, `Email` academy@example.com, `Facilities` Court 1 and Court 2, `Date Range` 2026-05-10 to 2026-05-12, `Time` 09:00 to 13:00, `Quotation Status` Sent, `Discount Type` Percentage, `Discount` 10, `GST Rate` 18, `Terms` updated to mention sports complex discipline and damage charges. Use `Refresh Facility Pricing` first so the facility rental rows are pre-filled, then edit them if needed. After saving, use `Preview` to review the PDF, `Send Mail` to email it, or `Print` for a hard copy.  
Result: the quotation stays in quotation tracking and revision history only. When the organizer accepts it, the user can load it into the booking form and save the final event booking without retyping the event details.

### 14.2 Sales Screens

`Sales Invoice`  
Sample values: add `Yonex Mavis 350 Shuttle` quantity 10, `Badminton Grip` quantity 4, `Customer Phone` 9847001122, `Customer Name` Anjali Nair, `Customer Email` anjali@example.com, `Notes` Counter sale after coaching session, `Discount` 100 amount, `Payment Method` UPI, `Invoice Type` Cash Invoice, `Invoice Status` Post Invoice, `GST Bill` On.  
Result: the sale increases sales totals, item-wise sales, customer-wise sales, GST reports, and reduces stock for the products sold.

`Quotation`  
Sample values: `Customer Name` Rising Stars Academy, `Contact Person` Vivek Joseph, `Phone` 9846011122, `Valid Until` 2026-04-30, `Tax Mode` Tax exclusive, `GST Quote` On, items such as `Team Jersey` quantity 30 and `Practice Cone Set` quantity 6, `Notes` Delivery within 5 working days.  
Result: the quotation stays in the pre-sales register until approved or converted into an invoice, so it does not affect final sales totals until conversion.

`Sales Return`  
Sample values: `Source Invoice` INV-260407-00012, `Return Item` Shuttle tubes quantity 2, `Reason` Damaged seal, `Refund Method` Original payment, `Refund Amount` 720.  
Result: approved returns reduce the net business result through the returns report and update refund-related figures.

### 14.3 Membership Screens

`Create Plan`  
Sample values: `Plan Name` Monthly Badminton Prime, `Description` Evening access with member discounts, `Plan Type` Paid, `Status` Active, `Billing Cycle` Monthly, `Validity Days` 30, `Grace Days` 5, `Trial Days` 0, `Plan Price` 2500, `Discount %` 10, `Points / Currency` 1, `100 Points = Value` 100, `Minimum Redeem Points` 100, `Auto Renew` On.  
Result: this plan becomes available for new subscriptions and also affects future membership benefit calculations.

`Create Subscription`  
Sample values: `Membership Plan` Monthly Badminton Prime, `Full Name` Sreya Thomas, `Mobile` 9895123456, `Email` sreya@example.com, `Date Of Birth` 2001-08-14, `Address` Kadavanthra, Kochi, `Start Date` 2026-04-08, `Amount Paid` 2500, `Reminder Days` 7, `Auto Renew` Off, `Notes` Student discount approved.  
Result: the member appears in membership lists, expiry alerts, renewal reminders, and membership reports.

`Membership Renewal`  
Sample values: renew Sreya Thomas for another month, `Renewal Type` Manual, `Amount Paid` 2500, `Notes` Renewed at front desk.  
Result: renewal history is updated, renewal revenue increases, and renewal-rate reports improve.

### 14.4 People Screens

`Employee Check In`  
Sample values: employee opens the page at the sports complex, allows mobile GPS, taps `Check In Now` at `09:02`, then taps `Check Out Now` at `18:11` before leaving.  
Result: the system captures both times automatically and the day becomes available for attendance summary and payroll review.

`Attendance Entry`  
Sample values for one employee: `Status` Present, `Check In` 09:00, `Check Out` 18:15, `Overtime Hours` 0.5, `Notes` Covered evening shift.  
Result: the employee's attendance totals and monthly payroll calculations use this saved attendance entry.

`Payroll Generation`  
Sample value: `Month` 2026-04, then click `Generate`.  
Result: the system calculates payable days, overtime pay, arrears, gross pay, PF, ESI, professional tax, TDS, employer contribution, and net payout for each employee using the month's attendance and employee salary setup.

`Payroll Compliance`
Sample values: select `PF` under `Statutory Challans` and click `Generate`; create an arrears entry for an employee whose salary changed from `2026-02`; generate `Form 16` for `2025-26`; or calculate full-and-final settlement with notice pay, leave encashment, gratuity, recoveries, and TDS.
Result: the system saves downloadable payroll compliance worksheets and keeps recent challan, Form 16, arrears, and settlement records visible on the payroll page. Form 16 collects company PAN/TAN/legal name from TDS/company settings, employee PAN/address from employee master, salary/TDS values from payroll and salary payment records, and optional Section 10, Section 16, Chapter VI-A, quarterly receipt, and tax computation adjustments from the Form 16 details panel. The final Form 16 download is a PDF with Part A and Part B.

### 14.5 Accounts Screens

`Accounting Invoice`  
Sample values: `Invoice Date` 2026-04-07, `Customer / Party Name` Sunrise Sports School, `Description` Coaching court rental for April week 1, `Base Amount` 12000, `GST Amount` 2160, `Initial Payment` 5000, `GST Treatment` Intrastate, `Payment Mode` Bank Transfer, `Revenue Account` Booking Revenue.  
Result: the invoice increases income and receivables. If only part payment is received, the balance appears in outstanding reports.

`Expense / Vendor Bill`  
Sample values: `Expense Date` 2026-04-07, `Description` LED floodlight repair, `Amount` 4500, `Paid Amount` 2000, `Payment Mode` Bank Transfer, `Expense Account Name` Repairs and Maintenance, `Vendor` Bright Power Services.  
Result: the expense appears in expense reports, vendor payable balances, and profit-and-loss expense totals.

`Vendor Master`  
Sample values: `Vendor Name` Bright Power Services, `Contact Person` Arun Das, `Phone` 9846112233, `Email` support@brightpower.in, `Address` Thrissur Road, Kochi.  
Result: this vendor becomes available in expense entry and vendor balance reports.

`Salary Payment`  
Sample values: `Employee` EMP-014 Nikhil Raj, `Month` 2026-04, `Pay Date` 2026-04-30, `Amount` 22000, `Bonus Amount` 1500, `Payment Method` Bank Transfer, `Notes` Festival incentive.  
Result: the amount appears in salary history, expense reports, profit and loss, and payslip tracking.

`Contract Payment`  
Sample values: `Contractor Name` Aqua Tech Solutions, `Contract Title` Pool filtration AMC, `Payment Date` 2026-04-18, `Amount` 8000, `Status` Paid, `Payment Method` Bank Transfer, `Notes` Quarterly maintenance payment.  
Result: the payment appears in contract history and expense-related accounting reports.

`Daily Expense / Income Entry`  
Sample expense values: `Entry Type` Expense, `Category` Electricity, `Amount` 3250, `Payment Method` Cash, `Entry Date` 2026-04-07, `Reference No` EB-APR-07, `Narration` Utility cash payment.  
Sample income values: `Entry Type` Income, `Category` Sponsorship, `Amount` 10000, `Payment Method` Bank Transfer, `Entry Date` 2026-04-07, `Reference No` SP-APR-01, `Narration` Local tournament sponsor contribution.  
Result: these entries flow into income report, expense report, profit and loss, cash book, and bank book depending on type and payment method.

`Receipt Voucher`  
Sample values: `Amount` 3500, `Date` 2026-04-07, `Category` Other Income, `Payment Mode` Cash, `Counterparty` Arena Cafe, `Reference No` RCPT-APR-07-01, `Notes` Stall space fee collection.  
Result: the voucher increases receipt records and appears in cash-related reporting.

`Payment Voucher`  
Sample values: `Reference No` PV-APR-07-03, `Date` 2026-04-07, `Name of the account` Petty Cash Expense, `Being Payment of` Plumbing repair at spectator wash area, `For the period` April 2026, `Amount` 1800, `Payment Mode` Cash, `Expense Category` Repairs and Maintenance, `Received By` Manoj, `Authorized By` Admin Desk.  
Result: the voucher becomes part of payment history and affects cash or bank movement depending on mode.

`Journal Voucher`  
Sample values: `Date` 2026-04-07, `Debit Account` Prepaid Expenses, `Credit Account` Bank Charges Payable, `Amount` 2500, `Reference No` JV-APR-07-02, `Notes` Yearly software subscription allocation.  
Result: the journal updates account balances and appears in ledger, trial balance, and balance sheet.

`Cash-Bank Transfer`  
Sample values: `Amount` 15000, `Transfer Date` 2026-04-07, `Direction` Cash to Bank, `Reference No` DEP-APR-07, `Notes` Daily cash deposit.  
Result: cash decreases, bank increases, and both cash book and bank book reflect the transfer.

`Opening Balances`  
Sample values: `Cash Amount` 25000 debit, `Bank Amount` 180000 debit, `Opening Stock Value` 52000 debit, `Customer Accounts` Sunrise Sports School:15000:debit, `Supplier Accounts` Bright Power Services:7000:credit.  
Result: these become the starting balances for ledgers, trial balance, balance sheet, and future reporting periods.

### 14.6 Settlement Screens

`Settlement Receipt Voucher`  
Sample values: `Customer Name` Sunrise Sports School, `Amount` 8000, `Mode` Bank Transfer, `Notes` Part payment against April invoice, allocate 8000 against the outstanding invoice shown in the receivables list.  
Result: receivable balance reduces, receipt voucher register is updated, and collection reports increase.

`Credit Note`  
Sample values: `Customer Name` Anjali Nair, `Reason` Wrong product billed, `Subtotal` 1200, `Tax` 216, `Total` 1416, `Notes` To be adjusted against next purchase.  
Result: the customer's credit balance increases and can later be adjusted or refunded, affecting credit note summaries and expense-side refund figures.

`Day-End Closing`  
Sample values: `Business Date` 2026-04-07, `Opening Cash` 12000, `Physical Closing Cash` 28450, `Notes` Includes tournament walk-in collections.  
Result: the system compares expected cash with counted cash and shows any shortage or excess as variance.

### 14.7 Inventory And Procurement Screens

`Create Purchase Order`  
Sample values: `Supplier` Ace Sports Wholesale, `Expected Date` 2026-04-12, item 1 `Yonex Mavis 350 Shuttle` quantity 50 at unit cost 720, item 2 `Replacement Net` quantity 4 at unit cost 950, `Notes` Restocking before district tournament.  
Result: the purchase order enters the procurement register but stock does not increase until goods are received.

`Receive Stock`  
Sample values: against the above PO, receive `Shuttle` quantity 40, `Warehouse` Main Store, `Batch` SH-APR-26-A, `Expiry Date` 2027-04-01.  
Result: stock on hand increases and inventory movement records a stock-in transaction.

`Purchase Return`  
Sample values: return `Replacement Net` quantity 1, `Reason` Damaged stitching from supplier pack.  
Result: received stock is reduced and inventory movement records stock going back out.

## 15. How Data Moves From Entry Screen To Report

The reporting flow in Sarva follows a simple business sequence:

1. Master data is prepared first. Products, facilities, vendors, employees, plans, chart accounts, and customers are created so transactions have valid names and categories.
2. Daily transactions are entered. Staff then create bookings, invoices, expenses, salaries, memberships, attendance, vouchers, purchase orders, and other operational records.
3. Money movement is captured. Payments, receipts, refunds, credit adjustments, and transfers update balances instead of creating confusion through manual side calculations.
4. Status decides whether a record is counted. Posted, approved, active, completed, and saved records move into most reports. Draft, cancelled, archived, or inactive records are usually left out.
5. The selected date range controls what the user sees. A day report, month report, or year report simply reads the entries that fall inside that period.
6. Reports then summarize the saved entries. Some reports total money, some count records, some compare balances, and some rank items or members by activity.

In simple business terms:

- A booking entry creates operational usage history.
- A sales invoice creates revenue and may create an outstanding balance.
- A payment reduces what is still due.
- A return or refund reduces the final result.
- An attendance entry increases staff presence records.
- A payroll run converts attendance and salary setup into payable payroll figures.
- A voucher or day-book entry changes cash, bank, income, or expense balances.
- A membership entry creates future renewal, expiry, and benefit activity.
- A stock receipt changes inventory quantity and stock reports.

## 16. Final Summary

Sarva is a complete system for managing sports facility operations, sales, staff, and finances in one place. Each module plays a specific role, making the overall workflow smoother and more efficient.

Important reminders:

- Use the direct hyperlinks in this manual whenever you want to open a page quickly.
- Use the module path descriptions when training staff who are still learning navigation.
- If a page is missing from the menu, check user permissions in [Users](/user-management).
