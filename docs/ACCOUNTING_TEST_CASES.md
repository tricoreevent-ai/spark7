# Accounting Test Cases

This document is the working accounting test matrix for Sarva. It combines:

- executable rule-level checks that can run locally with `npm run test:accounting`
- manual and UAT scenarios for the accounting console, reports, validation, and settlements

## Safe Execution Notes

- Run data-writing scenarios only on a backed-up test tenant.
- Preview destructive reset actions first with `clear-accounting-transactions.bat --dry-run`.
- The reset utility now also removes fixed assets and opening-balance setup rows during full reset, so reseed those before running asset or opening-balance UAT cases.
- If you use `npm run seed:test-transactions`, treat it as test-tenant-only because it resets and reseeds accounting-facing data.
- Use `npm run seed:accounting-uat` when you want a purpose-built accounting UAT tenant for report-page verification.
- Capture evidence for each scenario with screenshots, exported reports, and record IDs where possible.

## Seeded UAT Tenant For Accounting Report Pages

Run:

```bash
npm run seed:accounting-uat
```

Default seeded tenant:

- Tenant slug: `sarva-accounting-uat`
- Login email: `accounting.uat.20260420@example.com`
- Password: `Sarva@12345`
- Manifest file: `backups/accounting-uat-seed-manifest-sarva-accounting-uat.json`

Recommended seeded periods for page verification:

- `April 2026`: main healthy report month for MIS, invoices, vouchers, salary, day book, cash book, bank book, trial balance, profit and loss, and balance sheet
- `May 2026`: dashboard net-expense check for vendor-credit-style adjustment (`ACC-MIS-03`)
- `June 2026`: GST-heavy month for outward-tax and GST report verification
- `July 2026`: contract-expense month useful for month-to-date revenue reset checks
- `August 2026`: TDS report month with deductions and challan coverage
- `October 2026`: missing-sequence validation month
- `November 2026`: locked-period validation month
- `December 2026`: unbalanced-entry validation month

## Automated Checks In Repo

Run:

```bash
npm run test:accounting
```

Current automated coverage maps to these scenario areas:

- `ACC-INV-01`, `ACC-INV-02`: invoice posting plans for cash, credit, and partial-payment invoices
- `ACC-INV-03`: expense or vendor bill posting plans including payable creation and later settlement
- `ACC-GST-01`, `ACC-GST-03`: GST breakup and GST reversal behavior
- `ACC-SET-01`: receivable settlement posting plan
- `ACC-ASS-01`: depreciation calculation logic
- `ACC-BB-01`, `ACC-BB-02`: bank reconciliation matching and mismatch handling
- `ACC-PL-01`: report-level profit and loss rollup math
- `ACC-BS-01`: balance sheet section totals and difference math
- `ACC-PER-01`, `ACC-TB-01`, `ACC-VAL-02`: period key and double-entry validation behavior

## Recommended Execution Order

1. Set up masters and opening balances.
2. Post operational accounting transactions.
3. Run GST and TDS workflows.
4. Verify reports, ledgers, and validation checks.
5. Complete settlements and day-end closure checks.

## Complete Functional And Report UAT Matrix

