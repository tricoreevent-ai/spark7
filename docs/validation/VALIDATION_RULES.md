# Accounting Validation Rules

This module runs read-only accounting checks against existing MongoDB collections and writes only to the standalone `validation_reports` collection.

## Shared Assumptions

- Tenant filtering uses `validationConfig.tenant.field`, default `tenantId`.
- Soft-deleted ledger rows are ignored when the configured deleted flag is present.
- Monetary comparisons use `VALIDATION_TOLERANCE`, default `0.5`.
- Report period filters are inclusive.
- Drilldown data is stored in `rawDataSnapshots` only when `includeRawData` is enabled.

## Rules

### Double-entry Integrity

Logic:

- Read `accountledgerentries`.
- Group by `voucherType`, `voucherNumber`, and optional `metadata.sourceId`.
- Sum debit and credit.
- Fail if absolute difference is greater than tolerance.

Likely causes:

- Partial voucher posting.
- Missing opposite ledger line.
- One side deleted or reversed incorrectly.

### Trial Balance

Logic:

- Read ledger entries up to `periodEnd`.
- Group by `accountId`.
- Join `chartaccounts`.
- Debit balances are positive `debit - credit`; credit balances are absolute negative balances.
- Fail if total debit balances do not equal total credit balances.

Aggregation shape:

```js
[
  { $match: { entryDate: { $lte: periodEnd }, isDeleted: { $ne: true } } },
  { $group: { _id: "$accountId", debit: { $sum: "$debit" }, credit: { $sum: "$credit" } } },
  { $lookup: { from: "chartaccounts", localField: "_id", foreignField: "_id", as: "account" } }
]
```

### Balance Sheet Equation

Logic:

- Build ledger balances up to `periodEnd`.
- Assets use debit-normal balance.
- Liabilities use credit-normal balance.
- Equity includes equity/capital/opening-balance accounts plus net profit.
- Net profit is `income - expense`.
- Fail if `Assets != Liabilities + Equity`.

### TDS Reconciliation

Logic:

- Sum `tdstransactions.tdsAmount` up to `periodEnd`.
- Sum non-cancelled `tdschallans.amount` up to `periodEnd`.
- Compute outstanding as `deducted - deposited`.
- Compare computed outstanding with stored transaction outstanding and TDS payable ledger balance.

Suggested correction:

- Record/allocate pending challans.
- Verify TDS payable chart account mapping.

### GST Reconciliation

Logic:

- Detect GST ledgers by account name/system key/group name.
- Compute net GST payable from ledger entries.
- Check for generated/filed GSTR records.
- Warn when GST payable exists but no filed return is found.

### Vendor/Customer Reconciliation

Logic:

- Summarize supplier/customer ledger balances.
- Compare customer receivable ledger with open accounting invoice balances when available.
- Flag vendors without valid linked ledgers.

### Missing Sequences

Logic:

- Config-driven sequence checks for invoices, vouchers, journals, and payments.
- Parse trailing numbers from configured number fields.
- Group by prefix and detect missing numeric values.

### Period Locking

Logic:

- Read closed/locked financial periods.
- Detect ledger entries created or updated after `lockedAt` inside the closed period.
- If no lock timestamp exists, rows inside closed periods are still shown as control-risk samples.

### Orphan Records

Logic:

- Ledger entries referencing missing chart accounts.
- Journal lines referencing missing journals or accounts.
- Vendors referencing missing ledger accounts.

### Cash / Bank Book

Logic:

- Find chart accounts with subtype `cash` or `bank`.
- Compare computed closing balance with latest running balance.
- Count unmatched or partially matched bank-feed transactions.

### Depreciation Logic

Logic:

- Find active fixed assets acquired before `periodEnd`.
- Estimate straight-line depreciation using `cost / lifeYears`.
- Compare expected depreciation with `totalDepreciationPosted`.
- Check for depreciation journal entries in the period.

### Suspense Account Check

Logic:

- Detect suspense/clearing/temporary accounts by name/group/system key.
- Fail when non-zero balances remain beyond tolerance.

### Round-off Errors

Logic:

- Reuse voucher-level debit/credit grouping.
- Flag differences greater than `0.01` and less than or equal to configured round-off tolerance.

