@echo off
setlocal

cd /d "%~dp0"

echo.
echo Sarva Accounting Transaction Reset
echo ==================================
echo This runs a FULL accounting reset for transaction data.
echo It clears transaction records, resets derived balances and stock-style fields,
echo and resets opening balances for ledgers, customers, vendors, treasury accounts,
echo and opening balance setup state.
echo Master/setup data is preserved: users, chart accounts, vendors, customers,
echo products, categories, employees, facilities, stock locations, tax sections,
echo financial periods, settings.
echo.
echo A backup is strongly recommended before continuing.
echo To preview counts without deleting, run:
echo   clear-accounting-transactions.bat --dry-run
echo.

set /p TENANT_ID=Tenant ID to clear (leave blank for ALL tenants): 

set EXTRA_ARGS=--full-reset %*
if not "%TENANT_ID%"=="" set EXTRA_ARGS=%EXTRA_ARGS% --tenant=%TENANT_ID%

echo.
echo The next prompt must be typed exactly:
echo CLEAR ACCOUNTING TRANSACTIONS
echo.

node scripts\clear-accounting-transactions.cjs %EXTRA_ARGS%

echo.
if errorlevel 1 (
  echo Reset utility failed.
) else (
  echo Reset utility finished.
)
pause