### A. MIS Dashboard

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-MIS-01` | Verify dashboard revenue and expense figures match posted transactions for the current month. | At least 3 invoices totalling Rs50,000 and 2 vendor bills totalling Rs12,000 are posted in the current month. | Open dashboard for current month. | Selected Revenue = Rs50,000, Expenses = Rs12,000, Profit = Rs38,000, GST Payable = output GST minus input credit. | Profit and Loss for same period shows identical revenue and expense totals. | Compare dashboard with P&L and run Validation Dashboard; expect 0 critical findings. |
| `ACC-MIS-02` | Verify month-to-date revenue resets correctly in a new month. | Previous month revenue = Rs60,000; current month revenue so far = Rs15,000. | Open dashboard with end date = current date mid-month. | MTD Revenue = Rs15,000, not Rs75,000. Selected Revenue for current month = Rs15,000. | No direct report impact because MTD is dashboard-only. | Move system date to first day of next month; MTD should stay Rs0 until new transactions are posted. |
| `ACC-MIS-03` | Verify dashboard profit handles vendor credit notes correctly. | Expense entry Rs5,000 posted, then vendor credit note Rs2,000 posted in same period. | Open dashboard for period covering both rows. | Expenses = Rs3,000 and Profit = Revenue - Rs3,000. | Expense report and P&L reflect net expense of Rs3,000. | Check vendor ledger reduction and run validation to confirm expense balances remain consistent. |

### B. Invoices And Payments

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-INV-01` | Create a credit sales invoice with partial payment. | Customer `Sunrise Sports School` exists and revenue account `Court Rental` exists. | Date `2026-04-01`, Base `12000`, GST `18%`, Initial Payment `5000`, Payment Mode `Bank Transfer`. | Invoice total = Rs14,160, Paid = Rs5,000, Outstanding = Rs9,160, Status = `Partially Paid`. | Outstanding Receivables shows Rs9,160 and customer-wise sales includes the invoice. | Query invoice API and open Outstanding Receivables report. |
| `ACC-INV-02` | Create an unpaid invoice and clear it with a later payment. | Customer `Walk-in Customer` exists and product `Shuttle tube` exists. | Date `2026-04-05`, Base `2500`, GST `5%`, Initial Payment `0`, Payment Method `Cash`. | Invoice total = Rs2,625, Paid = Rs0, Outstanding = Rs2,625, Status = `Unpaid`. | Outstanding Receivables includes the invoice and Cash vs Credit shows it as credit until settled. | Add later payment of Rs2,625 and confirm outstanding becomes 0 and status changes to `Paid`. |
| `ACC-INV-03` | Create a vendor bill with partial payment and due date. | Vendor `Bright Power Services` exists and expense account `Repairs` exists. | Date `2026-04-10`, Amount `4500`, Paid `2000`, Payment Mode `Bank`, Due Date `2026-05-10`. | Bill total = Rs4,500, Paid = Rs2,000, Outstanding Payable = Rs2,500. | Expense report includes Rs4,500 and Vendor Balance shows Rs2,500 outstanding. | Check vendor aging; row should appear in 0-30 day bucket. |

