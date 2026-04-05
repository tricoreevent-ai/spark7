import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getGeneralSettings } from '../utils/generalSettings';

type GuideField = {
  name: string;
  detail: string;
  required?: boolean;
};

type GuideFieldGroup = {
  title: string;
  fields: GuideField[];
};

type GuideLink = {
  label: string;
  to: string;
};

type FormGuide = {
  id: string;
  title: string;
  route: string;
  purpose: string;
  navigation: string;
  mandatoryCount: string;
  mandatorySummary: string;
  links: GuideLink[];
  fieldGroups: GuideFieldGroup[];
  notes: string[];
};

type GuideCategory = {
  id: string;
  title: string;
  summary: string;
  accent: string;
  forms: FormGuide[];
};

type NavigationGuide = {
  title: string;
  detail: string;
  steps: string[];
};

const navigationGuides: NavigationGuide[] = [
  {
    title: 'Before Login',
    detail: 'The manual itself is public, so new users can learn the system before signing in.',
    steps: [
      'Open the app login page and use the ? User Manual button.',
      'Use the Quick Form Links section in this guide to jump to the screen you want to learn.',
      'If you open a direct form route while logged out, the app will send you back to login.',
    ],
  },
  {
    title: 'After Login',
    detail: 'Most pages are reached from the top menu by category first, then by page name.',
    steps: [
      'Pick the category from the top menu: Sales, Catalog, People, Operations, Accounts, or Admin.',
      'Choose the page inside that category panel.',
      'Use the small route links in this manual when you want the exact page path.',
    ],
  },
  {
    title: 'When A Page Is Missing',
    detail: 'Menus are role-based, so two users may not see the same screens.',
    steps: [
      'If the page is missing from the menu, your role probably does not have access yet.',
      'Ask your administrator to enable the page in User Management or the role matrix.',
      'Refresh the browser after permissions change so the menu reloads cleanly.',
    ],
  },
];

