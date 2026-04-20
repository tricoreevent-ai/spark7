@echo off
setlocal

cd /d "%~dp0"

echo.
echo Sarva Accounting Transaction Reset
echo ==================================
echo This clears accounting-facing TRANSACTION and derived stock/payroll data only.
echo Master/setup data is preserved: users, chart accounts, vendors, customers,
echo products, categories, employees, facilities, stock locations, tax sections,
echo financial periods, settings.
echo.
echo A backup is strongly recommended before continuing.
echo To preview counts without deleting, run:
echo   node scripts\clear-accounting-transactions.cjs --dry-run
echo.

set /p TENANT_ID=Tenant ID to clear (leave blank for ALL tenants): 
set /p RESET_DERIVED=Reset derived balances on customers/vendors/products too? Type YES or leave blank: 
set /p RESET_OPENING=Reset chart/vendor opening balances too? Type YES or leave blank: 

set EXTRA_ARGS=
if not "%TENANT_ID%"=="" set EXTRA_ARGS=%EXTRA_ARGS% --tenant=%TENANT_ID%
if /I "%RESET_DERIVED%"=="YES" set EXTRA_ARGS=%EXTRA_ARGS% --reset-derived-balances
if /I "%RESET_OPENING%"=="YES" set EXTRA_ARGS=%EXTRA_ARGS% --reset-opening-balances

echo.
echo The next prompt must be typed exactly:
echo CLEAR ACCOUNTING TRANSACTIONS
echo.

node scripts\clear-accounting-transactions.cjs %EXTRA_ARGS%

echo.
pause