### B1. POS Sales Invoice Screen And Field Coverage

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-POS-01` | Post a normal linked-customer GST sale from the live Sales Invoice screen. | Customer `Anjali Nair` exists with phone `9847001122`; products `Yonex Mavis 350 Shuttle` and `Badminton Grip` exist; GST billing is enabled. | Leave `Walk-in Customer` off, enter `Customer Phone 9847001122`, confirm `Customer Name`, add 2 products, `Discount Mode Amount`, `Discount 100`, `Payment Method UPI`, `Invoice Type Paid Now`, `Save Mode Finalise Invoice`, `Tax Mode GST Bill`. | Invoice posts successfully, auto invoice number is generated, stock reduces for sold items, and the final button amount matches saved total. | Daily Sales Summary, Item-wise Sales, Customer-wise Sales, Payment Reconciliation, GST reports, and stock movement all reflect the invoice. | Complete the bill on `/sales`, then verify the invoice in orders/history and in sales reports for the same date. |
| `ACC-POS-02` | Verify Walk-in mode allows billing without customer phone and disables customer-linked features. | At least one saleable product exists and no customer needs to be selected. | Turn `Walk-in Customer` on, leave customer phone blank, add 1 item, choose `Cash`, keep `Paid Now`, and try to use `Store Credit`. | Sale can be saved without phone lookup, but store credit and CRM-linked fields remain unavailable while Walk-in mode is active. | Sale value reaches sales reports, but there is no linked customer receivable or customer credit usage against a named profile. | Save the sale and confirm the UI blocked store credit while still allowing checkout. |
| `ACC-POS-03` | Block linked-customer billing when customer phone is missing or invalid. | Walk-in mode is off and at least one item is added. | Keep `Walk-in Customer` off, leave `Customer Phone` blank or enter fewer than 10 digits, then click the final invoice button. | Screen blocks checkout and shows the customer-phone validation warning. No invoice is saved. | No report or stock change happens because the invoice never posts. | Attempt checkout from `/sales` and confirm no new invoice appears in history. |
| `ACC-POS-04` | Require a manual invoice number when invoice numbering is switched to Manual. | At least one item is added and customer data is otherwise valid. | Set `Invoice No.` to `Manual`, leave `Manual Invoice Number` blank, then try to save; after that, enter `MAN-APR-001` and save again. | First attempt is blocked by validation. Second attempt succeeds and stores `MAN-APR-001` as the invoice number reference. | Posted invoice uses the manual number in registers, print output, and audit review. | Verify save block on first attempt and invoice number on the successful second attempt. |
| `ACC-POS-05` | Verify `Non-GST Bill` removes GST from totals and tax-facing output. | Product exists with standard GST setup. | Add taxable item, switch quick GST toggle or `Tax Mode` to `Non-GST Bill`, then finalise the invoice. | GST value becomes Rs0 on the live bill and the final invoice is saved without GST billing treatment. | Sales value appears in sales reports, but GST-facing totals should not include output tax for this invoice. | Compare the live totals before and after the toggle, then verify GST summary/report impact. |
| `ACC-POS-06` | Apply store credit to a linked paid-now invoice. | Customer has an open credit note with available balance, e.g. `CN-APR-02` balance Rs500; Walk-in is off; Invoice Type is `Paid Now`. | Select customer, open `Store Credit`, choose `Credit Note CN-APR-02`, enter `Apply Amount 300`, click `Apply Credit`, then finalise the invoice. | Net collectible amount drops by Rs300, bill summary shows store credit applied, and the final button text reflects the reduced amount. | Sales totals remain based on the billed sale, while customer credit balance reduces and settlement/credit-note usage history updates. | Verify pre-credit and post-credit amounts on-screen, then confirm the used amount against the customer credit balance after save. |
| `ACC-POS-07` | Verify `Pay Later` disables store credit and keeps outstanding balance accurate with partial collection. | Customer exists; at least one item is added; credit note exists for the same customer. | Set `Invoice Type` to `Pay Later`, observe `Store Credit`, enter `Paid Amount 3000` in `Credit Settlement`, then finalise. | Store credit stays disabled, invoice posts as receivable, and `Outstanding` equals invoice total minus Rs3,000 collected now. | Outstanding Receivables, customer balance, and cash-vs-credit style reporting reflect the unpaid portion correctly. | Finalise the invoice and compare saved outstanding amount with receivables/report views. |
| `ACC-POS-08` | Verify split payment and cash change-due logic. | Product exists and total invoice value is known, e.g. Rs2,500. | Select `Payment Method Cash`, add 2 splits: `Cash Amount 1000` with `Cash Received 1200`, and `UPI Amount 1500`. | Split totals add up to the collection amount and `Change Due` shows Rs200 for the cash split. | Payment-mode summaries and reconciliation views should reflect the mixed-mode collection accurately. | Review the live split-payment panel, finalise the invoice, and compare saved collection mode mix in payment reports. |
| `ACC-POS-09` | Enforce row-level stock-control fields for batch, expiry, and serial-tracked items. | Product A requires batch and expiry; Product B is serial-tracked. | Add Product A and leave `Batch No` or `Expiry Date` blank; add Product B, turn `Serial Tracking` on, leave serial list incomplete, and try to finalise. | Screen blocks checkout until required batch, expiry, and serial details are completed for the relevant rows. | No stock movement or invoice posting happens until the validation errors are cleared. | Attempt final save, confirm row-level validation, then complete the missing values and save successfully. |
| `ACC-POS-10` | Confirm `Save as Draft`, `Hold`, and `Recall` do not create final report impact until the sale is finalized. | At least one item is added. | Save one sale as draft, hold another sale, then reopen through `Recall` and finalise only one of them. | Draft and held records are recoverable from recall, but only the finalised invoice becomes a posted sale. | Final sales, stock, GST, and receivable reports change only for the invoice that is eventually finalised. | Use the live Sales screen, reopen both records, and compare report impact before and after finalisation. |

### C. Vendors, Assets, And Periods

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-VEN-01` | Create a vendor master with GSTIN and PAN. | No duplicate vendor exists. | Name `Kochi Electricals`, GSTIN `32AAAAA1234A1Z`, PAN `AAAAA1234A`, Contact `Rajesh`, Phone `9847012345`. | Vendor saves and appears in vendor list. | Vendor Balance starts at Rs0 and vendor becomes selectable in expense entry. | Search vendor master by name. |
| `ACC-ASS-01` | Create a fixed asset and post one month depreciation. | Asset category `Equipment` exists. | Asset `Court 3 LED Floodlight`, Cost `25000`, Depreciation Rate `15% p.a.`, Capitalisation Date `2026-04-01`. | Asset saves and monthly depreciation for April = Rs312.50. | Asset Book Value report shows Cost Rs25,000, Accumulated Depreciation Rs312.50, WDV Rs24,687.50. | Run depreciation posting and confirm journal entry was created. |
| `ACC-PER-01` | Lock a financial period and block posting inside it. | Financial period `April 2026` exists and is then locked. | Attempt invoice dated `2026-04-15`. | System rejects posting with `Period is locked - cannot post`. | No report impact. | Validation Dashboard should flag closed-period attempt if any draft residue is stored. |

