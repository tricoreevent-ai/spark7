@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "OUTPUT_ROOT=%~1"
if "%OUTPUT_ROOT%"=="" set "OUTPUT_ROOT=production-ready"

call "%~dp0build-deploy.bat" %*
if errorlevel 1 (
  echo Deployment build failed.
  exit /b 1
)

echo.
echo Deployment packages are ready in "%~dp0%OUTPUT_ROOT%".
echo Opening output folder...
start "" explorer "%~dp0%OUTPUT_ROOT%"
exit /b 0
