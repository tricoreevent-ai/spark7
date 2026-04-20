# Accounting Test Cases

## Automated scenarios

Run:

```bash
npm run test:accounting
```

Covered scenarios:

1. Cash booking
Expected:
Debit `Cash In Hand`
Credit `Booking Revenue`

2. Credit booking
Expected:
Debit `Accounts Receivable`
Credit `Booking Revenue`

3. Credit booking with later payment
Expected:
Debit `Cash In Hand`
Credit `Accounts Receivable`

4. GST booking
Expected:
Debit settlement account with gross amount
Credit revenue with base amount
Credit `CGST Payable` and `SGST Payable` or `IGST Payable`

5. Expense entry
Expected:
Debit expense account
Credit cash or bank

6. Refund
Expected:
Debit revenue
Credit cash or bank

7. Depreciation
Expected:
Debit `Depreciation Expense`
Credit `Accumulated Depreciation`

8. Bank reconciliation
Expected:
Match by date plus amount and separate unmatched statement or ledger rows

## Manual UI checks

1. Open `Accounting`
Confirm the left sidebar menu loads with:
`MIS Dashboard`, `Invoices & Payments`, `Vendors / Assets / Periods`, `Salary & Contract`, `Opening Balances`, `Expenses & Income`, `Vouchers`, `Cash & Bank Book`, `Treasury & Banks`, `Chart & Ledger`, `GST & Filing`, `TDS Compliance`, `Reports`.

2. Open `Accounting -> MIS Dashboard`
Confirm today revenue, monthly revenue, expenses, profit, and GST payable cards load.

3. Open `Accounting -> Invoices & Payments`
Create an invoice with and without GST.
Create a partial-payment invoice and then add a later payment.
Cancel an invoice and confirm status changes to cancelled.

4. Open `Accounting -> Vendors / Assets / Periods`
Create a vendor.
Record an expense against that vendor.
Create a fixed asset and post monthly depreciation.
Lock the active financial period and confirm posting is blocked.

5. Open `Accounting -> Vouchers -> Payment Voucher`
Confirm these fields are visible:
`No. / Reference No`, `Date`, `Name of the account`, `Being Payment of`, `For the period`, `Received by`, `Authorized by`, `Received sign`, `Authorized sign`, `Amount`, `Payment mode`, and `Expense category / account head`.
Create a payment voucher and use `Print` from voucher list.
Confirm printed layout shows the same payment voucher fields.

6. Open `Accounting -> Cash & Bank Book`
Paste a CSV with `Date` and `Amount` columns into the reconciliation box.
Compare rows and verify matched/unmatched counts update.

7. Open `Accounting -> Reports`
Confirm the overview shows income, expense, profit, balance sheet, TDS snapshot, recent accounting activity, and recent journals.
Open the report tabs for vendors, assets, periods, invoices, payments, vouchers, salary, contracts, day book, cash entries, bank entries, trial balance, profit and loss, balance sheet, and TDS report.
Inside `TDS Report`, open the sub-tabs for computation, payables, outstanding, quarterly returns, certificates, 26AS/AIS reconciliation, mismatches, challans, payment register, corrections, audit trail, and tax audit Clause 34(a).
Export invoices, trial balance, profit and loss, vendor ledger, and at least one table-level CSV file.

8. Open `Accounting -> TDS Compliance -> Setup`
Click `Seed FY 2025-26 Sections` and confirm sections such as `194I`, `194-IB`, `194C`, `194J`, and `194B` are available.
Open `Deductions`, select each sports-complex use-case preset, and confirm the section/rate/threshold overrides populate before previewing.
At minimum, preview facility building rent, equipment rent, contract labour, professional services, and event prize money.

9. Open `Reports`
Confirm the sales report tabs include daily sales summary, item-wise sales, customer-wise sales, sales returns, gross profit, outstanding receivables, attendance, cash vs credit, user-wise sales, and tax summary.
Refresh a selected date range and export the active report as Excel and PDF.