### D. Salary And Contract

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-SAL-01` | Record salary payment with PF and ESI deductions. | Employee `Nikhil Raj` exists with monthly salary Rs22,000 and PF applicable. | Month `2026-04`, Pay Date `2026-04-30`, Gross `22000`, PF `1200`, ESI `440`, Bonus `0`. | Net Pay = Rs20,360 and salary payment saves. | Salary report shows Gross Rs22,000, Deductions Rs1,640, Net Rs20,360; Expense report includes Rs22,000. | Check employee ledger and statutory liability postings. |
| `ACC-SAL-02` | Record a contractor payment with TDS deduction. | Contractor `Suresh Tennis Coach` exists and TDS section `194J` is available. | Contract `April coaching`, Payment Date `2026-04-15`, Amount `50000`, TDS `5000`, Net `45000`. | TDS deducted Rs5,000 recorded and contract payment saves. | TDS report shows Rs5,000 deducted and payable; Contract expense report shows Rs50,000. | Run TDS Payables report and confirm challan outstanding includes Rs5,000. |
| `ACC-SAL-03` | Generate salary arrears for retrospective revision. | Employee `Priya` revised from Rs25,000 to Rs28,000 effective `2026-02-01`. | Arrears month `2026-04` for Feb and Mar difference Rs6,000. | Arrears entry created and payable increases by Rs6,000 before tax adjustments. | Payroll compliance and Form 16 worksheet include arrears. | Open Payroll Arrears section and confirm entry is listed. |

### E. Opening Balances

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-OPN-01` | Set opening cash and bank for a new financial year. | New financial year with no prior entries. | Cash `25000` debit, Bank `180000` debit, Date `2026-04-01`. | Opening balances save and ledger accounts show opening values. | Trial Balance, Cash Book, and Bank Book start with these figures. | Run Trial Balance as of `2026-04-01`. |
| `ACC-OPN-02` | Set customer opening receivable. | Customer `Sunrise Sports School` exists. | Customer `Sunrise`, Amount `15000` debit, As of `2026-04-01`. | Opening balance saves and customer ledger shows Rs15,000 receivable. | Outstanding Receivables includes Rs15,000. | Check customer ledger opening balance. |
| `ACC-OPN-03` | Set supplier opening payable. | Vendor `Bright Power Services` exists. | Vendor `Bright Power`, Amount `7000` credit, As of `2026-04-01`. | Opening balance saves and vendor ledger shows Rs7,000 payable. | Vendor Balance report includes Rs7,000 credit outstanding. | Check vendor ledger opening balance. |

