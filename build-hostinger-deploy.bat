@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "OUTPUT_ROOT=%~1"
if "%OUTPUT_ROOT%"=="" set "OUTPUT_ROOT=production-ready-hostinger"
set "BACKEND_API_BASE_URL=https://api.spark7.in"
set "FRONTEND_ORIGIN=https://www.spark7.in,https://spark7.in"
set "ROOT=%~dp0"

echo Building SPARK AI Hostinger deployment package...
call "%ROOT%build-separate-deploy.bat" "%OUTPUT_ROOT%" "%BACKEND_API_BASE_URL%" "%FRONTEND_ORIGIN%"
if errorlevel 1 exit /b 1

if exist "%ROOT%.env.hostinger" (
  copy /Y "%ROOT%.env.hostinger" "%ROOT%%OUTPUT_ROOT%\server\.env" >nul
  echo Copied private Hostinger server env into package.
) else (
  echo Note: .env.hostinger not found. Add it before uploading to Hostinger.
)

if exist "%ROOT%.env.client.hostinger" (
  copy /Y "%ROOT%.env.client.hostinger" "%ROOT%%OUTPUT_ROOT%\client\.env.client" >nul
  echo Copied Hostinger client env reference into package.
) else (
  echo Note: .env.client.hostinger not found. Client build still uses baked-in Hostinger API URL.
)

echo.
echo Hostinger package ready:
echo   Backend domain: %BACKEND_API_BASE_URL%
echo   Frontend origins: %FRONTEND_ORIGIN%
echo   Output folder: %ROOT%%OUTPUT_ROOT%
exit /b 0