const guideCategories: GuideCategory[] = [
  {
    id: 'sales-catalog',
    title: 'Sales and Catalog Forms',
    summary: 'These forms cover billing, quotations, customer records, item setup, and product grouping.',
    accent: 'from-emerald-500/20 via-sky-500/10 to-transparent',
    forms: [
      {
        id: 'sales-billing',
        title: 'Sales Billing / POS',
        route: '/sales',
        purpose: 'Create invoices, collect payments, add walk-in or existing customers, and complete product billing.',
        navigation: 'Top menu > Sales > Sales Dashboard, then open the billing or POS area.',
        mandatoryCount: '1 required rule to post an invoice',
        mandatorySummary: 'You must add at least one product line before posting the invoice.',
        links: [
          { label: 'Open Billing', to: '/sales' },
          { label: 'Sales Dashboard', to: '/sales-dashboard' },
          { label: 'Orders / Invoice History', to: '/orders' },
        ],
        fieldGroups: [
          {
            title: 'Core billing fields',
            fields: [
              { name: 'Product Search / Line Items', detail: 'Search and add the products being sold. This is the required part of the invoice.', required: true },
              { name: 'Customer Phone', detail: 'Used to search an existing customer quickly before billing.' },
              { name: 'Customer Name', detail: 'Useful for named billing when the sale is not a walk-in.' },
              { name: 'Customer Email', detail: 'Optional contact detail for invoice communication or future follow-up.' },
              { name: 'Invoice Notes', detail: 'Short remarks shown for internal billing context or customer instructions.' },
            ],
          },
          {
            title: 'Billing controls',
            fields: [
              { name: 'Manual Number Toggle', detail: 'Switch between automatic invoice numbering and manual numbering.' },
              { name: 'Manual Invoice Number', detail: 'Used only when manual numbering is enabled.' },
              { name: 'Membership Redeem Points', detail: 'Redeem member points against the current cart when allowed.' },
              { name: 'Paid Amount', detail: 'Entered in the payment modal while finalizing the invoice.' },
            ],
          },
        ],
        notes: [
          'Walk-in sales can be posted without customer details, but named sales should capture phone or name.',
          'Use Save Draft if the cart is not ready to post yet.',
          'Use Orders / Invoice History when you need to review or edit an already saved invoice.',
        ],
      },
      {
        id: 'quotations',
        title: 'Quotations',
        route: '/sales/quotes',
        purpose: 'Prepare customer estimates, save revisions, and approve quotes before converting them to a sale.',
        navigation: 'Top menu > Sales > Quotations.',
        mandatoryCount: '1 base rule, plus 1 more field for digital approval',
        mandatorySummary: 'A quote needs at least one line item. Digital approval also requires Approved By Name.',
        links: [{ label: 'Open Quotations', to: '/sales/quotes' }],
        fieldGroups: [
          {
            title: 'Customer and quote details',
            fields: [
              { name: 'Customer Phone', detail: 'Searches an existing customer and fills saved customer details.' },
              { name: 'Customer Name', detail: 'Visible customer name on the quotation.' },
              { name: 'Customer Email', detail: 'Optional email for sharing the quote.' },
              { name: 'Contact Person', detail: 'Person handling the quote on the customer side.' },
              { name: 'Contact Role', detail: 'Job title or role of the contact person.' },
              { name: 'Valid Until', detail: 'Expiry date of the quote offer.' },
              { name: 'Quote Status', detail: 'Tracks draft, pending, approved, or other internal states.' },
              { name: 'Pricing Mode', detail: 'Controls how pricing is applied inside the quote.' },
              { name: 'Tax Mode', detail: 'Controls whether line tax is inclusive or exclusive.' },
              { name: 'GST Bill Toggle', detail: 'Marks whether GST billing rules should be applied.' },
              { name: 'Notes', detail: 'Special conditions, delivery notes, or approval remarks.' },
            ],
          },
          {
            title: 'Line item details',
            fields: [
              { name: 'Product', detail: 'Product or service being quoted.', required: true },
              { name: 'Quantity', detail: 'Requested quantity for the line item.', required: true },
              { name: 'Unit Price', detail: 'Rate used for the quoted item.', required: true },
              { name: 'GST Rate', detail: 'Tax rate on the line item.' },
              { name: 'Approved By Name', detail: 'Required only when using the digital approval action.', required: true },
            ],
          },
        ],
        notes: [
          'The system will not save an empty quote.',
          'Use customer phone first when the customer already exists to avoid duplicate customer records.',
          'Digital approval is stricter than draft save because it asks for approver identity.',
        ],
      },
      {
        id: 'customers',
        title: 'Customers',
        route: '/customers',
        purpose: 'Create customer master records, maintain credit and pricing settings, and log relationship activity.',
        navigation: 'Top menu > Sales > Customers.',
        mandatoryCount: '2 required fields for customer creation, 1 required field for activity logging',
        mandatorySummary: 'Customer form requires Name and Phone. Activity logging requires Summary.',
        links: [{ label: 'Open Customers', to: '/customers' }],
        fieldGroups: [
          {
            title: 'Customer master fields',
            fields: [
              { name: 'Name', detail: 'Main display name for the customer record.', required: true },
              { name: 'Phone', detail: 'Primary contact number and duplicate-check field.', required: true },
              { name: 'Email', detail: 'Optional email for invoices, quotes, and reminders.' },
              { name: 'Address', detail: 'Billing or delivery address.' },
              { name: 'Account Type', detail: 'Controls how the customer is grouped for selling and reporting.' },
              { name: 'Credit Limit', detail: 'Maximum allowed credit for this customer.' },
              { name: 'Credit Days', detail: 'How long the customer can keep a balance outstanding.' },
              { name: 'Pricing Tier', detail: 'Default pricing rule applied to the customer.' },
              { name: 'Notes', detail: 'Extra service notes, preferences, or account remarks.' },
            ],
          },
          {
            title: 'Contact and activity sections',
            fields: [
              { name: 'Contact Name', detail: 'Secondary person under the same customer account.' },
              { name: 'Contact Role', detail: 'Role of that person within the customer organization.' },
              { name: 'Contact Phone', detail: 'Direct line for the contact person.' },
              { name: 'Contact Email', detail: 'Email for the contact person.' },
              { name: 'Primary / Visible Flags', detail: 'Controls whether the contact is the main visible person.' },
              { name: 'Activity Summary', detail: 'Short description of the customer interaction.', required: true },
              { name: 'Activity Type', detail: 'Call, meeting, follow-up, or another activity category.' },
              { name: 'Details', detail: 'Longer notes for the customer interaction.' },
              { name: 'Next Follow-up Date', detail: 'Reminder date for the next customer action.' },
            ],
          },
        ],
        notes: [
          'Phone is the safest field for checking whether the customer already exists.',
          'Use the activity log to track calls, reminders, or collection follow-ups.',
          'Credit settings should match your business policy before saving the account.',
        ],
      },
      {
        id: 'product-entry',
        title: 'Product Entry',
        route: '/products/entry',
        purpose: 'Create catalog items with pricing, stock, tax, barcode, reorder, and variant information.',
        navigation: 'Top menu > Catalog > Product Entry or Top menu > Sales > Product Entry.',
        mandatoryCount: '7 required fields',
        mandatorySummary: 'Product Name, SKU, Category, Price, Cost, Initial Stock, and Min Stock Alert are required.',
        links: [
          { label: 'Open Product Entry', to: '/products/entry' },
          { label: 'Product Catalog', to: '/products/catalog' },
          { label: 'Stock Alerts', to: '/products/alerts' },
        ],
        fieldGroups: [
          {
            title: 'Required product setup fields',
            fields: [
              { name: 'Product Name', detail: 'Main name shown in catalog and sales search.', required: true },
              { name: 'SKU', detail: 'Internal item code used for search and control.', required: true },
              { name: 'Category', detail: 'Primary product grouping.', required: true },
              { name: 'Price (Selling)', detail: 'Default selling price.', required: true },
              { name: 'Cost (Buying)', detail: 'Purchase or landed cost for margin tracking.', required: true },
              { name: 'Initial Stock', detail: 'Opening quantity available at creation time.', required: true },
              { name: 'Min Stock Alert', detail: 'Threshold for low-stock warning.', required: true },
            ],
          },
          {
            title: 'Additional product fields',
            fields: [
              { name: 'Barcode', detail: 'Barcode value used for scan-based billing.' },
              { name: 'Subcategory', detail: 'Secondary grouping within the main category.' },
              { name: 'Item Type', detail: 'Type classification for the item.' },
              { name: 'Description', detail: 'Longer product description or selling note.' },
              { name: 'Wholesale Price', detail: 'Separate rate for wholesale selling.' },
              { name: 'Promotional Price', detail: 'Temporary discounted selling rate.' },
              { name: 'Promo Start / Promo End', detail: 'Controls the active period of the promotional price.' },
              { name: 'GST Rate', detail: 'Default tax rate for the item.' },
              { name: 'Unit', detail: 'Selling unit such as piece, box, kg, or pack.' },
              { name: 'Auto Reorder / Reorder Quantity', detail: 'Used when you want low stock to trigger reorder guidance.' },
              { name: 'Image URL', detail: 'Stores the product image reference.' },
              { name: 'Variant Size / Variant Color', detail: 'Used for basic product variations.' },
              { name: 'Price Tiers', detail: 'Bulk or slab pricing for different quantity ranges.' },
              { name: 'Batch / Expiry / Serial / Negative Stock Flags', detail: 'Advanced stock control rules.' },
            ],
          },
        ],
        notes: [
          'Create the category first if the correct category does not exist yet.',
          'Use Product Catalog for edits and Stock Alerts for follow-up after saving the item.',
          'SKU should stay unique so billing and stock reports remain clean.',
        ],
      },
      {
        id: 'categories',
        title: 'Categories',
        route: '/categories',
        purpose: 'Create product group names so catalog filtering, reporting, and entry remain organized.',
        navigation: 'Top menu > Catalog > Categories.',
        mandatoryCount: '1 required field',
        mandatorySummary: 'Name is required. Description is optional.',
        links: [{ label: 'Open Categories', to: '/categories' }],
        fieldGroups: [
          {
            title: 'Category fields',
            fields: [
              { name: 'Name', detail: 'Category name used in product forms and reports.', required: true },
              { name: 'Description', detail: 'Optional note about when to use this category.' },
            ],
          },
        ],
        notes: [
          'Use short, stable names so product entry stays easy for staff.',
          'Create the category before opening Product Entry if users need it immediately.',
        ],
      },
    ],
  },
  {
    id: 'people-operations',
    title: 'People and Operations Forms',
    summary: 'These forms manage employees, shifts, facilities, bookings, events, plans, and subscriptions.',
    accent: 'from-amber-500/20 via-fuchsia-500/10 to-transparent',
    forms: [
      {
        id: 'employees',
        title: 'Employees',
        route: '/employees',
        purpose: 'Create employee master records and maintain payroll-related identity and rate details.',
        navigation: 'Top menu > People > Employees.',
        mandatoryCount: '2 required fields',
        mandatorySummary: 'Employee Code and Name are required before saving.',
        links: [{ label: 'Open Employees', to: '/employees' }],
        fieldGroups: [
          {
            title: 'Employee master fields',
            fields: [
              { name: 'Employee Code', detail: 'Unique employee identifier used across payroll and attendance.', required: true },
              { name: 'Name', detail: 'Employee display name.', required: true },
              { name: 'Designation', detail: 'Role or job title.' },
              { name: 'Employment Type', detail: 'Full-time, part-time, contract, or another internal type.' },
              { name: 'Monthly Salary', detail: 'Used for salaried payroll calculations.' },
              { name: 'Daily Rate', detail: 'Used for daily-wage based calculations.' },
              { name: 'Overtime Hourly Rate', detail: 'Extra rate for overtime payment.' },
              { name: 'Paid Leave', detail: 'Leave entitlement or allowed paid leave setting.' },
              { name: 'Active', detail: 'Controls whether the employee stays available in current operations.' },
            ],
          },
          {
            title: 'Salary summary tool',
            fields: [
              { name: 'Employee', detail: 'Choose the employee whose month summary you want to calculate.', required: true },
              { name: 'Month', detail: 'Pick the month for the salary view or calculation.', required: true },
            ],
          },
        ],
        notes: [
          'Use a consistent employee code format because it is the easiest identifier to search later.',
          'Salary-related fields should match the payroll method your company uses.',
        ],
      },
      {
        id: 'shifts',
        title: 'Shifts',
        route: '/shifts',
        purpose: 'Maintain working time templates used for attendance planning and staff scheduling.',
        navigation: 'Top menu > People > Shifts.',
        mandatoryCount: '0 hard-required fields in the row editor, but the row should be complete before saving',
        mandatorySummary: 'This page uses inline shift rows rather than one large form.',
        links: [{ label: 'Open Shifts', to: '/shifts' }],
        fieldGroups: [
          {
            title: 'Shift row fields',
            fields: [
              { name: 'Shift', detail: 'Name of the shift such as Morning, Evening, or Full Day.' },
              { name: 'Start', detail: 'Shift start time.' },
              { name: 'End', detail: 'Shift end time.' },
              { name: 'Weekly Off', detail: 'Default weekly holiday pattern for the shift.' },
              { name: 'Notes', detail: 'Extra scheduling instructions or clarifications.' },
            ],
          },
        ],
        notes: [
          'The page is easier to use when shift names are short and consistent.',
          'Keep start and end times realistic so attendance and payroll calculations remain meaningful.',
        ],
      },
      {
        id: 'facility-setup',
        title: 'Facility Setup',
        route: '/facilities/setup',
        purpose: 'Create and maintain bookable facilities such as courts, halls, rooms, or activity spaces.',
        navigation: 'Top menu > Operations > Facility Setup.',
        mandatoryCount: '3 required fields on create, 2 on edit',
        mandatorySummary: 'Facility Name and Hourly Rate are always required. Facility Image is required on create and optional on edit.',
        links: [
          { label: 'Open Facility Setup', to: '/facilities/setup' },
          { label: 'Open Facility Booking', to: '/facilities' },
        ],
        fieldGroups: [
          {
            title: 'Facility fields',
            fields: [
              { name: 'Facility Name', detail: 'Display name of the bookable facility.', required: true },
              { name: 'Location', detail: 'Branch, floor, or physical area.' },
              { name: 'Capacity', detail: 'How many simultaneous units or slots can be booked.' },
              { name: 'Hourly Rate', detail: 'Base booking rate per hour.', required: true },
              { name: 'Description', detail: 'What the facility is used for or any customer-facing notes.' },
              { name: 'Facility Image', detail: 'Main image for the facility. Required during new creation.', required: true },
              { name: 'Active', detail: 'Controls whether the facility can receive new bookings.' },
            ],
          },
        ],
        notes: [
          'Complete Facility Setup before attempting customer bookings.',
          'Capacity matters because multi-unit bookings depend on it.',
        ],
      },
      {
        id: 'facility-booking',
        title: 'Facility Booking',
        route: '/facilities',
        purpose: 'Reserve facilities for customer time slots and capture booking, payment, and customer information.',
        navigation: 'Top menu > Operations > Facility Booking.',
        mandatoryCount: '5 required fields for an existing customer, 6 for a new customer',
        mandatorySummary: 'Facility, Booking Date, Start Time, End Time, and Customer Phone are required. Customer Name becomes required when the customer is new.',
        links: [{ label: 'Open Facility Booking', to: '/facilities' }],
        fieldGroups: [
          {
            title: 'Booking details',
            fields: [
              { name: 'Facility', detail: 'Which court, hall, or unit is being booked.', required: true },
              { name: 'Booking Date', detail: 'Date of the reservation.', required: true },
              { name: 'Start Time', detail: 'Booking start time.', required: true },
              { name: 'End Time', detail: 'Booking end time. It must be later than the start time.', required: true },
              { name: 'Courts / Booked Units', detail: 'How many units are reserved when the facility supports capacity.' },
            ],
          },
          {
            title: 'Customer and payment details',
            fields: [
              { name: 'Customer Phone', detail: 'Primary search field for an existing customer.', required: true },
              { name: 'Customer Name', detail: 'Required when the booking is for a new customer.', required: true },
              { name: 'Customer Email', detail: 'Optional email for confirmations or coordination.' },
              { name: 'Payment Status', detail: 'Tracks pending, partial, paid, or other payment states.' },
              { name: 'Custom Amount', detail: 'Use when the booking amount differs from the standard rate.' },
              { name: 'Notes', detail: 'Special booking instructions or reminders.' },
            ],
          },
        ],
        notes: [
          'The form checks availability and capacity before confirming the booking.',
          'Use customer phone first so repeat customers do not get created again as new records.',
        ],
      },
      {
        id: 'event-booking',
        title: 'Event Booking',
        route: '/events',
        purpose: 'Manage organizer-led events that can use one or more facilities and track amount, timing, and status.',
        navigation: 'Top menu > Operations > Event Booking.',
        mandatoryCount: '3 core required fields plus a valid time range',
        mandatorySummary: 'Event Name, Organizer Name, and at least one Facility are required. End time must be later than start time.',
        links: [{ label: 'Open Event Booking', to: '/events' }],
        fieldGroups: [
          {
            title: 'Event identity and contact fields',
            fields: [
              { name: 'Event Name', detail: 'Main event title.', required: true },
              { name: 'Organizer Name', detail: 'Name of the person or party arranging the event.', required: true },
              { name: 'Organization', detail: 'Company, club, or group name if applicable.' },
              { name: 'Phone', detail: 'Primary organizer contact number.' },
              { name: 'Email', detail: 'Primary organizer email.' },
            ],
          },
          {
            title: 'Event schedule and finance fields',
            fields: [
              { name: 'Event Date', detail: 'Date of the event.' },
              { name: 'Start Time', detail: 'When the event begins.' },
              { name: 'End Time', detail: 'When the event ends. Must be later than start time.' },
              { name: 'Facilities', detail: 'One or more facilities linked to the event.', required: true },
              { name: 'Status', detail: 'Current lifecycle stage of the event.' },
              { name: 'Total Amount', detail: 'Full charge for the event booking.' },
              { name: 'Advance Payment', detail: 'Amount already collected.' },
              { name: 'Remarks', detail: 'Logistics notes, commitments, or internal remarks.' },
            ],
          },
        ],
        notes: [
          'Select facilities carefully because at least one facility must be attached before save.',
          'Use remarks for setup notes that staff may need on the event date.',
        ],
      },
      {
        id: 'membership-plan',
        title: 'Membership Plan',
        route: '/membership-plans/create',
        purpose: 'Define membership products, pricing, validity, visit rules, benefits, discounts, and renewal behavior.',
        navigation: 'Top menu > Operations > Create Plan.',
        mandatoryCount: '1 explicit required field',
        mandatorySummary: 'Plan Name is required. The rest of the fields control how the plan behaves.',
        links: [
          { label: 'Open Create Plan', to: '/membership-plans/create' },
          { label: 'Memberships', to: '/memberships' },
        ],
        fieldGroups: [
          {
            title: 'Plan identity and scope fields',
            fields: [
              { name: 'Plan Name', detail: 'Unique plan name shown to staff and members.', required: true },
              { name: 'Facility Type', detail: 'Type of facility or service the plan applies to.' },
              { name: 'Facilities', detail: 'Specific facilities included in the membership.' },
              { name: 'Validity Days', detail: 'How long the plan stays active after start.' },
              { name: 'Grace Days', detail: 'Extra days allowed after expiry.' },
              { name: 'Trial Days', detail: 'Optional trial period before the full plan period.' },
            ],
          },
          {
            title: 'Pricing and benefit fields',
            fields: [
              { name: 'Plan Price', detail: 'Base amount charged for this plan.' },
              { name: 'Flat Discount', detail: 'Fixed amount discount applied to the plan.' },
              { name: 'Discount %', detail: 'Percentage discount for the plan.' },
              { name: 'Points / Currency', detail: 'Defines loyalty point earning for the plan.' },
              { name: '100 Points = Value', detail: 'Redemption value rule for points.' },
              { name: 'Minimum Redeem Points', detail: 'Smallest point balance allowed for redemption.' },
              { name: 'Sessions Limit', detail: 'How many sessions the member can use.' },
              { name: 'Visit Limit', detail: 'How many visits are included.' },
              { name: 'Points Multiplier', detail: 'Bonus earning factor for this plan.' },
              { name: 'Free Services / Items', detail: 'Complimentary benefits bundled into the plan.' },
              { name: 'Access Restrictions', detail: 'Day, time, or usage restrictions.' },
              { name: 'Auto Renew', detail: 'Whether the plan should renew automatically.' },
              { name: 'One-Time Fee Toggle / Amount', detail: 'Extra joining fee configuration.' },
            ],
          },
        ],
        notes: [
          'Even though only Plan Name is technically required, plans work better when price, validity, and usage rules are filled properly.',
          'Use clear plan names so staff can choose the right plan quickly during subscription.',
        ],
      },
      {
        id: 'membership-subscription',
        title: 'Membership Subscription',
        route: '/membership-subscriptions/create',
        purpose: 'Enroll a member into a plan and capture profile, communication, billing, and renewal preferences.',
        navigation: 'Top menu > Operations > Create Subscription.',
        mandatoryCount: '3 required fields',
        mandatorySummary: 'Membership Plan, Full Name, and Mobile are required.',
        links: [
          { label: 'Open Create Subscription', to: '/membership-subscriptions/create' },
          { label: 'Memberships', to: '/memberships' },
        ],
        fieldGroups: [
          {
            title: 'Required subscription fields',
            fields: [
              { name: 'Membership Plan', detail: 'Plan being assigned to the member.', required: true },
              { name: 'Full Name', detail: 'Primary member name.', required: true },
              { name: 'Mobile', detail: 'Primary mobile number. Must be unique.', required: true },
            ],
          },
          {
            title: 'Profile and renewal fields',
            fields: [
              { name: 'Email', detail: 'Optional email for reminders and communication.' },
              { name: 'Date of Birth', detail: 'Member date of birth.' },
              { name: 'Emergency Contact', detail: 'Backup contact information.' },
              { name: 'Alternate Full Name', detail: 'Additional or alternate identity field.' },
              { name: 'Gender', detail: 'Member gender field.' },
              { name: 'Language Preference', detail: 'Preferred communication language.' },
              { name: 'Theme Preference', detail: 'Display or communication preference.' },
              { name: 'Address', detail: 'Member address.' },
              { name: 'Profile Photo URL', detail: 'Image reference for the member profile.' },
              { name: 'Start Date', detail: 'Date when the subscription begins.' },
              { name: 'Amount Paid', detail: 'Amount collected at signup.' },
              { name: 'Discount %', detail: 'Discount granted on this subscription.' },
              { name: 'Reminder Days', detail: 'How early renewal reminders should start.' },
              { name: 'Auto Renew', detail: 'Whether this member should renew automatically.' },
              { name: 'Notes', detail: 'Any special handling or member remarks.' },
            ],
          },
        ],
        notes: [
          'Pick the plan first so staff do not enroll the member into the wrong membership.',
          'Mobile number is the best field for duplicate prevention and reminder communication.',
        ],
      },
    ],
  },
  {
    id: 'accounts-admin',
    title: 'Accounts and Admin Forms',
    summary: 'These forms cover settlements, day close, user setup, roles, and permission control.',
    accent: 'from-cyan-500/20 via-rose-500/10 to-transparent',
    forms: [
      {
        id: 'settlements',
        title: 'Settlement Center',
        route: '/accounting/settlements',
        purpose: 'Handle receipts, credit notes, adjustments, refunds, and day-end cash closing from one finance screen.',
        navigation: 'Top menu > Accounts > Settlements.',
        mandatoryCount: 'Varies by section on the page',
        mandatorySummary: 'Receipt Voucher requires Amount > 0. Credit Note requires Total > 0. Day-End Closing depends on business date and cash values.',
        links: [{ label: 'Open Settlements', to: '/accounting/settlements' }],
        fieldGroups: [
          {
            title: 'Receipt Voucher section',
            fields: [
              { name: 'Customer Name', detail: 'Customer linked to the receipt.' },
              { name: 'Amount', detail: 'Receipt amount. Must be greater than zero.', required: true },
              { name: 'Payment Mode', detail: 'Cash, card, transfer, or another payment method.' },
              { name: 'Notes', detail: 'Reason or receipt-specific remarks.' },
              { name: 'Advance Receipt Toggle', detail: 'Marks the receipt as an advance collection.' },
              { name: 'Outstanding Allocation Rows', detail: 'Lets you apply the receipt against open balances.' },
            ],
          },
          {
            title: 'Credit Note and adjustment sections',
            fields: [
              { name: 'Customer Name / Phone / Email', detail: 'Customer identity fields tied to the credit note.' },
              { name: 'Reason', detail: 'Why the credit note is being issued.' },
              { name: 'Subtotal', detail: 'Base amount before tax.' },
              { name: 'Tax', detail: 'Tax part of the credit note.' },
              { name: 'Total', detail: 'Final credit note value. Must be greater than zero.', required: true },
              { name: 'Source Sale ID', detail: 'Original sale reference for traceability.' },
              { name: 'Notes', detail: 'Extra explanatory text for the credit note.' },
              { name: 'Adjustment Amount', detail: 'Value used when adjusting a credit against a sale.' },
              { name: 'Adjustment Note', detail: 'Reason for the adjustment.' },
            ],
          },
          {
            title: 'Refund and day-end sections',
            fields: [
              { name: 'Refund Amount', detail: 'Amount being returned to the customer.' },
              { name: 'Refund Note', detail: 'Reason for the refund.' },
              { name: 'Business Date', detail: 'Date for the day-end closing entry.' },
              { name: 'Opening Cash', detail: 'Cash in hand at the beginning of the day.' },
              { name: 'Physical Closing Cash', detail: 'Cash physically counted at close.' },
              { name: 'Notes', detail: 'Short explanation for exceptions, mismatch, or closing remarks.' },
            ],
          },
        ],
        notes: [
          'This page has multiple finance forms, so check which section is active before saving.',
          'Amounts are the strictest validation points on this screen.',
          'Use notes generously when the transaction is unusual or needs audit clarity.',
        ],
      },
      {
        id: 'user-management',
        title: 'User Management',
        route: '/user-management',
        purpose: 'Create users, edit roles, activate or deactivate access, and maintain page-level permissions.',
        navigation: 'Top menu > Admin > Users.',
        mandatoryCount: '4 required fields for a new user, 3 required fields when editing an existing user, 1 required field for role creation',
        mandatorySummary: 'New users need Email, Password, First Name, and Last Name. Editing keeps Password optional. New role creation requires Role Name.',
        links: [{ label: 'Open Users', to: '/user-management' }],
        fieldGroups: [
          {
            title: 'User account fields',
            fields: [
              { name: 'Email', detail: 'User login email.', required: true },
              { name: 'Password', detail: 'Required for new users. Optional while editing an existing user.', required: true },
              { name: 'First Name', detail: 'User first name.', required: true },
              { name: 'Last Name', detail: 'User last name.', required: true },
              { name: 'Phone Number', detail: 'Optional contact number for the user.' },
              { name: 'Business Name', detail: 'Business or branch identification if used in your setup.' },
              { name: 'Role', detail: 'Role template that controls access.' },
              { name: 'Active', detail: 'Enables or disables sign-in permission for the user.' },
            ],
          },
          {
            title: 'Role setup fields',
            fields: [
              { name: 'Role Name', detail: 'Name of the new role template.', required: true },
              { name: 'Permission Matrix', detail: 'Checkbox grid that controls which pages the role can open.' },
            ],
          },
        ],
        notes: [
          'If a user says a page is missing, this is the first screen to check.',
          'Password is only compulsory when the user is being created for the first time.',
        ],
      },
    ],
  },
];