### F. Expenses And Income

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-DAY-01` | Record a petty-cash expense in day book. | Petty cash account and `Office Expenses` category exist. | Date `2026-04-03`, Type `Expense`, Category `Office Supplies`, Amount `850`, Payment Method `Cash`, Reference `PB-001`. | Day-book entry saves and cash reduces by Rs850. | Cash Book shows outflow Rs850 and Expense report includes Rs850. | Run Day Book and confirm entry `PB-001`. |
| `ACC-DAY-02` | Record bank income with GST. | Bank account exists and income category `Sponsorship` exists. | Date `2026-04-07`, Type `Income`, Category `Sponsorship`, Amount `25000`, GST `18%`, Payment Method `Bank Transfer`, Reference `SP-APR-01`. | Income entry saves and GST component Rs4,500 is recorded separately. | Bank Book shows inflow Rs29,500, Income report shows Rs25,000, GST report shows output tax Rs4,500. | Check GST summary increase of Rs4,500. |
| `ACC-DAY-03` | Block edits to a reconciled day-book entry. | Expense entry Rs2,000 dated `2026-04-01` is already reconciled on `2026-04-10`. | Attempt to edit amount from `2000` to `2500`. | System blocks save with `Cannot edit reconciled transaction`. | No report impact. | Validation should only flag this if a bypass ever modifies a reconciled row. |

### G. Vouchers

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-VCH-01` | Create a receipt voucher for non-sales income. | Customer `Amit Sharma` exists and cash account exists. | Date `2026-04-12`, Amount `1200`, Payment Mode `Cash`, Counterparty `Amit Sharma`, Reference `RCPT-001`, Account `Other Income`. | Receipt voucher saves and cash increases by Rs1,200. | Cash Book shows inflow and Income report includes Rs1,200 under Other Income. | Print voucher preview and confirm all fields render correctly. |
| `ACC-VCH-02` | Create a payment voucher for one-time vendor service. | Vendor `CleanPro Services` exists and bank account exists. | Date `2026-04-15`, Amount `3500`, Payment Mode `Bank Transfer`, Account `Cleaning Expense`, Reference `PV-0415`, Received By `Ramesh`. | Payment voucher saves and bank decreases by Rs3,500. | Bank Book shows outflow and Expense report includes Rs3,500 under Cleaning. | Confirm unreconciled bank row appears for later reconciliation. |
| `ACC-VCH-03` | Create a journal voucher for expense reclassification. | `Repairs` has Dr Rs5,000 and `Maintenance` has Dr Rs2,000. | Date `2026-04-18`, Debit `Maintenance 1500`, Credit `Repairs 1500`, Reference `JV-CORR-01`. | Journal saves and Repairs becomes Rs3,500 Dr while Maintenance becomes Rs3,500 Dr. | Trial Balance and Ledger reflect updated balances. | Run Validation Dashboard and confirm double-entry integrity passes. |

### H. Cash And Bank Book

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-CB-01` | Verify cash book opening, inflows, outflows, and closing. | Opening cash Rs25,000, cash sales Rs10,000, cash expenses Rs3,200, cash receipts Rs2,500. | Open Cash Book for current month. | Opening = Rs25,000, Inflows = Rs12,500, Outflows = Rs3,200, Closing = Rs34,300. | Day-end expected cash should match Rs34,300. | Recalculate manually and compare. |
| `ACC-BB-01` | Reconcile a bank CSV row that matches exactly. | Bank ledger contains `2026-04-01`, UPI receipt Rs2,000, unreconciled. | Paste CSV row `2026-04-01,2000,UPI receipt from Anjali` and click `Compare CSV`. | Row shows `Matched`. | After `Compare And Mark Matched`, pending reconciliation count decreases by 1. | Run Bank Reconciliation report and confirm item is removed from pending list. |
| `ACC-BB-02` | Reconcile a CSV row with amount mismatch. | Ledger contains UPI receipt Rs1,800 dated `2026-04-02`. | Paste CSV row `2026-04-02,2000,UPI` and compare. | System shows `Mismatch - amount difference` and suggests review. | Entry remains unreconciled and discrepancy appears in reconciliation review. | Open mismatch row and confirm user must investigate or correct ledger. |

### I. Treasury And Banks

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-BNK-01` | Create a new bank account master. | No duplicate account number exists. | Bank `HDFC`, Account Name `Operations Current`, Account No `50100123456789`, IFSC `HDFC0001234`, Opening Balance `200000` debit. | Bank account saves and appears in bank book and transfer screens. | Balance Sheet shows the new bank under current assets. | Open Bank Book and confirm opening balance. |
| `ACC-BNK-02` | Transfer cash to bank. | Cash balance Rs50,000 and bank balance Rs1,80,000. | Amount `15000`, Direction `Cash to Bank`, Date `2026-04-20`, Reference `DEP-001`. | Cash decreases by Rs15,000 and bank increases by Rs15,000. | Cash Book outflow and Bank Book inflow both appear; Trial Balance remains balanced. | Check both ledgers and confirm final balances. |
| `ACC-BNK-03` | Issue cheque and clear it later. | Cheque book is configured and vendor `Ace Sports` has bill Rs22,000. | Cheque No `123456`, Date `2026-04-22`, Payee `Ace Sports`, Amount `22000`, Account `HDFC Current`. | Cheque saves with status `Issued`. | Bank book shows outstanding cheque until clearance; after clearing, bank reduces and status becomes `Cleared`. | Run Cheque Status report and confirm lifecycle. |

