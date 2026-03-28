@echo off
setlocal enabledelayedexpansion

echo --------------------------------------------------
echo [1/5] Installing electron-builder (dev dependency)
echo --------------------------------------------------
if exist "node_modules\electron-builder" (
  echo electron-builder already present
) else (
  npm install electron-builder --save-dev || goto :fail
)

echo --------------------------------------------------
echo [2/5] Running tests
echo --------------------------------------------------
call npm test || goto :fail

echo --------------------------------------------------
echo [3/5] Building the project
echo --------------------------------------------------
if exist "dist\desktop" rmdir /s /q "dist\desktop"
call npm run build || goto :fail

echo --------------------------------------------------
echo [4/5] Verifying production artifacts
echo --------------------------------------------------
if not exist "dist\client\index.html" (
  echo ERROR: dist\client\index.html not found
  goto :fail
)
if not exist "dist\server\start.js" (
  echo ERROR: dist\server\start.js not found
  goto :fail
)
if not exist "dist\package.json" (
  echo ERROR: dist\package.json not found
  goto :fail
)
if not exist "dist\server\package.json" (
  echo ERROR: dist\server\package.json not found
  goto :fail
)
if not exist "dist\desktop\main\main.js" (
  echo ERROR: dist\desktop\main\main.js not found
  goto :fail
)
if not exist "dist\desktop\package.json" (
  echo ERROR: dist\desktop\package.json not found
  goto :fail
)

echo --------------------------------------------------
echo [5/5] Running electron-builder --win
echo --------------------------------------------------
npx electron-builder --win || goto :fail

echo --------------------------------------------------
echo [Done] Verifying installer executable
echo --------------------------------------------------
for /f %%i in ('node -p "require('./package.json').version"') do set "APP_VERSION=%%i"
set "INSTALLER=installer\SPARK AI Setup !APP_VERSION!.exe"
if exist "%INSTALLER%" (
  echo SUCCESS: Installer created: %INSTALLER%
  echo Done.
  exit /b 0
) else (
  echo ERROR: Installer file not found at %INSTALLER%
  dir installer
  goto :fail
)

:fail
  echo --------------------------------------------------
  echo FAILED: create-windows-installer.bat ended with error.
  echo Please inspect output above and resolve issues.
  exit /b 1