const quickFormLinks = guideCategories.flatMap((category) =>
  category.forms.map((form) => ({
    id: form.id,
    title: form.title,
    route: form.route,
    navigation: form.navigation,
    category: category.title,
  }))
);

export const HelpCenter: React.FC<{ isPublic?: boolean }> = ({ isPublic = false }) => {
  const settings = useMemo(() => getGeneralSettings(), []);
  const supportEmail = settings.business.email?.trim() || '';
  const supportPhone = settings.business.phone?.trim() || '';
  const brandName = settings.business.tradeName || settings.business.legalName || 'SPARK AI';
  const routeActionLabel = isPublic ? 'Open route after login' : 'Open page';

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
          <div className="grid gap-0 lg:grid-cols-[1.5fr_0.9fr]">
            <div className="bg-gradient-to-br from-indigo-500/20 via-sky-500/10 to-transparent p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200">
                {isPublic ? 'Public User Manual' : 'User Manual'}
              </p>
              <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">How to use {brandName}</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-200 sm:text-base">
                This guide is now organized screen by screen. For each main form, you can see how to reach the page,
                the direct route, the current mandatory field count, and a plain-language explanation of the fields on
                that form.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {isPublic ? (
                  <>
                    <Link
                      to="/"
                      className="inline-flex items-center rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
                    >
                      Back to Login
                    </Link>
                    <a
                      href="#quick-form-links"
                      className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-white/10"
                    >
                      Jump to Form Links
                    </a>
                  </>
                ) : (
                  <>
                    <Link
                      to="/"
                      className="inline-flex items-center rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
                    >
                      Go to Dashboard
                    </Link>
                    <a
                      href="#form-guides"
                      className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-white/10"
                    >
                      Jump to Form Guides
                    </a>
                  </>
                )}
              </div>
              <div className="mt-6 flex flex-wrap gap-2 text-xs text-gray-300">
                <span className="rounded-full border border-white/10 bg-gray-950/30 px-3 py-1">Available before login</span>
                <span className="rounded-full border border-white/10 bg-gray-950/30 px-3 py-1">Direct page routes included</span>
                <span className="rounded-full border border-white/10 bg-gray-950/30 px-3 py-1">Mandatory counts from live form rules</span>
              </div>
            </div>

            <div className="border-t border-white/10 bg-gray-950/35 p-6 sm:p-8 lg:border-l lg:border-t-0">
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Support Checklist</p>
                  <p className="mt-2 text-sm text-white">Share these details when reporting an issue:</p>
                </div>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">The page name and the menu path you used to open it</li>
                  <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">The fields you filled and which mandatory field blocked you</li>
                  <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Date, time, and a screenshot of the error or wrong result</li>
                  <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Whether the issue happens every time or only for one record</li>
                </ul>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-gray-400">Contact</p>
                  <p className="mt-2 text-sm text-gray-100">
                    {supportEmail ? supportEmail : 'Contact your administrator or internal support desk.'}
                  </p>
                  {supportPhone ? <p className="mt-1 text-sm text-gray-300">{supportPhone}</p> : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="navigation-basics" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">Navigation Basics</p>
              <h2 className="text-2xl font-bold text-white">How to access each page</h2>
            </div>
            <p className="max-w-2xl text-sm text-gray-300">
              Every form below includes its menu path and direct route. Use the menu path first, and use the route when
              you want the exact page link.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {navigationGuides.map((guide) => (
              <article key={guide.title} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">{guide.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-300">{guide.detail}</p>
                <ul className="mt-4 space-y-3">
                  {guide.steps.map((step) => (
                    <li key={step} className="rounded-2xl border border-white/10 bg-gray-950/25 px-4 py-3 text-sm leading-6 text-gray-200">
                      {step}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section id="quick-form-links" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Quick Form Links</p>
              <h2 className="text-2xl font-bold text-white">Jump to the form you need</h2>
            </div>
            <p className="max-w-2xl text-sm text-gray-300">
              The anchor opens the guide section on this page. The route button opens the actual form route in the app.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {quickFormLinks.map((form) => (
              <article key={form.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{form.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-gray-400">{form.category}</p>
                  </div>
                  <a
                    href={`#${form.id}`}
                    className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs font-semibold text-gray-100 hover:bg-white/10"
                  >
                    View Guide
                  </a>
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-300">{form.navigation}</p>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-gray-950/25 px-3 py-2">
                  <code className="text-xs text-sky-200">{form.route}</code>
                  <Link
                    to={form.route}
                    className="rounded-md bg-indigo-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400"
                  >
                    {routeActionLabel}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="form-guides" className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-200">Form Guides</p>
              <h2 className="text-2xl font-bold text-white">Field-by-field user manual</h2>
            </div>
            <p className="max-w-2xl text-sm text-gray-300">
              Mandatory counts below reflect the current screen validations in the app. Your business process may still
              expect extra optional fields for cleaner records.
            </p>
          </div>

          {guideCategories.map((category) => (
            <section
              key={category.id}
              className={`rounded-3xl border border-white/10 bg-gradient-to-br ${category.accent} p-6 shadow-[0_18px_60px_rgba(15,23,42,0.28)]`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-200">{category.title}</p>
                  <h3 className="text-xl font-bold text-white">{category.summary}</h3>
                </div>
              </div>

              <div className="mt-5 grid gap-5">
                {category.forms.map((form) => (
                  <article key={form.id} id={form.id} className="rounded-3xl border border-white/10 bg-gray-950/35 p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h4 className="text-xl font-semibold text-white">{form.title}</h4>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">{form.purpose}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-100">
                        <p className="text-xs uppercase tracking-[0.14em] text-gray-400">Mandatory Count</p>
                        <p className="mt-1 font-semibold">{form.mandatoryCount}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-gray-400">How To Access</p>
                        <p className="mt-2 text-sm leading-6 text-gray-200">{form.navigation}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-gray-400">Direct Route</p>
                        <code className="mt-2 block text-sm text-sky-200">{form.route}</code>
                        <Link
                          to={form.route}
                          className="mt-3 inline-flex rounded-md bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400"
                        >
                          {routeActionLabel}
                        </Link>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-gray-400">Mandatory Rule</p>
                        <p className="mt-2 text-sm leading-6 text-gray-200">{form.mandatorySummary}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {form.links.map((link) => (
                        <Link
                          key={`${form.id}-${link.to}-${link.label}`}
                          to={link.to}
                          className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-100 hover:bg-white/10"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                      {form.fieldGroups.map((group) => (
                        <section key={`${form.id}-${group.title}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <h5 className="text-sm font-semibold uppercase tracking-[0.14em] text-indigo-200">{group.title}</h5>
                          <div className="mt-4 grid gap-3">
                            {group.fields.map((field) => (
                              <div key={`${form.id}-${group.title}-${field.name}`} className="rounded-2xl border border-white/10 bg-gray-950/25 px-4 py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-white">{field.name}</p>
                                  {field.required ? (
                                    <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-200">
                                      Required
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-2 text-sm leading-6 text-gray-300">{field.detail}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>

                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-200">Usage Notes</p>
                      <ul className="mt-3 space-y-2">
                        {form.notes.map((note) => (
                          <li key={`${form.id}-${note}`} className="rounded-2xl border border-white/10 bg-gray-950/25 px-4 py-3 text-sm leading-6 text-gray-200">
                            {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </section>
      </div>
    </div>
  );
};
