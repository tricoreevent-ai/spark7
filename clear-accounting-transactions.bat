@echo off
setlocal

cd /d "%~dp0"

echo.
echo Sarva Sales + Accounting Data Reset
echo ===================================
echo This runs a FULL reset for sales, accounting, inventory transaction, and report data.
echo It clears transaction records, report output rows, audit/version logs, sequence counters,
echo fixed asset rows, generated report/export folders, and local log files.
echo It also deletes product catalog rows so billing can be tested from a fresh state.
echo Master/setup data is preserved: users, chart accounts, vendors, customers,
echo categories, employees, facilities, stock locations, tax sections,
echo financial periods, payment routing, and settings.
echo.
echo A backup is strongly recommended before continuing.
echo To preview counts without deleting, run:
echo   clear-accounting-transactions.bat --dry-run
echo.

set /p TENANT_ID=Tenant ID to clear (leave blank for ALL tenants): 

set EXTRA_ARGS=--full-reset %*
if not "%TENANT_ID%"=="" set EXTRA_ARGS=%EXTRA_ARGS% --tenant=%TENANT_ID%

echo.
if "%EXTRA_ARGS:--dry-run=%"=="%EXTRA_ARGS%" (
  choice /C YN /N /M "Delete sales/accounting data now? [Y/N]: "
  if errorlevel 2 (
    echo Cancelled. No data was deleted.
    echo.
    pause
    exit /b 0
  )
  set EXTRA_ARGS=%EXTRA_ARGS% --yes
)

node scripts\clear-accounting-transactions.cjs %EXTRA_ARGS%

echo.
if errorlevel 1 (
  echo Reset utility failed.
) else (
  echo Reset utility finished.
)
pause
