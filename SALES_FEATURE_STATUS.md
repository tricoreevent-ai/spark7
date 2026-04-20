# SPARK AI Sales Feature Status

Scope: offline/internal sales workflows only. Online commerce features like e-commerce sync, payment links, and direct online gateway capture are intentionally excluded from this sheet.

## Already Present Before This Batch

- Customer master records with credit limits, credit days, blocking, ledger, and AR aging
- POS/sales invoicing with cash or credit invoices, draft/post flow, GST/non-GST, returns, and printing
- Sales history editing for draft/posted invoices
- Credit notes, receipt vouchers, settlement/day-end workflows
- Sales dashboards, gross profit, receivables, customer-wise/item-wise reports
- Sales tax summary report with GST rate-wise sales and return tax values
- Low-stock reporting, procurement, and purchase-order workflows

## Added In This Batch

- Quotations module
  - Create, edit, revise, and delete quotations
  - Quote version history
  - Digital approval capture
  - Quote-to-draft-invoice conversion
- Draft invoice posting from Sales History
- Customer contact roles and CRM notes
  - Billing/operational/C-level/general contacts
  - Customer pricing tier field
  - Activity tracking for calls, emails, meetings, disputes, and payment reminders
  - Collections watchlist with dunning recommendations
- Product sales controls
  - Inventory vs service vs non-inventory item types
  - Tier pricing and quantity-based pricing support
  - Promotional pricing windows
  - Auto-reorder flag and reorder quantity
  - Sales flow now respects non-stock items and advanced pricing inputs

## Still Missing Or Partial

- Backorder management and partial-shipment warehouse flow
- Pick/pack/ship workflow and delivery documentation
- Bundle/kitting stock deduction
- Complex price-rule engine beyond tiers/promotions/customer overrides
- Recurring billing, progress billing, and consolidated invoicing
- Automated outbound reminder sending (current dunning is tracking + recommendation, not email/SMS dispatch)
- Sales rep quota/commission tracking
- Pipeline/Kanban deal management
- Transaction-level document attachment management
- Mobile-specific sales experience

## Recommended Next Build Order

1. Bundle/kitting plus backorder handling
2. Recurring/progress/consolidated invoicing
3. Sales rep performance and commission analytics
