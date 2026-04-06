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

1. Open `Accounting -> MIS Dashboard`
Confirm today revenue, monthly revenue, expenses, profit, and GST payable cards load.

2. Open `Accounting -> Invoices & Payments`
Create an invoice with and without GST.
Create a partial-payment invoice and then add a later payment.
Cancel an invoice and confirm status changes to cancelled.

3. Open `Accounting -> Vendors / Assets / Periods`
Create a vendor.
Record an expense against that vendor.
Create a fixed asset and post monthly depreciation.
Lock the active financial period and confirm posting is blocked.

4. Open `Accounting -> Cash & Bank Book`
Paste a CSV with `Date` and `Amount` columns into the reconciliation box.
Compare rows and verify matched/unmatched counts update.

5. Open `Accounting -> Financial Reports`
Export invoices, trial balance, profit and loss, and vendor ledger CSV files.