### J. Chart And Ledger

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-CHA-01` | Create a new income account. | Parent group `Direct Income` exists. | Account Name `Tournament Entry Fees`, Group `Direct Income`, Nature `Credit`, GST applicable `Yes 18%`. | Account is added to chart of accounts. | Account becomes selectable in invoices and day-book income entries. | Open Chart of Accounts and confirm placement under Direct Income. |
| `ACC-LED-01` | Drill down into a revenue ledger. | `Court Rental` account has 5 April invoices totalling Rs60,000. | Open Ledger for `Court Rental` from `2026-04-01` to `2026-04-30`. | Ledger lists each invoice with date, reference, debit or credit, and running balance. | Total credit = Rs60,000. | Click any invoice line and confirm original invoice opens. |
| `ACC-LED-02` | Filter ledger by customer. | Customer `Sunrise Sports School` has 2 invoices and 1 payment. | Open Ledger with customer filter `Sunrise` for April. | Ledger shows opening balance, invoices, payment credits, and closing balance. | Closing balance matches Outstanding Receivables. | Compare closing balance with receivables report. |

### K. GST And Filing

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-GST-01` | Generate GSTR-1 and verify totals. | For April 2026, B2B invoices = Rs1,20,000 plus GST Rs21,600 and B2C invoices = Rs50,000 plus GST Rs9,000. | Open GST Filing for April 2026 and click `Prepare GSTR-1`. | System shows B2B and B2C tables with correct rates, taxable value, and tax amount. | Total taxable value = Rs1,70,000 and total GST = Rs30,600. | Export JSON and compare with source invoices. |
| `ACC-GST-02` | Reconcile GST liability between books and GSTR-3B. | Books show output GST Rs50,000, input GST Rs12,000, net payable Rs38,000. | Run GST reconciliation tool. | Difference = 0 when books and filing data match, otherwise discrepancy is flagged. | Reconciliation report lists mismatched invoices if any. | Run Validation Dashboard and confirm GST reconciliation passes. |
| `ACC-GST-03` | Post a sales credit note and confirm GST liability reduction. | Original invoice includes GST Rs1,800 and credit note is issued on `2026-04-25`. | Open April GST filing after posting credit note. | GSTR-1 includes credit note row and net output GST reduces by Rs1,800. | Dashboard GST Payable decreases accordingly. | Check GSTR-1 credit and debit note section. |

### L. TDS Compliance

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-TDS-01` | Deduct TDS on sports facility rent using preset 194I at 2 percent. | Vendor `Elite Sports Equipment` has valid PAN and monthly bill Rs80,000. | Use Case `Sports facility rent - equipment`, Bill Amount `80000`, Date `2026-04-10`. | TDS = Rs1,600 and net payment = Rs78,400. | TDS report shows Rs1,600 under section 194I. | Run TDS Payables report and confirm Rs1,600 outstanding. |
| `ACC-TDS-02` | Apply higher TDS rate when PAN is invalid. | Vendor `NoPAN Traders` has missing or invalid PAN. | Use Case `Contract labour - Company/Firm`, bill amount `100000`. | System overrides to 20 percent TDS = Rs20,000. | TDS report shows higher-rate deduction flagged for invalid PAN. | Validation Dashboard should raise TDS compliance warning. |
| `ACC-TDS-03` | Generate Form 281 challan for quarterly deposit. | Q1 TDS deductions total Rs45,000. | Open TDS Challan for Q1 and generate challan. | Challan shows amount Rs45,000 with section-wise breakup. | TDS Payables becomes 0 after deposit is recorded. | Mark challan as deposited and confirm outstanding reduces. |

### M. Accounting Reports

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-TB-01` | Verify Trial Balance totals match after monthly activity. | Post 5 invoices, 3 expenses, 2 payments, and 1 journal in April. | Run Trial Balance as of `2026-04-30`. | Total Debits = Total Credits. | Balance Sheet difference = 0. | Validation Dashboard Trial Balance check passes. |
| `ACC-PL-01` | Verify P&L includes all income and expense types and matches dashboard. | Income: Sales Rs1,00,000, Sponsorship Rs25,000. Expenses: Salary Rs45,000, Repairs Rs8,000, Depreciation Rs2,000. | Run P&L for April. | Total Income = Rs1,25,000, Total Expense = Rs55,000, Net Profit = Rs70,000. | MIS Dashboard should show same totals for same date range. | Compare P&L and MIS, then run validation. |
| `ACC-BS-01` | Verify Balance Sheet equation. | Assets: Cash Rs42,000, AR Rs15,000, Equipment Rs25,000, Depreciation Rs2,000; Liabilities Rs5,000; Equity Rs75,000. | Run Balance Sheet as of `2026-04-30`. | Assets = Liabilities + Equity and Difference = 0. | Diagnostic difference row stays 0. | Validation Dashboard Balance Sheet check passes. |

### M1. Accounting Report Page Verification Pack (Seeded UAT Tenant)

Use the seeded tenant from `npm run seed:accounting-uat` and verify the exact report tabs exposed in `Accounting -> Reports`.

| Report Tab | Seeded Period | Key Seed References | What To Verify |
| --- | --- | --- | --- |
| `Overview` | `April 2026` | `AINV-UAT-INV01`, `AINV-UAT-INV02`, `PB-001`, `SP-APR-01`, `SP-UAT-01` | Summary cards load, recent activity is populated, and the overview totals stay consistent with `Profit & Loss`, `Balance Sheet`, and `TDS` for the same range. |
| `Vendors` | `April 2026` | `Bright Power Services`, `Kochi Electricals` | Vendor master rows render with PAN/GSTIN, opening balance, total payable, paid amount, and balance. |
| `Assets` | `April 2026` | `Court 3 LED Floodlight` | Cost, life years, and depreciation posted are visible and match `ACC-ASS-01`. |
| `Periods` | `2026` | `2026-11` locked period | Open and locked period status render correctly and the locked November row is visible. |
| `Invoices` | `April 2026` | `AINV-UAT-INV01`, `AINV-UAT-INV02` | Invoice totals, paid amount, balance amount, type, and status align with seeded accounting invoices. |
| `Payments` | `April 2026` | salary payment `SP-UAT-01` | Payment history loads with posted payment rows and expected amounts or statuses. |
| `Vouchers` | `April 2026` | `UAT-RV-001`, `UAT-PV-001`, `UAT-JV-001`, `UAT-TV-001` | Receipt, payment, journal, and transfer vouchers all appear with correct mode, amount, reference, and notes. |
| `Salary` | `April 2026` | `SP-UAT-01`, arrears for `Priya` | Gross, statutory deductions, net pay, and payroll cost are visible for the seeded salary row. |
| `Contracts` | `July 2026` | `CP-UAT-01` | Contract payment row appears with gross amount `50000`, method, and status `PAID`. |
| `Day Book` | `April 2026` | `PB-001`, `SP-APR-01`, `UAT-DAY-RECON-01` | Expense and income day-book rows appear with correct category, payment method, and reference numbers. |
| `Cash Entries` | `April 2026` | `UAT-RV-001`, `PB-001`, `UAT-TV-001` | Cash opening, inflows, outflows, and closing align with cash-side seeded activity. |
| `Bank Entries` | `April 2026` | `AINV-UAT-INV01`, `SP-APR-01`, `UAT-PV-001`, `UAT-TV-001`, `UAT-STMT-RCPT-01` | Bank-side inflows and outflows load correctly, including partial invoice receipt, sponsorship income, voucher payment, transfer, and reconciliation seed rows. |
| `Trial Balance` | `April 2026` | April report pack | Total debits equal total credits, balance difference is zero or explained only by diagnostic rows, and report export works. |
| `Profit & Loss` | `April 2026` | April report pack | Income and expense rows populate, net profit matches overview cards, and the formula help matches the visible totals. |
| `Balance Sheet` | `As on 2026-04-30` | April report pack plus opening balances | Assets, liabilities, equity, retained earnings, and difference render correctly with any diagnostic rows explained. |
| `TDS Report` | `August 2026` | `TDS-UAT-194I-01`, `TDS-UAT-NOPAN-01`, `UAT281Q1` | Summary cards, payables, outstanding, challans, and mismatch-related tabs load with seeded TDS activity. |

### N. Validation Dashboard

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-VAL-01` | Run validation on a healthy dataset. | No unbalanced entries, no sequence gaps, and periods configured correctly. | Open Validation Dashboard for April 2026 and click `Run Full Validation Now`. | Critical = 0, Warning = 0, Passed = expected rule count, Health Score = 100. | Validation report saves and can be exported. | Confirm command center log ends with successful completion message. |
| `ACC-VAL-02` | Detect double-entry failure. | Create journal with debit Rs5,000 and credit Rs4,000. | Run validation for that period. | Double-entry integrity check fails as critical and health score drops. | Drill-down pinpoints journal ID and mismatch amount. | Open `Why?` panel and confirm suggested fix references missing credit line. |
| `ACC-VAL-03` | Detect missing invoice sequence. | Invoice numbers include `INV-001`, `INV-002`, `INV-004`. | Run validation with sequence check enabled. | Missing sequence check returns warning and shows missing `INV-003`. | Exported validation report includes the gap. | Export results to Excel and verify warning row. |

### O. Settlements

| Test Case ID | Purpose | Pre-conditions | Input Data | Expected Immediate Result | Expected Report Impact | Verification Method |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-SET-01` | Record settlement receipt against a specific invoice. | Customer `Sunrise` has invoice `INV-101` with outstanding Rs9,160. | Select customer `Sunrise`, amount `9160`, allocate to `INV-101`, mode `Bank Transfer`, date `2026-04-25`. | Receipt saves, payment links to invoice, and invoice outstanding becomes 0. | Outstanding Receivables removes Sunrise and Daily Collection includes Rs9,160. | Check customer ledger for linked payment entry. |
| `ACC-SET-02` | Perform day-end closing with cash shortage. | Opening cash Rs12,000, cash sales Rs25,000, cash expenses Rs8,500, expected closing Rs28,500. | Enter physical closing cash `28200`. | Variance = `-300` shortage. | Day-end report saves shortage for manager review. | Confirm manager daily summary shows shortage. |
| `ACC-SET-03` | Perform day-end closing with cash overage. | Same setup as previous scenario but physical count = Rs28,800. | Enter physical closing cash `28800`. | Variance = `+300` overage. | Report shows overage and optional follow-up to book unresolved amount as miscellaneous income. | Next day's opening cash should use actual physical Rs28,800, not expected closing Rs28,500. |

## Evidence Checklist

- Dashboard screenshots with date range visible
- Source transaction IDs or voucher numbers
- Ledger drill-down screenshots
- Exported CSV or PDF copies for GST, TDS, Trial Balance, P&L, Balance Sheet, and Validation
- Validation report ID and drill-down screenshots for failed scenarios
